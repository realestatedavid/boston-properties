import { sendMessage as sendOpenPhone } from '@/lib/openphone'
import { sendFacebookMessage } from '@/lib/facebook'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: Request) {
  const { contactId, body, channel } = await req.json()
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .single()

  if (!contact) return Response.json({ error: 'Contact not found' }, { status: 404 })

  if (channel === 'openphone' && contact.phone) {
    await sendOpenPhone(contact.phone, body)
  } else if (channel === 'facebook' && contact.fb_id) {
    await sendFacebookMessage(contact.fb_id, body)
  }

  await supabase.from('messages').insert({
    contact_id: contactId,
    direction: 'outbound',
    body,
    channel,
    sent_by: user?.id ?? null,
    is_read: true,
  })

  // Update last_contact on the contact
  await supabase
    .from('contacts')
    .update({ last_contact: new Date().toISOString() })
    .eq('id', contactId)

  return Response.json({ ok: true })
}
