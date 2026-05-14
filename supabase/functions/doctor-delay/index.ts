import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { clinic_id, delay_minutes } = await req.json()

    if (!clinic_id || !delay_minutes) {
      return json({ error: 'Missing clinic_id or delay_minutes' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: clinic } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', clinic_id)
      .single()

    // Log the delay event
    await supabase.from('queue_events').insert({
      clinic_id,
      event_type: 'delayed',
      delay_minutes,
    })

    // Get all waiting/ready patients
    const { data: patients } = await supabase
      .from('patients')
      .select('*')
      .eq('clinic_id', clinic_id)
      .in('status', ['waiting', 'ready'])
      .order('token_number', { ascending: true })

    if (!patients || patients.length === 0) {
      return json({ success: true, notified: 0 })
    }

    // Recalculate predictions with delay context using OpenAI
    const predictions = await recalculateWithDelay(supabase, clinic_id, clinic, patients, delay_minutes)

    // Notify all waiting patients
    const appUrl = Deno.env.get('APP_URL') || 'https://nxturn.vercel.app'
    for (const patient of patients) {
      const pred = predictions.find((p: any) => p.patient_id === patient.id) || predictions[patients.indexOf(patient)]
      const newTime = pred?.leave_at || 'updated time TBD'

      const message = `Dr. ${clinic?.doctor_name || 'Doctor'} is running ${delay_minutes} mins late today.\nYour updated leave time is ${newTime}.\nStay comfortable at home — we'll notify you 🙏`

      if (patient.has_whatsapp) {
        await sendWhatsApp(patient.phone, message)
      } else {
        await sendSMS(patient.phone, `${clinic?.name}: Doctor is ${delay_minutes} mins late. New leave time: ${newTime}. Track: ${appUrl}/status/${patient.token_number}`)
      }

      if (pred) {
        await supabase
          .from('patients')
          .update({ leave_at: pred.leave_at, eta_turn: pred.eta_turn })
          .eq('id', patient.id)
      }
    }

    return json({ success: true, notified: patients.length })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})

async function recalculateWithDelay(supabase: any, clinic_id: string, clinic: any, patients: any[], delay_minutes: number) {
  const now = new Date()
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })

  const prompt = `You are a queue prediction engine for a medical clinic.

Doctor: ${clinic?.doctor_name || 'Doctor'}
Current time: ${timeStr}
Day: ${days[now.getDay()]}
IMPORTANT: Doctor is running ${delay_minutes} minutes late. Recalculate all patient notification times.

Waiting patients:
${patients.map((p: any, i: number) => `${i + 1}. ${p.name} — ${p.case_type} — travel time: ${p.travel_mins || 15} mins`).join('\n')}

For each waiting patient, return the exact updated time they should leave home.
Include the ${delay_minutes}-minute delay in your calculations.
Include a 2-minute buffer before their estimated turn.
Return ONLY a JSON array, no explanation:
[
  { "patient_id": "...", "leave_at": "11:13am", "eta_turn": "11:23am" },
  ...
]`

  const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const aiData = await aiRes.json()
  const text = aiData.choices?.[0]?.message?.content || '[]'

  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
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
