import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { clinic_id, patient_id } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const now = new Date()

    // Mark current in_progress patient as seen
    if (patient_id) {
      // Find when that patient's consultation started
      const { data: startEvent } = await supabase
        .from('queue_events')
        .select('timestamp')
        .eq('patient_id', patient_id)
        .eq('event_type', 'in_progress')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single()

      let consultation_duration_mins = null
      if (startEvent) {
        consultation_duration_mins = Math.round(
          (now.getTime() - new Date(startEvent.timestamp).getTime()) / 60000
        )
      }

      await supabase
        .from('patients')
        .update({ status: 'seen' })
        .eq('id', patient_id)

      await supabase.from('queue_events').insert({
        clinic_id,
        patient_id,
        event_type: 'seen',
        consultation_duration_mins,
      })
    }

    // Promote next waiting patient to in_progress
    const { data: nextPatient } = await supabase
      .from('patients')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('status', 'waiting')
      .order('token_number', { ascending: true })
      .limit(1)
      .single()

    if (nextPatient) {
      await supabase
        .from('patients')
        .update({ status: 'in_progress' })
        .eq('id', nextPatient.id)

      await supabase.from('queue_events').insert({
        clinic_id,
        patient_id: nextPatient.id,
        event_type: 'in_progress',
      })
    }

    // Run OpenAI queue recalculation
    const predictions = await recalculateQueue(supabase, clinic_id, now)

    return json({ success: true, predictions })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})

async function recalculateQueue(supabase: any, clinic_id: string, now: Date) {
  const [clinicResult, waitingResult, statsResult] = await Promise.all([
    supabase.from('clinics').select('*').eq('id', clinic_id).single(),
    supabase
      .from('patients')
      .select('*')
      .eq('clinic_id', clinic_id)
      .in('status', ['waiting', 'ready'])
      .order('token_number', { ascending: true }),
    supabase
      .from('queue_events')
      .select('consultation_duration_mins, patients(case_type)')
      .eq('clinic_id', clinic_id)
      .eq('event_type', 'seen')
      .not('consultation_duration_mins', 'is', null)
      .gte('timestamp', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()),
  ])

  const clinic = clinicResult.data
  const waitingPatients = waitingResult.data || []
  if (waitingPatients.length === 0) return []

  // Build per-case-type averages from today's data
  const caseStats: Record<string, { total: number; count: number }> = {}
  for (const ev of statsResult.data || []) {
    const ct = ev.patients?.case_type || 'unknown'
    if (!caseStats[ct]) caseStats[ct] = { total: 0, count: 0 }
    caseStats[ct].total += ev.consultation_duration_mins
    caseStats[ct].count += 1
  }

  const seenToday = (statsResult.data || []).length
  const totalDuration = Object.values(caseStats).reduce((s, v) => s + v.total, 0)
  const avgDuration = seenToday > 0 ? Math.round(totalDuration / seenToday) : 10

  const caseBreakdown = Object.entries(caseStats)
    .map(([type, s]) => `  - ${type}: avg ${Math.round(s.total / s.count)} mins (${s.count} cases)`)
    .join('\n') || '  - No cases completed yet today'

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })

  const prompt = `You are a queue prediction engine for a medical clinic.

Doctor: ${clinic?.doctor_name || 'Doctor'}
Current time: ${timeStr}
Day: ${days[now.getDay()]}
Consultations completed today: ${seenToday}
Average consultation time today: ${avgDuration} mins
Breakdown by case type:
${caseBreakdown}

Waiting patients:
${waitingPatients.map((p: any, i: number) => `${i + 1}. ${p.name} — ${p.case_type} — travel time: ${p.travel_mins || 15} mins`).join('\n')}

For each waiting patient, return the exact time they should leave home.
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

  let predictions: any[] = []
  try {
    predictions = JSON.parse(text)
  } catch {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) predictions = JSON.parse(match[0])
  }

  // Save predictions to patients and send notifications
  for (let i = 0; i < waitingPatients.length; i++) {
    const p = waitingPatients[i]
    const pred = predictions[i] || predictions.find((x: any) => x.patient_id === p.id)
    if (!pred) continue

    await supabase
      .from('patients')
      .update({ leave_at: pred.leave_at, eta_turn: pred.eta_turn })
      .eq('id', p.id)

    // Notify first waiting patient to get ready
    if (i === 0 && p.status === 'waiting') {
      await supabase.from('patients').update({ status: 'ready' }).eq('id', p.id)
      await notifyLeaveNow(supabase, p, pred.leave_at, clinic)
    }
  }

  return predictions
}

async function notifyLeaveNow(supabase: any, patient: any, leaveAt: string, clinic: any) {
  const appUrl = Deno.env.get('APP_URL') || 'https://nxturn.vercel.app'
  const message = `Your turn is approaching — leave by ${leaveAt}.\nHead to ${clinic?.name || 'the clinic'} 🏥\n\nReply:\n1️⃣ On my way\n2️⃣ Need 10 more mins`

  if (patient.has_whatsapp) {
    await sendWhatsApp(patient.phone, message)
  } else {
    const smsMsg = `${clinic?.name}: Leave by ${leaveAt} for your turn. Track: ${appUrl}/status/${patient.token_number}`
    await sendSMS(patient.phone, smsMsg)
  }

  await supabase.from('patients').update({ notified_at: new Date().toISOString() }).eq('id', patient.id)
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
