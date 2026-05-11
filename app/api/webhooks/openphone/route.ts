import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendMessage } from '@/lib/openphone'

const AUTO_REPLY_LEAD = `Hi! Thanks for reaching out. What's your target move-in date and budget? We'll get back to you shortly.`

const KEYWORDS: Record<string, string> = {
  'RENEW': `Great! We'll send your renewal lease shortly.`,
  'LEAVE': `Got it, we'll be in touch about move-out details.`,
  'MAINTENANCE': `Got it! We'll follow up within 24 hours.`,
}

export async function POST(req: Request) {
  const payload = await req.json()
  console.log('OPENPHONE_WEBHOOK', JSON.stringify(payload))
  if (payload.type !== 'message.received') {
    return Response.json({ ok: true, skipped: payload.type })
  }

  const msgObj = payload.data?.object ?? payload.data
  const { from, body, conversationId, media } = msgObj
  const mediaUrls: string[] = Array.isArray(media) ? media.map((m: { url: string }) => m.url).filter(Boolean) : []
  const supabase = await createServerSupabaseClient()

  let { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('phone', from)
    .single()

  if (!contact) {
    const { data: newContact } = await supabase
      .from('contacts')
      .insert({ name: from, phone: from, type: 'ff_lead', source: 'openphone', status: 'active' })
      .select()
      .single()
    contact = newContact
  }

  await supabase.from('messages').insert({
    contact_id: contact.id,
    direction: 'inbound',
    body: body ?? '',
    channel: 'openphone',
    external_id: conversationId,
    is_read: false,
    payload: mediaUrls.length > 0 ? { media: mediaUrls } : null,
  })

  const keyword = (body ?? '').trim().toUpperCase()
  if (KEYWORDS[keyword]) {
    await sendMessage(from, KEYWORDS[keyword])
    if (keyword === 'RENEW') {
      await supabase.from('follow_ups').insert({
        task: `Send renewal lease — ${contact.name}`,
        priority: 'high',
        due_date: new Date().toISOString().split('T')[0],
      })
    }
    if (keyword === 'MAINTENANCE') {
      await supabase.from('maintenance_tickets').insert({
        tenant_name: contact.name,
        issue: 'Tenant reported issue via text — details needed',
        priority: 'normal',
        status: 'open',
      })
    }
  } else if (contact.type === 'ff_lead' && contact.status === 'active') {
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('contact_id', contact.id)
    if (count === 1) {
      await sendMessage(from, AUTO_REPLY_LEAD)
    }
  }

  return Response.json({ ok: true })
}
