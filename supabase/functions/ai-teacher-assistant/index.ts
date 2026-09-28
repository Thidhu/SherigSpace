import { createSupabaseContext } from 'npm:@supabase/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.7-flash'
const DAILY_LIMIT = Math.max(1, Number(Deno.env.get('AI_DAILY_LIMIT') || 20))

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function clampText(value: unknown, max = 6000) {
  return String(value ?? '').trim().slice(0, max)
}

function buildPrompt(mode: string, d: Record<string, unknown>) {
  const classLevel = clampText(d.classLevel, 100) || 'primary school'
  const subject = clampText(d.subject, 120) || 'not specified'
  const topic = clampText(d.topic, 250) || 'not specified'
  const language = clampText(d.language, 80) || 'English'
  const context = clampText(d.context, 2500) || 'none'
  const count = Math.min(20, Math.max(1, Number(d.count) || 5))
  const difficulty = clampText(d.difficulty, 40) || 'Medium'

  const base = `You are an educational assistant for a Bhutanese school teacher. Create practical, age-appropriate material for ${classLevel}. Subject: ${subject}. Topic: ${topic}. Output language: ${language}. Teacher instructions: ${context}. Do not invent official curriculum standards. If the teacher did not provide a standard, do not claim one. Keep the material classroom-ready and clear.`

  if (mode === 'questions' || mode === 'competency') {
    return `${base}\nGenerate exactly ${count} questions. Difficulty: ${difficulty}. ${mode === 'competency' ? 'Prioritize competency/application/scenario-based questions rather than simple recall.' : ''}\nReturn ONLY valid JSON with this exact shape: {"questions":[{"text":"...","type":"choice|truefalse|fillblank|short|long","options":["..."],"correct":0,"accepted_answers":["..."],"points":1}]}. For choice, correct is the zero-based option index. For truefalse, options must be ["True","False"] and correct must be 0 or 1. For fillblank/short, provide accepted_answers. For long, accepted_answers may be []. Use 1 point by default. Do not include markdown fences.`
  }
  if (mode === 'lesson') return `${base}\nCreate a 40-minute lesson plan with: learning objectives, competency focus, prior knowledge, materials, teacher steps, student-centered activities, differentiation/support, formative assessment, and closure. Use headings and concise bullets.`
  if (mode === 'worksheet') return `${base}\nCreate a printable worksheet with a short learner-friendly introduction, varied questions, and a clearly separated answer key at the end.`
  if (mode === 'activity') return `${base}\nCreate 5 student-centered classroom activities. For each give objective, time, materials, steps, and a quick assessment/check for understanding.`
  if (mode === 'rubric') return `${base}\nCreate a 4-level rubric for a classroom task. Use levels: Beginning, Developing, Proficient, Advanced. Include 4-6 criteria with observable descriptors.`
  return `${base}\nExplain or rewrite the topic in simple language suitable for the class level. Include a simple example and 3 quick check questions.`
}

export default {
  async fetch(req: Request) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ ok: false, error: 'POST required' }, 405)

    const { data: ctx, error: authError } = await createSupabaseContext(req, { auth: 'user' })
    if (authError || !ctx?.userClaims?.sub) return json({ ok: false, error: 'You must be signed in.' }, 401)

    const userId = ctx.userClaims.sub
    const { data: teacherClasses, error: classError } = await ctx.supabase
      .from('classes').select('id').eq('teacher_id', userId).limit(1)
    if (classError) return json({ ok: false, error: classError.message }, 500)
    if (!teacherClasses?.length) return json({ ok: false, error: 'AI Teaching Tools are available to teachers with at least one class.' }, 403)

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mode = clampText(body.mode, 30)
    const allowed = ['questions', 'competency', 'lesson', 'worksheet', 'activity', 'rubric', 'simplify']
    if (!allowed.includes(mode)) return json({ ok: false, error: 'Unsupported AI tool.' }, 400)

    const topic = clampText(body.topic, 250)
    if (!topic && mode !== 'lesson') return json({ ok: false, error: 'A topic is required.' }, 400)

    const { count, error: usageError } = await ctx.supabaseAdmin
      .from('ai_usage')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', userId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    if (usageError) return json({ ok: false, error: 'AI usage check failed: ' + usageError.message }, 500)
    if ((count || 0) >= DAILY_LIMIT) return json({ ok: false, error: `Your SherigSpace AI limit is ${DAILY_LIMIT} generations per 24 hours. Try again later.` }, 429)

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) return json({ ok: false, error: 'Gemini is not configured yet. Add GEMINI_API_KEY to Supabase Edge Function secrets.' }, 503)

    const prompt = buildPrompt(mode, body)
    const responseMimeType = ['questions', 'competency'].includes(mode) ? 'application/json' : 'text/plain'
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096, responseMimeType },
      }),
    })

    const geminiData = await geminiRes.json().catch(() => ({}))
    if (!geminiRes.ok) {
      const detail = geminiData?.error?.message || `Gemini returned HTTP ${geminiRes.status}`
      return json({ ok: false, error: detail }, geminiRes.status === 429 ? 429 : 502)
    }

    const text = geminiData?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('')?.trim()
    if (!text) return json({ ok: false, error: 'Gemini returned no content.' }, 502)

    // Record only the teacher and tool type. We intentionally do not store the prompt or student data.
    const { error: recordError } = await ctx.supabaseAdmin.from('ai_usage').insert({ teacher_id: userId, tool: mode })
    if (recordError) console.error('AI usage record failed:', recordError.message)

    if (responseMimeType === 'application/json') {
      try {
        const parsed = JSON.parse(text)
        if (!Array.isArray(parsed?.questions)) throw new Error('No questions array')
        return json({ ok: true, questions: parsed.questions.slice(0, 20), model: MODEL })
      } catch {
        return json({ ok: false, error: 'The AI returned an invalid question format. Please generate again.' }, 502)
      }
    }

    return json({ ok: true, text, model: MODEL })
  },
}
