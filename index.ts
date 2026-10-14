// SherigSpace: upload videos straight into the admin's Google Drive.
//
//   action "init"    (any signed-in user)  → starts a Google Drive upload and returns a one-time upload address.
//                                            The video goes from the visitor's browser straight to Drive (never through this server).
//                                            Contributors' files stay PRIVATE (only the Drive owner can open them).
//   action "publish" (admin only)          → makes one uploaded file "anyone with the link can view" and returns the link.
//
// Secrets to set (see DRIVE_UPLOAD_SETUP.md):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN      (the admin's Google account)
//   DRIVE_MAX_MB            optional, default 300
//   CONTRIB_MAX_PENDING     optional, default 3 (same limit the Contribute form already uses)
import { createSupabaseContext } from 'npm:@supabase/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MAX_MB = Math.max(1, Number(Deno.env.get('DRIVE_MAX_MB') || 300))
const MAX_PENDING = Math.max(1, Number(Deno.env.get('CONTRIB_MAX_PENDING') || 3))
const FOLDER_CONTRIB = 'SherigSpace Contributions'
const FOLDER_ADMIN = 'SherigSpace Admin Uploads'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

let cachedToken: { value: string; exp: number } | null = null
async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value
  const body = new URLSearchParams({
    client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '',
    client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
    refresh_token: Deno.env.get('GOOGLE_REFRESH_TOKEN') || '',
    grant_type: 'refresh_token',
  })
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })
  const j = await r.json().catch(() => ({}))
  if (!j.access_token) throw new Error('Google sign-in failed: ' + (j.error_description || j.error || r.status))
  cachedToken = { value: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3000) * 1000 }
  return j.access_token
}

// With the "drive.file" permission the app only sees folders it made itself, so it finds-or-creates its own folders.
const folderCache: Record<string, string> = {}
async function folderId(token: string, name: string): Promise<string> {
  if (folderCache[name]) return folderCache[name]
  const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const list = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`, { headers: { Authorization: `Bearer ${token}` } })
  const lj = await list.json().catch(() => ({}))
  if (lj.files?.length) return (folderCache[name] = lj.files[0].id)
  const create = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
  })
  const cj = await create.json().catch(() => ({}))
  if (!cj.id) throw new Error('Could not create the Drive folder: ' + JSON.stringify(cj).slice(0, 200))
  return (folderCache[name] = cj.id)
}

const clean = (v: unknown, max = 120) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max)

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
      if (action === 'init') {
        const purpose = clean(body.purpose, 20) === 'admin' ? 'admin' : 'contribution'
        if (purpose === 'admin' && !isAdmin) return json({ ok: false, error: 'Admins only.' }, 403)
        const mime = clean(body.mimeType, 100).toLowerCase()
        const size = Number(body.size) || 0
        if (!mime.startsWith('video/')) return json({ ok: false, error: 'Please choose a video file (MP4, MOV, WebM…).' }, 400)
        if (size <= 0 || size > MAX_MB * 1024 * 1024) return json({ ok: false, error: `The video is too big. Please keep it under ${MAX_MB} MB.` }, 400)

        if (purpose === 'contribution' && !isAdmin) {
          const { count } = await ctx.supabase.from('contributions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending')
          if ((count ?? 0) >= MAX_PENDING) return json({ ok: false, error: `You already have ${MAX_PENDING} submissions waiting for review. Please wait until they are reviewed.` }, 429)
        }

        const token = await accessToken()
        const parent = await folderId(token, purpose === 'admin' ? FOLDER_ADMIN : FOLDER_CONTRIB)
        const origin = /^https?:\/\/[^\/\s]+$/.test(String(body.origin || '')) ? String(body.origin) : ''
        const who = clean(prof?.name || prof?.email || 'unknown', 60)
        const fileName = (purpose === 'admin' ? '' : `[${who}] `) + clean(body.fileName, 150)
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mime,
          'X-Upload-Content-Length': String(size),
        }
        if (origin) headers['Origin'] = origin   // lets the visitor's browser send the file straight to Google
        const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
          method: 'POST', headers,
          body: JSON.stringify({ name: fileName, parents: [parent], description: `Uploaded by ${who} (${clean(prof?.email, 80)}) through SherigSpace` }),
        })
        const uploadUrl = r.headers.get('Location')
        if (!r.ok || !uploadUrl) return json({ ok: false, error: 'Google Drive refused the upload: ' + (await r.text()).slice(0, 200) }, 502)
        return json({ ok: true, uploadUrl })
      }

      if (action === 'publish') {
        if (!isAdmin) return json({ ok: false, error: 'Admins only.' }, 403)
        const fileId = clean(body.fileId, 120)
        if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) return json({ ok: false, error: 'Bad file id.' }, 400)
        const token = await accessToken()
        const info = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,parents`, { headers: { Authorization: `Bearer ${token}` } })
        if (!info.ok) return json({ ok: true, notOurs: true })   // not uploaded through this tool (e.g. a contributor's own link) — nothing to do
        const ij = await info.json()
        const mine = [await folderId(token, FOLDER_CONTRIB), await folderId(token, FOLDER_ADMIN)]
        if (!(ij.parents || []).some((p: string) => mine.includes(p))) return json({ ok: true, notOurs: true })
        const perm = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        })
        if (!perm.ok) return json({ ok: false, error: 'Could not share the file: ' + (await perm.text()).slice(0, 200) }, 502)
        return json({ ok: true, link: `https://drive.google.com/file/d/${fileId}/view` })
      }

      return json({ ok: false, error: 'Unknown action.' }, 400)
    } catch (e) {
      return json({ ok: false, error: String((e as Error)?.message || e) }, 500)
    }
  },
}
