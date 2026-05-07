const PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN!

export async function sendFacebookMessage(recipientId: string, text: string) {
  const res = await fetch(
    'https://graph.facebook.com/v18.0/me/messages',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        access_token: PAGE_TOKEN,
      }),
    }
  )
  return res.json()
}
