import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: './supabase/functions/.env' })

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY,
  WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  APP_URL = 'http://localhost:5173',
} = process.env

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const app = express()

function fmtTime24(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${ampm}`
}
app.use(cors({ origin: '*' }))
app.use(express.json())

// ─── Register patient ──────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { clinic_id, name, phone, case_type, has_whatsapp, symptoms = [], appointment_date, travel_mins = 15, notes = '', priority = false } = req.body
  try {
    const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const { count } = await supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinic_id)
      .eq('appointment_date', appointment_date || todayIST)

    const token_number = (count || 0) + 1

    const { data: patient, error } = await supabase
      .from('patients')
      .insert({ clinic_id, name, phone, case_type, has_whatsapp, symptoms, appointment_date, token_number, status: 'waiting', travel_mins, notes, priority })
      .select()
      .single()

    if (error) throw error

    await supabase.from('queue_events').insert({
      clinic_id,
      patient_id: patient.id,
      event_type: 'registered',
    })

    // Run AI prediction immediately — saves eta_turn to all waiting patients
    const predictions = await runQueuePrediction(clinic_id, new Date())

    const { data: clinic } = await supabase.from('clinics').select('name').eq('id', clinic_id).single()
    const statusUrl = `${APP_URL}/status/${token_number}`

    // Find this patient's prediction
    const myPred = predictions.find((p) => p.patient_id === patient.id)
    const timeHint = myPred?.eta_turn ? `\nYour estimated turn: ${myPred.eta_turn}` : ''

    const msg = `Hi ${name}! You're registered at ${clinic?.name || 'the clinic'}.

Token number: *#${token_number}*${timeHint}

Track your turn live:
${statusUrl}

We'll message you when it's your turn 🏥`

    if (has_whatsapp) await sendWhatsApp(phone, msg)

    res.json({ token_number, patient_id: patient.id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Mark seen → next ─────────────────────────────────────────────────────
app.post('/api/mark-seen', async (req, res) => {
  const { clinic_id, patient_id } = req.body
  const now = new Date()

  try {
    // Mark current patient seen
    if (patient_id) {
      const { data: startEvent } = await supabase
        .from('queue_events')
        .select('timestamp')
        .eq('patient_id', patient_id)
        .eq('event_type', 'in_progress')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single()

      const duration = startEvent
        ? Math.round((now - new Date(startEvent.timestamp)) / 60000)
        : null

      await supabase.from('patients').update({ status: 'seen' }).eq('id', patient_id)
      await supabase.from('queue_events').insert({
        clinic_id,
        patient_id,
        event_type: 'seen',
        consultation_duration_mins: duration,
      })
    }

    // Get waiting queue
    const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const { data: waiting } = await supabase
      .from('patients')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('appointment_date', todayIST)
      .eq('status', 'waiting')
      .order('token_number', { ascending: true })

    // Promote first waiting → in_progress
    if (waiting?.length > 0) {
      await supabase.from('patients').update({ status: 'in_progress' }).eq('id', waiting[0].id)
      await supabase.from('queue_events').insert({
        clinic_id,
        patient_id: waiting[0].id,
        event_type: 'in_progress',
      })
    }

    // Run AI predictions for remaining queue
    const predictions = await runQueuePrediction(clinic_id, now)

    // Notify the next-up patient (second in line → now "ready")
    if (waiting?.length > 1) {
      const readyPatient = waiting[1]
      const pred = predictions.find((p) => p.patient_id === readyPatient.id) || predictions[0]
      await supabase.from('patients').update({ status: 'ready' }).eq('id', readyPatient.id)

      if (pred) {
        await supabase
          .from('patients')
          .update({ eta_turn: pred.eta_turn })
          .eq('id', readyPatient.id)

        const { data: clinic } = await supabase.from('clinics').select('name').eq('id', clinic_id).single()
        const msg = `Your turn is at *${pred.eta_turn}* 🏥\nHead to ${clinic?.name || 'the clinic'} now.\n\nReply:\n1️⃣ On my way\n2️⃣ Need 10 more mins`
        if (readyPatient.has_whatsapp) await sendWhatsApp(readyPatient.phone, msg)
      }
    }

    res.json({ success: true, predictions })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Doctor delay ─────────────────────────────────────────────────────────
app.post('/api/doctor-delay', async (req, res) => {
  const { clinic_id, delay_minutes } = req.body
  try {
    await supabase.from('queue_events').insert({ clinic_id, event_type: 'delayed', delay_minutes })

    const { data: clinic } = await supabase.from('clinics').select('*').eq('id', clinic_id).single()
    const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const { data: patients } = await supabase
      .from('patients')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('appointment_date', todayIST)
      .in('status', ['waiting', 'ready'])
      .order('token_number', { ascending: true })

    if (!patients?.length) return res.json({ success: true, notified: 0 })

    const predictions = await runDelayPrediction(clinic, patients, delay_minutes)

    for (let i = 0; i < patients.length; i++) {
      const patient = patients[i]
      const pred = predictions[i]
      const msg = `⚠️ Dr. ${clinic?.doctor_name || 'Doctor'} is running *${delay_minutes} mins late* today.\n\nYour updated turn time: *${pred?.eta_turn || 'TBD'}*\n\nStay home — we'll notify you when it's time 🙏`
      if (patient.has_whatsapp) await sendWhatsApp(patient.phone, msg)
      if (pred) {
        await supabase
          .from('patients')
          .update({ eta_turn: pred.eta_turn })
          .eq('id', patient.id)
      }
    }

    res.json({ success: true, notified: patients.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── AI helpers ───────────────────────────────────────────────────────────
async function runQueuePrediction(clinic_id, now) {
  const IST = { timeZone: 'Asia/Kolkata' }
  const todayIST = now.toLocaleDateString('en-CA', IST)
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayIndex = new Date(now.toLocaleString('en-US', IST)).getDay()
  const dayName = days[dayIndex]
  const hourIST = new Date(now.toLocaleString('en-US', IST)).getHours()
  const sessionPeriod = hourIST < 12 ? 'morning' : hourIST < 17 ? 'afternoon' : 'evening'

  // 30 days ago for historical queries
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: clinic },
    { data: waiting },
    { data: todayEvents },
    { data: recentEvents },       // Last 30 days — for day-of-week + time-of-day patterns
    { data: noShowEvents },       // No-show history
  ] = await Promise.all([
    supabase.from('clinics').select('*').eq('id', clinic_id).single(),
    supabase.from('patients').select('*').eq('clinic_id', clinic_id)
      .eq('appointment_date', todayIST).in('status', ['waiting', 'ready'])
      .order('token_number', { ascending: true }),
    supabase.from('queue_events')
      .select('consultation_duration_mins, timestamp, patients(case_type, symptoms)')
      .eq('clinic_id', clinic_id).eq('event_type', 'seen')
      .not('consultation_duration_mins', 'is', null)
      .gte('timestamp', `${todayIST}T00:00:00`),
    supabase.from('queue_events')
      .select('consultation_duration_mins, timestamp, patients(case_type, symptoms)')
      .eq('clinic_id', clinic_id).eq('event_type', 'seen')
      .not('consultation_duration_mins', 'is', null)
      .gte('timestamp', thirtyDaysAgo)
      .order('timestamp', { ascending: false })
      .limit(500),
    supabase.from('queue_events')
      .select('patient_id, patients(phone)')
      .eq('clinic_id', clinic_id).eq('event_type', 'no_show')
      .gte('timestamp', thirtyDaysAgo),
  ])

  if (!waiting?.length) return []

  // ── Today's session pace ────────────────────────────────────────────────
  const caseStats = {}
  for (const ev of todayEvents || []) {
    const ct = ev.patients?.case_type || 'unknown'
    if (!caseStats[ct]) caseStats[ct] = { total: 0, count: 0 }
    caseStats[ct].total += ev.consultation_duration_mins
    caseStats[ct].count++
  }
  const seenToday = todayEvents?.length || 0
  const avgToday = seenToday > 0
    ? Math.round(Object.values(caseStats).reduce((s, v) => s + v.total, 0) / seenToday)
    : null
  const todayBreakdown = Object.entries(caseStats)
    .map(([t, s]) => `  - ${t}: avg ${Math.round(s.total / s.count)} mins (${s.count} cases)`)
    .join('\n') || '  - Session just started'

  // ── Day-of-week pattern (same weekday, last 30 days) ───────────────────
  const dowEvents = (recentEvents || []).filter(ev => {
    const d = new Date(ev.timestamp)
    return new Date(d.toLocaleString('en-US', IST)).getDay() === dayIndex
  })
  const dowAvg = dowEvents.length > 0
    ? Math.round(dowEvents.reduce((s, e) => s + e.consultation_duration_mins, 0) / dowEvents.length)
    : null
  const dowNote = dowAvg
    ? `Historical avg on ${dayName}s: ${dowAvg} mins/patient (${dowEvents.length} past sessions)`
    : `No historical data for ${dayName}s yet`

  // ── Time-of-day pattern (same session period, last 30 days) ────────────
  const periodBounds = { morning: [6, 12], afternoon: [12, 17], evening: [17, 24] }
  const [pStart, pEnd] = periodBounds[sessionPeriod]
  const periodEvents = (recentEvents || []).filter(ev => {
    const h = new Date(new Date(ev.timestamp).toLocaleString('en-US', IST)).getHours()
    return h >= pStart && h < pEnd
  })
  const periodAvg = periodEvents.length > 0
    ? Math.round(periodEvents.reduce((s, e) => s + e.consultation_duration_mins, 0) / periodEvents.length)
    : null
  const periodNote = periodAvg
    ? `Historical avg in ${sessionPeriod} sessions: ${periodAvg} mins/patient (${periodEvents.length} cases)`
    : `No historical data for ${sessionPeriod} sessions yet`

  // ── Symptom complexity scores (all-time) ────────────────────────────────
  const symptomStats = {}
  for (const ev of recentEvents || []) {
    for (const sym of ev.patients?.symptoms || []) {
      if (!symptomStats[sym]) symptomStats[sym] = { total: 0, count: 0 }
      symptomStats[sym].total += ev.consultation_duration_mins
      symptomStats[sym].count++
    }
  }
  const symptomBreakdown = Object.entries(symptomStats)
    .sort((a, b) => b[1].count - a[1].count).slice(0, 10)
    .map(([s, v]) => `  - ${s}: avg ${Math.round(v.total / v.count)} mins (${v.count} cases)`)
    .join('\n') || '  - No symptom data yet'

  // ── No-show risk — phones that have no-showed before ───────────────────
  const noShowPhones = new Set(
    (noShowEvents || []).map(e => e.patients?.phone).filter(Boolean)
  )

  // ── Sort: priority patients first ───────────────────────────────────────
  const sortedWaiting = [...waiting].sort((a, b) => {
    if (a.priority && !b.priority) return -1
    if (!a.priority && b.priority) return 1
    return a.token_number - b.token_number
  })

  // ── Build waiting patient lines with flags ──────────────────────────────
  const patientLines = sortedWaiting.map((p, i) => {
    const symptoms = p.symptoms?.length ? `symptoms: ${p.symptoms.join(', ')}` : 'no symptoms recorded'

    // Complexity flag: estimate based on symptom avg vs overall avg
    const baseline = avgToday || dowAvg || periodAvg || 10
    const symptomAvgs = (p.symptoms || [])
      .filter(s => symptomStats[s])
      .map(s => symptomStats[s].total / symptomStats[s].count)
    const estimatedDur = symptomAvgs.length > 0
      ? Math.round(symptomAvgs.reduce((a, b) => a + b, 0) / symptomAvgs.length)
      : null

    const flags = []
    if (p.priority) flags.push('PRIORITY PATIENT: must be seen first')
    if (noShowPhones.has(p.phone)) flags.push('NO-SHOW RISK: has missed appointments before')
    if (estimatedDur && estimatedDur > baseline * 1.3) flags.push(`COMPLEX CASE: symptom history suggests ~${estimatedDur} mins`)
    if (estimatedDur && estimatedDur < baseline * 0.6) flags.push(`QUICK CASE: symptom history suggests ~${estimatedDur} mins`)
    if (p.case_type === 'new_patient') flags.push('NEW PATIENT: typically takes longer')
    if (p.notes) flags.push(`NOTE: ${p.notes}`)

    const travelStr = `travel time: ${p.travel_mins || 15} mins`
    const flagStr = flags.length ? `\n   [${flags.join(' | ')}]` : ''
    return `${i + 1}. [id:${p.id}] ${p.name} — ${p.case_type} — ${symptoms} — ${travelStr}${flagStr}`
  }).join('\n')

  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, ...IST })

  // Calculate the effective session start (respects visiting hours + any active delay)
  let sessionStartMins = null
  let sessionEndMins = null
  let nowMins = new Date(now.toLocaleString('en-US', IST)).getHours() * 60 + new Date(now.toLocaleString('en-US', IST)).getMinutes()

  if (clinic?.visiting_start && clinic?.visiting_end) {
    const [sh, sm] = clinic.visiting_start.split(':').map(Number)
    const [eh, em] = clinic.visiting_end.split(':').map(Number)
    sessionStartMins = sh * 60 + sm
    sessionEndMins = eh * 60 + em
  }

  // Effective start = visiting_start OR current time if already in session
  const effectiveStartMins = sessionStartMins !== null
    ? Math.max(sessionStartMins, nowMins > sessionStartMins ? nowMins : sessionStartMins)
    : nowMins

  const toTime12h = (totalMins) => {
    const h = Math.floor(totalMins / 60) % 24
    const m = totalMins % 60
    const ampm = h >= 12 ? 'pm' : 'am'
    return `${h % 12 || 12}:${String(m).padStart(2, '0')}${ampm}`
  }

  const sessionContext = sessionStartMins !== null ? `Doctor visiting hours: ${fmtTime24(clinic.visiting_start)} to ${fmtTime24(clinic.visiting_end)}
Session starts at: ${toTime12h(sessionStartMins)}
Effective first patient turn starts at: ${toTime12h(effectiveStartMins)}
${nowMins < sessionStartMins ? `NOTE: Current time (${timeStr}) is BEFORE the session. ALL predictions must start from ${toTime12h(sessionStartMins)} or later. Do NOT predict any time before ${toTime12h(sessionStartMins)}.` : `Session is currently active.`}` : `Doctor is in session. Current time: ${timeStr}`

  const prompt = `You are an expert queue prediction engine for a medical clinic.

Doctor: ${clinic?.doctor_name || 'Doctor'}
Current time: ${timeStr}
Day: ${dayName}
${sessionContext}

--- Today's Session ---
Patients seen today: ${seenToday}
${avgToday ? `Average consultation time today: ${avgToday} mins` : 'No consultations completed yet — use historical averages'}
Breakdown by case type:
${todayBreakdown}

--- Historical Patterns (last 30 days) ---
${dowNote}
${periodNote}

--- Symptom-based Duration History ---
${symptomBreakdown}

--- Waiting Patients (in order) ---
${patientLines}

Instructions:
- CRITICAL: The first patient's turn is at ${toTime12h(effectiveStartMins)}. All subsequent turns follow from there.
- Use avg consultation time per case type and symptom history to estimate each patient's duration.
- PRIORITY patients are listed first — they are seen before others regardless of token number.
- Add 3-5 extra mins for NEW PATIENT vs follow-up.
- COMPLEX CASE patients take longer; QUICK CASE take less.
- NO-SHOW RISK: still schedule them but they may not appear.
- Return times in 12-hour IST format (e.g. "5:20pm"). Never predict before ${toTime12h(sessionStartMins ?? effectiveStartMins)}.

Return ONLY a JSON array, no explanation:
[{ "patient_id": "exact-id-from-above", "eta_turn": "5:20pm" }]`

  const predictions = await callOpenAI(prompt)
  console.log(`AI returned ${predictions.length} predictions:`, JSON.stringify(predictions.slice(0, 3)))

  let saved = 0
  for (let i = 0; i < sortedWaiting.length; i++) {
    const patient = sortedWaiting[i]
    // Index-based match first (most reliable), then try patient_id
    const pred = predictions[i] ?? predictions.find((p) => p.patient_id === patient.id)
    if (!pred?.eta_turn) {
      console.log(`No prediction for patient ${i} (${patient.name})`)
      continue
    }
    const { error } = await supabase.from('patients').update({ eta_turn: pred.eta_turn }).eq('id', patient.id)
    if (error) console.error(`Failed to save eta_turn for ${patient.name}:`, error.message)
    else { console.log(`Saved: ${patient.name} -> ${pred.eta_turn}`); saved++ }
  }
  console.log(`Saved ${saved}/${sortedWaiting.length} predictions`)

  return predictions
}

async function runDelayPrediction(clinic, patients, delay_minutes) {
  const now = new Date()
  const IST = { timeZone: 'Asia/Kolkata' }
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, ...IST })
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const day = days[new Date(now.toLocaleString('en-US', IST)).getDay()]

  const delayedStartStr = clinic?.visiting_start
    ? (() => { const [h, m] = clinic.visiting_start.split(':').map(Number); const t = h * 60 + m + delay_minutes; return `${Math.floor(t/60) % 12 || 12}:${String(t%60).padStart(2,'0')}${Math.floor(t/60) >= 12 ? 'pm' : 'am'}` })()
    : null

  const prompt = `You are a queue prediction engine for a medical clinic.

Doctor: ${clinic?.doctor_name || 'Doctor'}
Current time: ${timeStr}
Day: ${day}
${clinic?.visiting_start ? `Doctor visiting hours: ${fmtTime24(clinic.visiting_start)} to ${fmtTime24(clinic.visiting_end)}` : ''}
IMPORTANT: Doctor is running ${delay_minutes} minutes late.
${delayedStartStr ? `Session now starts at ${delayedStartStr}. All turn times must be at or after ${delayedStartStr}.` : ''}
Recalculate all patient turn times.

Waiting patients:
${patients.map((p, i) => `${i + 1}. ${p.name} — ${p.case_type} — travel time: ${p.travel_mins || 15} mins`).join('\n')}

Return ONLY a JSON array, no explanation:
[{ "patient_id": "uuid-here", "eta_turn": "5:20pm" }]`

  return callOpenAI(prompt)
}

async function callOpenAI(prompt) {
  if (!OPENAI_API_KEY) { console.warn('OPENAI_API_KEY not set'); return [] }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
  })
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content || '[]'
  try { return JSON.parse(text) } catch { const m = text.match(/\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : [] }
}

async function sendWhatsApp(phone, message) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) { console.warn('WhatsApp not configured'); return }
  const to = phone.replace(/\D/g, '')
  console.log(`→ WhatsApp to: ${to}`)
  const r = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: message } }),
  })
  const d = await r.json()
  if (!r.ok) console.error('WhatsApp error:', d)
}

// ─── Cancel appointment ───────────────────────────────────────────────────
app.post('/api/cancel', async (req, res) => {
  const { token_number } = req.body
  try {
    // Find patient
    const { data: patient, error } = await supabase
      .from('patients')
      .select('*')
      .eq('token_number', token_number)
      .in('status', ['waiting', 'ready'])
      .single()

    if (error || !patient) {
      return res.status(404).json({ error: 'Patient not found or already cannot be cancelled' })
    }

    // Mark cancelled and log event
    await supabase.from('patients').update({ status: 'cancelled' }).eq('id', patient.id)
    await supabase.from('queue_events').insert({
      clinic_id: patient.clinic_id,
      patient_id: patient.id,
      event_type: 'no_show',
    })

    // If they were "ready" (second in line), promote next waiting patient
    if (patient.status === 'ready') {
      const { data: nextWaiting } = await supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', patient.clinic_id)
        .eq('status', 'waiting')
        .order('token_number', { ascending: true })
        .limit(1)
        .single()

      if (nextWaiting) {
        await supabase.from('patients').update({ status: 'ready' }).eq('id', nextWaiting.id)
      }
    }

    // Recalculate queue for remaining patients
    await runQueuePrediction(patient.clinic_id, new Date())

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── WhatsApp webhook ─────────────────────────────────────────────────────
app.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✓ WhatsApp webhook verified')
    return res.send(challenge)
  }
  res.sendStatus(403)
})

app.post('/webhook/whatsapp', async (req, res) => {
  res.sendStatus(200) // Always respond immediately to WhatsApp
  try {
    const messages = req.body?.entry?.[0]?.changes?.[0]?.value?.messages
    if (!messages?.length) return

    for (const msg of messages) {
      if (msg.type !== 'text') continue
      const fromPhone = msg.from
      const text = msg.text?.body?.trim().toLowerCase() || ''
      const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

      // Find today's active patient by phone
      const { data: patient } = await supabase
        .from('patients')
        .select('*')
        .or(`phone.eq.${fromPhone},phone.eq.+${fromPhone}`)
        .eq('appointment_date', todayIST)
        .in('status', ['waiting', 'ready'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!patient) continue

      const isOnMyWay = text === '1' || text.includes('on my way') || text.includes('coming') || text.includes('ok')
      const isNeedMore = text === '2' || text.includes('need') || text.includes('more time') || text.includes('late') || text.includes('wait')

      if (isOnMyWay) {
        await sendWhatsApp(fromPhone, `Got it! See you soon at the clinic 🏥`)

      } else if (isNeedMore) {
        // Move patient to end of today's queue
        const { data: last } = await supabase
          .from('patients')
          .select('token_number')
          .eq('clinic_id', patient.clinic_id)
          .eq('appointment_date', todayIST)
          .in('status', ['waiting', 'ready'])
          .neq('id', patient.id)
          .order('token_number', { ascending: false })
          .limit(1)
          .single()

        const newToken = (last?.token_number || patient.token_number) + 1

        await supabase
          .from('patients')
          .update({ token_number: newToken, status: 'waiting', eta_turn: null })
          .eq('id', patient.id)

        await supabase.from('queue_events').insert({
          clinic_id: patient.clinic_id,
          patient_id: patient.id,
          event_type: 'late',
        })

        // Recalculate for everyone
        await runQueuePrediction(patient.clinic_id, new Date())

        await sendWhatsApp(fromPhone, `No problem! You've been moved to the end of the queue.\nWe'll message you when it's your turn again 🙏`)
        console.log(`Patient ${patient.name} moved to end of queue (token ${newToken})`)
      }
    }
  } catch (err) {
    console.error('Webhook error:', err)
  }
})

// ─── Test WhatsApp (dev only) ─────────────────────────────────────────────
app.post('/api/test-whatsapp', async (req, res) => {
  const { phone } = req.body
  if (!phone) return res.status(400).json({ error: 'phone required' })
  await sendWhatsApp(phone, `✅ Nxturn WhatsApp test — connection working! (${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })})`)
  res.json({ sent: true, to: phone })
})

// ─── Recalculate predictions on demand ────────────────────────────────────
app.post('/api/recalculate', async (req, res) => {
  const { clinic_id } = req.body
  try {
    const predictions = await runQueuePrediction(clinic_id, new Date())
    res.json({ success: true, updated: predictions.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Feature: Queue pause / resume ────────────────────────────────────────
app.post('/api/pause', async (req, res) => {
  const { clinic_id } = req.body
  try {
    const { data: clinic } = await supabase.from('clinics').select('is_paused').eq('id', clinic_id).single()
    const nowPaused = !clinic?.is_paused
    await supabase.from('clinics').update({
      is_paused: nowPaused,
      paused_at: nowPaused ? new Date().toISOString() : null,
    }).eq('id', clinic_id)
    res.json({ is_paused: nowPaused })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── Feature: Patient feedback ─────────────────────────────────────────────
app.post('/api/feedback', async (req, res) => {
  const { token_number, feedback } = req.body // feedback: 1=good 2=ok 3=poor
  try {
    await supabase.from('patients').update({ feedback }).eq('token_number', token_number)
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── Feature: Doctor absent — bulk cancel ─────────────────────────────────
app.post('/api/bulk-cancel', async (req, res) => {
  const { clinic_id } = req.body
  try {
    const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const { data: clinic } = await supabase.from('clinics').select('*').eq('id', clinic_id).single()
    const { data: patients } = await supabase.from('patients').select('*')
      .eq('clinic_id', clinic_id).eq('appointment_date', todayIST)
      .in('status', ['waiting', 'ready', 'in_progress'])

    if (!patients?.length) return res.json({ cancelled: 0 })

    await supabase.from('patients').update({ status: 'cancelled' })
      .eq('clinic_id', clinic_id).eq('appointment_date', todayIST)
      .in('status', ['waiting', 'ready', 'in_progress'])

    for (const p of patients) {
      const msg = `Hi ${p.name}, unfortunately Dr. ${clinic?.doctor_name || 'Doctor'} is unavailable today.\nYour appointment (#${p.token_number}) has been cancelled.\nPlease contact ${clinic?.name || 'the clinic'} to reschedule. Sorry for the inconvenience.`
      if (p.has_whatsapp) await sendWhatsApp(p.phone, msg)
    }

    res.json({ cancelled: patients.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── Feature: End-of-day summary ──────────────────────────────────────────
app.post('/api/end-of-day', async (req, res) => {
  const { clinic_id } = req.body
  try {
    const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const { data: clinic } = await supabase.from('clinics').select('*').eq('id', clinic_id).single()

    const [{ data: allPts }, { data: seenEvents }, { data: noShowEvts }] = await Promise.all([
      supabase.from('patients').select('*').eq('clinic_id', clinic_id).eq('appointment_date', todayIST),
      supabase.from('queue_events').select('consultation_duration_mins, patients(case_type)')
        .eq('clinic_id', clinic_id).eq('event_type', 'seen')
        .not('consultation_duration_mins', 'is', null)
        .gte('timestamp', `${todayIST}T00:00:00`),
      supabase.from('queue_events').select('id').eq('clinic_id', clinic_id).eq('event_type', 'no_show')
        .gte('timestamp', `${todayIST}T00:00:00`),
    ])

    const total = allPts?.length || 0
    const seen = allPts?.filter(p => p.status === 'seen').length || 0
    const cancelled = allPts?.filter(p => p.status === 'cancelled').length || 0
    const noShows = noShowEvts?.length || 0
    const avgDur = seenEvents?.length
      ? Math.round(seenEvents.reduce((s, e) => s + e.consultation_duration_mins, 0) / seenEvents.length)
      : 0
    const longestCase = seenEvents?.length
      ? Math.max(...seenEvents.map(e => e.consultation_duration_mins))
      : 0

    const feedbacks = allPts?.filter(p => p.feedback).map(p => p.feedback) || []
    const avgFeedback = feedbacks.length
      ? (feedbacks.reduce((a, b) => a + b, 0) / feedbacks.length).toFixed(1)
      : null
    const feedbackEmoji = avgFeedback ? (avgFeedback <= 1.5 ? 'Excellent' : avgFeedback <= 2.5 ? 'Good' : 'Needs improvement') : 'No feedback yet'

    const msg = `*End of Day Summary — ${todayIST}*
${clinic?.name || 'Clinic'}

Total registered: ${total}
Seen: ${seen}
Cancelled: ${cancelled}
No-shows: ${noShows}

Avg consultation: ${avgDur > 0 ? `${avgDur} mins` : 'N/A'}
Longest case: ${longestCase > 0 ? `${longestCase} mins` : 'N/A'}
Patient feedback: ${feedbackEmoji}

Great work today, Dr. ${clinic?.doctor_name?.replace('Dr. ', '') || 'Doctor'}!`

    if (clinic?.doctor_phone) await sendWhatsApp(clinic.doctor_phone, msg)

    res.json({ success: true, summary: { total, seen, cancelled, noShows, avgDur } })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/health', (_, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`✓ API server → http://localhost:${PORT}`))
