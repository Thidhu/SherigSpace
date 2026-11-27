// SherigSpace: contributors upload videos straight to the admin's YouTube channel.
//
//   action "status" (any signed-in user) → tells the website whether YouTube upload is set up.
//   action "init"   (any signed-in user) → starts a YouTube upload and returns a one-time upload address.
//                                          The video goes from the visitor's browser straight to YouTube
//                                          (never through this server), as an UNLISTED video on your channel.
//
// Secrets to set (see YOUTUBE_UPLOAD_SETUP.md):
//   YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN   (the Google account that owns your channel)
//   YOUTUBE_MAX_MB            optional, default 500
//   YOUTUBE_MADE_FOR_KIDS     optional, "true" or "false" (default false)
//   CONTRIB_MAX_PENDING       optional, default 3 (same limits the Contribute form already uses)
//   CONTRIB_MAX_PER_DAY       optional, default 5
import { createSupabaseContext } from 'npm:@supabase/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MAX_MB = Math.max(1, Number(Deno.env.get('YOUTUBE_MAX_MB') || 500))
const MAX_PENDING = Math.max(1, Number(Deno.env.get('CONTRIB_MAX_PENDING') || 3))
const MAX_PER_DAY = Math.max(1, Number(Deno.env.get('CONTRIB_MAX_PER_DAY') || 5))
const MADE_FOR_KIDS = String(Deno.env.get('YOUTUBE_MADE_FOR_KIDS') || 'false').toLowerCase() === 'true'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
const isConfigured = () =>
  !!(Deno.env.get('YOUTUBE_CLIENT_ID') && Deno.env.get('YOUTUBE_CLIENT_SECRET') && Deno.env.get('YOUTUBE_REFRESH_TOKEN'))

let cachedToken: { value: string; exp: number } | null = null
async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value
  const body = new URLSearchParams({
    client_id: Deno.env.get('YOUTUBE_CLIENT_ID') || '',
    client_secret: Deno.env.get('YOUTUBE_CLIENT_SECRET') || '',
    refresh_token: Deno.env.get('YOUTUBE_REFRESH_TOKEN') || '',
    grant_type: 'refresh_token',
  })
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })
  const j = await r.json().catch(() => ({}))
  if (!j.access_token) throw new Error('Google sign-in failed: ' + (j.error_description || j.error || r.status))
  cachedToken = { value: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3000) * 1000 }
  return j.access_token
}

const clean = (v: unknown, max = 120) => String(v ?? '').replace(/[\r\t]+/g, ' ').replace(/[<>]/g, '').trim().slice(0, max)

function friendlyYouTubeError(status: number, text: string): string {
  const t = text.toLowerCase()
  if (t.includes('quotaexceeded') || t.includes('quota')) return 'Our YouTube upload limit for today has been reached. Please try again tomorrow, or use the “YouTube / link” option.'
  if (t.includes('uploadlimitexceeded')) return 'The YouTube channel has reached its daily upload limit. Please try again tomorrow.'
  if (t.includes('youtubesignuprequired') || t.includes('forbidden')) return 'The YouTube channel connection needs to be renewed by the admin.'
  return 'YouTube refused the upload (' + status + '). ' + text.slice(0, 160)
}

export default {
  async fetch(req: Request) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ ok: false, error: 'POST required' }, 405)

    const { data: ctx, error: authError } = await createSupabaseContext(req, { auth: 'user' })
    if (authError || !ctx?.userClaims?.sub) return json({ ok: false, error: 'Please sign in first.' }, 401)
    const userId = ctx.userClaims.sub as string

    const { data: prof } = await ctx.supabase.from('profiles').select('name,email,role').eq('id', userId).maybeSingle()
    const isAdmin = prof?.role === 'admin'
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = clean(body.action, 20)

    try {
      if (action === 'status') return json({ ok: true, ready: isConfigured(), maxMb: MAX_MB })

      if (action === 'init') {
        if (!isConfigured()) return json({ ok: false, error: 'YouTube upload is not set up yet.' }, 503)
        const mime = clean(body.mimeType, 100).toLowerCase()
        const size = Number(body.size) || 0
        if (!mime.startsWith('video/')) return json({ ok: false, error: 'Please choose a video file (MP4, MOV, WebM…).' }, 400)
        if (size <= 0 || size > MAX_MB * 1024 * 1024) return json({ ok: false, error: `The video is too big. Please keep it under ${MAX_MB} MB.` }, 400)

        if (!isAdmin) {
          const { count } = await ctx.supabase.from('contributions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending')
          if ((count ?? 0) >= MAX_PENDING) return json({ ok: false, error: `You already have ${MAX_PENDING} submissions waiting for review. Please wait until they are reviewed.` }, 429)
          const since = new Date(Date.now() - 86400000).toISOString()
          const { count: today } = await ctx.supabase.from('contributions').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since)
          if ((today ?? 0) >= MAX_PER_DAY) return json({ ok: false, error: `You can send up to ${MAX_PER_DAY} contributions a day. Please try again tomorrow.` }, 429)
        }

        const token = await accessToken()
        const origin = /^https?:\/\/[^\/\s]+$/.test(String(body.origin || '')) ? String(body.origin) : ''
        const who = clean(prof?.name || prof?.email || 'a contributor', 60)
        const title = clean(body.title, 90) || 'SherigSpace contribution'
        const description = clean(body.description, 3500)
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mime,
          'X-Upload-Content-Length': String(size),
        }
        if (origin) headers['Origin'] = origin   // lets the visitor's browser send the file straight to YouTube
        const r = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
          method: 'POST', headers,
          body: JSON.stringify({
            snippet: {
              title,
              description: (description ? description + '\n\n' : '') + `Contributed by ${who} on SherigSpace (sherigspace.com)`,
              categoryId: '27',            // Education
              tags: ['SherigSpace'],
            },
            // UNLISTED: only people with the link can watch it, it works inside the site, and it stays off your public channel page
            status: { privacyStatus: 'unlisted', embeddable: true, selfDeclaredMadeForKids: MADE_FOR_KIDS },
          }),
        })
        const uploadUrl = r.headers.get('Location')
        if (!r.ok || !uploadUrl) return json({ ok: false, error: friendlyYouTubeError(r.status, await r.text()) }, 502)
        return json({ ok: true, uploadUrl })
      }

      return json({ ok: false, error: 'Unknown action.' }, 400)
    } catch (e) {
      return json({ ok: false, error: String((e as Error)?.message || e) }, 500)
    }
  },
}
