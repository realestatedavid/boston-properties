const OPENPHONE_API_KEY = process.env.OPENPHONE_API_KEY!
const BASE = 'https://api.openphone.com/v1'

export async function sendMessage(to: string, text: string) {
  const res = await fetch(`${BASE}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': OPENPHONE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: [to],
      content: text,
      from: process.env.OPENPHONE_PHONE_NUMBER_ID,
    }),
  })
  return res.json()
}

export async function getMessages(phoneNumber: string) {
  const res = await fetch(
    `${BASE}/messages?participants=${phoneNumber}`,
    { headers: { 'Authorization': OPENPHONE_API_KEY } }
  )
  return res.json()
}
