import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  // WhatsApp webhook verification (GET)
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === Deno.env.get('WHATSAPP_VERIFY_TOKEN')) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const entry = body.entry?.[0]
    const change = entry?.changes?.[0]
    const value = change?.value
    const messages = value?.messages

    if (!messages || messages.length === 0) {
      return new Response('ok', { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    for (const msg of messages) {
      if (msg.type !== 'text') continue
      const fromPhone = msg.from
      const text = msg.text?.body?.trim() || ''

      // Find patient by phone (normalize to digits only)
      const digits = fromPhone.replace(/\D/g, '')
      const { data: patient } = await supabase
        .from('patients')
        .select('*, clinics(*)')
        .or(`phone.eq.${digits},phone.eq.+${digits}`)
        .in('status', ['waiting', 'ready', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!patient) continue

      if (text === '1' || text.toLowerCase().includes('on my way') || text.toLowerCase().includes('coming')) {
        // Keep queue as is — just acknowledge
        await sendWhatsApp(fromPhone, `Got it! See you soon at ${patient.clinics?.name || 'the clinic'} 🏥`)
      } else if (text === '2' || text.toLowerCase().includes('need') || text.toLowerCase().includes('more time') || text.toLowerCase().includes('late')) {
        // Mark patient as needing more time and reshuffle
        await supabase.from('queue_events').insert({
          clinic_id: patient.clinic_id,
          patient_id: patient.id,
          event_type: 'late',
        })

        // Call mark-seen logic to reshuffle (promote next patient if needed)
        await sendWhatsApp(fromPhone, `No problem! We'll adjust the queue. We'll message you when it's your turn again 🙏`)

        // Notify clinic (future: push to receptionist screen)
        await supabase.from('patients').update({ status: 'waiting' }).eq('id', patient.id)
      }
    }

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error(err)
    return new Response('ok', { status: 200 }) // Always return 200 to WhatsApp
  }
})

async function sendWhatsApp(phone: string, message: string) {
  const token = Deno.env.get('WHATSAPP_TOKEN')
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
  if (!token || !phoneNumberId) return

  await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone.replace(/\D/g, ''),
      type: 'text',
      text: { body: message },
    }),
  })
}
