import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { clinic_id, name, phone, case_type, has_whatsapp } = await req.json()

    if (!clinic_id || !name || !phone || !case_type) {
      return json({ error: 'Missing required fields' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get next token number for this clinic today
    const today = new Date().toISOString().split('T')[0]
    const { count } = await supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinic_id)
      .gte('created_at', `${today}T00:00:00`)

    const token_number = (count || 0) + 1

    const { data: patient, error } = await supabase
      .from('patients')
      .insert({ clinic_id, name, phone, case_type, has_whatsapp, token_number, status: 'waiting' })
      .select()
      .single()

    if (error) throw error

    // Log registration event
    await supabase.from('queue_events').insert({
      clinic_id,
      patient_id: patient.id,
      event_type: 'registered',
    })

    // Send registration notification
    await sendRegistrationNotification(supabase, patient, clinic_id)

    return json({ token_number, patient_id: patient.id })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})

async function sendRegistrationNotification(supabase: any, patient: any, clinic_id: string) {
  const { data: clinic } = await supabase
    .from('clinics')
    .select('name')
    .eq('id', clinic_id)
    .single()

  const appUrl = Deno.env.get('APP_URL') || 'https://nxturn.vercel.app'
  const statusUrl = `${appUrl}/status/${patient.token_number}`

  const message = patient.has_whatsapp
    ? `Hi ${patient.name}, you're registered at ${clinic?.name || 'the clinic'}.\nToken number: #${patient.token_number}\nTrack your turn live here: ${statusUrl}\nWe'll message you when it's time to leave home 🏥`
    : `${clinic?.name || 'Clinic'}: Hi ${patient.name}, token #${patient.token_number}.\nTrack your turn: ${statusUrl}\nWe'll SMS you when to leave.`

  if (patient.has_whatsapp) {
    await sendWhatsApp(patient.phone, message)
  } else {
    await sendSMS(patient.phone, message)
  }
}

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

async function sendSMS(phone: string, message: string) {
  const authKey = Deno.env.get('MSG91_AUTH_KEY')
  const senderId = Deno.env.get('MSG91_SENDER_ID') || 'NXTRN'
  if (!authKey) return

  await fetch('https://api.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authkey: authKey },
    body: JSON.stringify({
      template_id: Deno.env.get('MSG91_TEMPLATE_ID') || '',
      sender: senderId,
      mobiles: phone.replace(/\D/g, ''),
      VAR1: message,
    }),
  })
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
