import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(req: Request) {
  const body = await req.json()
  const messaging = body.entry?.[0]?.messaging?.[0]
  if (!messaging?.message?.text) return Response.json({ ok: true })

  const { sender, message } = messaging
  const supabase = await createServerSupabaseClient()

  let { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('fb_id', sender.id)
    .single()

  if (!contact) {
    const { data: newContact } = await supabase
      .from('contacts')
      .insert({
        name: `Facebook User ${sender.id.slice(-4)}`,
        fb_id: sender.id,
        type: 'ff_lead',
        source: 'facebook',
        status: 'active',
      })
      .select()
      .single()
    contact = newContact
  }

  await supabase.from('messages').insert({
    contact_id: contact.id,
    direction: 'inbound',
    body: message.text,
    channel: 'facebook',
    external_id: message.mid,
    is_read: false,
  })

  return Response.json({ ok: true })
}
