import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Internal function — called by other edge functions to send a notification
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { patient_id, message_type, extra } = await req.json()
    // message_type: 'registration' | 'leave_now' | 'delay_update' | 'custom'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: patient } = await supabase
      .from('patients')
      .select('*, clinics(*)')
      .eq('id', patient_id)
      .single()

    if (!patient) return json({ error: 'Patient not found' }, 404)

    const appUrl = Deno.env.get('APP_URL') || 'https://nxturn.vercel.app'
    const statusUrl = `${appUrl}/status/${patient.token_number}`
    const clinicName = patient.clinics?.name || 'the clinic'
    const doctorName = patient.clinics?.doctor_name || 'Doctor'

    let whatsappMsg = ''
    let smsMsg = ''

    switch (message_type) {
      case 'registration':
        whatsappMsg = `Hi ${patient.name}, you're registered at ${clinicName}.\nToken number: #${patient.token_number}\nTrack your turn live here: ${statusUrl}\nWe'll message you when it's time to leave home 🏥`
        smsMsg = `${clinicName}: Hi ${patient.name}, token #${patient.token_number}. Track: ${statusUrl}`
        break

      case 'leave_now':
        whatsappMsg = `Your turn is approaching — leave by ${extra?.leave_at || 'now'}.\nHead to ${clinicName} 🏥\n\nReply:\n1️⃣ On my way\n2️⃣ Need 10 more mins`
        smsMsg = `${clinicName}: Head to clinic now! Your turn is at ${extra?.eta_turn || 'soon'}. Track: ${statusUrl}`
        break

      case 'delay_update':
        whatsappMsg = `Dr. ${doctorName} is running ${extra?.delay_minutes} mins late today.\nYour updated leave time is ${extra?.leave_at || 'TBD'}.\nStay comfortable at home — we'll notify you 🙏`
        smsMsg = `${clinicName}: Doctor is ${extra?.delay_minutes} mins late. New leave time: ${extra?.leave_at || 'TBD'}. Track: ${statusUrl}`
        break

      case 'custom':
        whatsappMsg = extra?.message || ''
        smsMsg = extra?.message || ''
        break

      default:
        return json({ error: 'Unknown message_type' }, 400)
    }

    if (patient.has_whatsapp && whatsappMsg) {
      await sendWhatsApp(patient.phone, whatsappMsg)
    } else if (!patient.has_whatsapp && smsMsg) {
      await sendSMS(patient.phone, smsMsg)
    }

    await supabase.from('patients').update({ notified_at: new Date().toISOString() }).eq('id', patient_id)

    return json({ success: true })
  } catch (err) {
    return json({ error: err.message }, 500)
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

async function sendSMS(phone: string, message: string) {
  const authKey = Deno.env.get('MSG91_AUTH_KEY')
  if (!authKey) return
  await fetch('https://api.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authkey: authKey },
    body: JSON.stringify({
      sender: Deno.env.get('MSG91_SENDER_ID') || 'NXTRN',
      mobiles: phone.replace(/\D/g, ''),
      message,
    }),
  })
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
