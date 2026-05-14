import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function getUrgency(patient, clinic, delay, aheadCount, prediction) {
  const base = STATUS_CONFIG[patient.status] || STATUS_CONFIG.waiting
  if (patient.status === 'seen' || patient.status === 'in_progress' || patient.status === 'cancelled') return { ...base, subtitle: null, leaveNow: false }
  if (clinic?.visiting_start) {
    const [h, m] = clinic.visiting_start.split(':').map(Number)
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const visitStart = new Date(nowIST); visitStart.setHours(h, m, 0, 0)
    const delayMs = (delay?.delay_minutes || 0) * 60000
    const adjustedStart = new Date(visitStart.getTime() + delayMs)
    const minsAfterStart = (nowIST - adjustedStart) / 60000
    const minsUntilTurn = (aheadCount * 10) - minsAfterStart
    if (minsUntilTurn <= 0 && aheadCount === 0) return { icon: '🟢', title: 'Head to clinic now', subtitle: 'Your turn has started — go immediately', bg: 'from-green-500 to-emerald-600', textColor: 'text-white', leaveNow: true }
    if (minsUntilTurn <= 15 && aheadCount <= 1) return { icon: '🟠', title: 'Get ready to leave', subtitle: `Your turn in about ${Math.max(1, Math.round(minsUntilTurn))} mins`, bg: 'from-orange-400 to-amber-500', textColor: 'text-white', leaveNow: false }
    if (minsAfterStart < 0) {
      const totalMins = Math.round(-minsAfterStart)
      const hrs = Math.floor(totalMins / 60)
      const mins = totalMins % 60
      const timeStr = hrs > 0
        ? `${hrs} hr${hrs > 1 ? 's' : ''}${mins > 0 ? ` ${mins} min` : ''}`
        : `${mins} min`
      return { ...base, subtitle: `Doctor starts in ${timeStr}`, leaveNow: false }
    }
  }
  return { ...base, subtitle: null, leaveNow: false }
}

const STATUS_CONFIG = {
  waiting:     { icon: '🕐', title: "You're in the queue",          bg: 'from-brand-600 to-sky-500',     textColor: 'text-white', leaveNow: false },
  ready:       { icon: '🔔', title: 'Get ready — turn coming soon', bg: 'from-amber-500 to-orange-500',  textColor: 'text-white', leaveNow: false },
  in_progress: { icon: '🏃', title: 'Head to clinic now',           bg: 'from-emerald-500 to-teal-600',  textColor: 'text-white', leaveNow: true  },
  seen:        { icon: '✅', title: 'Visit complete',               bg: 'from-slate-400 to-slate-500',   textColor: 'text-white', leaveNow: false },
  cancelled:   { icon: '✕',  title: 'Appointment cancelled',        bg: 'from-slate-300 to-slate-400',   textColor: 'text-white', leaveNow: false },
}

export default function PatientStatusPage() {
  const { token } = useParams()
  const [patient, setPatient] = useState(null)
  const [clinic, setClinic] = useState(null)
  const [aheadCount, setAheadCount] = useState(0)
  const [prediction, setPrediction] = useState(null)
  const [delay, setDelay] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [feedbackSent, setFeedbackSent] = useState(false)

  const load = async () => {
    const { data: pat } = await supabase.from('patients').select('*').eq('token_number', token).single()
    if (!pat) { setNotFound(true); setLoading(false); return }
    setPatient(pat)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const [{ data: cl }, { data: delayEvent }] = await Promise.all([
      supabase.from('clinics').select('*').eq('id', pat.clinic_id).single(),
      supabase.from('queue_events').select('delay_minutes, timestamp').eq('clinic_id', pat.clinic_id).eq('event_type', 'delayed').gte('timestamp', `${today}T00:00:00`).order('timestamp', { ascending: false }).limit(1).single(),
    ])
    setClinic(cl)
    if (delayEvent) setDelay(delayEvent)
    if (pat.status === 'waiting' || pat.status === 'ready') {
      const { count } = await supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', pat.clinic_id).lt('token_number', pat.token_number).in('status', ['waiting', 'ready', 'in_progress'])
      setAheadCount(count || 0)
    }
    setPrediction({ leave_at: pat.leave_at, eta_turn: pat.eta_turn })
    setLoading(false)
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    let channel
    const setup = async () => {
      const { data: pat } = await supabase.from('patients').select('clinic_id').eq('token_number', token).single()
      if (!pat) return
      channel = supabase.channel(`status:${token}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'patients', filter: `token_number=eq.${token}` }, (p) => { setPatient(p.new); setPrediction({ leave_at: p.new.leave_at, eta_turn: p.new.eta_turn }) })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'queue_events', filter: `clinic_id=eq.${pat.clinic_id}` }, (p) => { if (p.new.event_type === 'delayed') setDelay({ delay_minutes: p.new.delay_minutes, timestamp: p.new.timestamp }) })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clinics', filter: `id=eq.${pat.clinic_id}` }, (p) => { setClinic(p.new) })
        .subscribe()
    }
    setup()
    return () => { clearInterval(interval); if (channel) supabase.removeChannel(channel) }
  }, [token])

  const handleCancel = async () => {
    setCancelling(true)
    try {
      const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
      const res = await fetch(`${API}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token_number: patient.token_number }) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPatient((p) => ({ ...p, status: 'cancelled' })); setConfirmCancel(false)
    } catch (err) { alert(err.message) }
    finally { setCancelling(false) }
  }

  if (loading) return (
    <div className="min-h-screen bg-brand-gradient flex items-center justify-center">
      <div className="text-white/80 animate-pulse text-lg">Loading...</div>
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl p-8 shadow-sm text-center max-w-sm">
        <p className="text-5xl mb-4">🔍</p>
        <h1 className="text-xl font-bold text-slate-800">Token not found</h1>
        <p className="text-slate-600 mt-2 text-sm">Token #{token} does not exist. Please check with reception.</p>
      </div>
    </div>
  )

  const urgency = getUrgency(patient, clinic, delay, aheadCount, prediction)
  const canCancel = patient.status === 'waiting' || patient.status === 'ready'

  return (
    <div className="min-h-screen bg-brand-gradient-soft flex flex-col">
      {/* Gradient hero */}
      <div className={`bg-gradient-to-br ${urgency.bg} pt-12 pb-16 px-6 text-center`}>
        {clinic && <p className="text-white/90 text-sm font-medium mb-6">{clinic.name}</p>}
        <div className="inline-flex flex-col items-center">
          <p className="text-white/80 text-xs uppercase tracking-widest mb-1">Your Token</p>
          <p className="text-8xl font-black text-white leading-none">#{patient.token_number}</p>
          <p className="text-white/90 mt-2 font-medium">{patient.name}</p>
        </div>
      </div>

      {/* Content card */}
      <div className="flex-1 px-4 -mt-8 pb-6 space-y-3 max-w-sm mx-auto w-full">
        {/* Delay alert */}
        {delay && patient.status !== 'seen' && patient.status !== 'cancelled' && (
          <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3.5 flex items-start gap-3">
            <span className="text-lg mt-0.5">⚠️</span>
            <div>
              <p className="font-semibold text-red-800 text-sm">Doctor is running {delay.delay_minutes} mins late</p>
              <p className="text-red-600 text-xs mt-0.5">Times updated — stay home until notified</p>
            </div>
          </div>
        )}

        {/* Status card */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className={`bg-gradient-to-r ${urgency.bg} px-5 py-4 flex items-center gap-3`}>
            <span className="text-2xl">{urgency.icon}</span>
            <div>
              <p className={`font-bold text-base ${urgency.textColor}`}>{urgency.title}</p>
              {urgency.subtitle && <p className={`text-sm ${urgency.textColor} opacity-80`}>{urgency.subtitle}</p>}
            </div>
          </div>

          <div className="px-5 py-4 space-y-3">
            {(patient.status === 'waiting' || patient.status === 'ready') && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Patients ahead</span>
                <span className="font-bold text-slate-800 text-lg">{aheadCount}</span>
              </div>
            )}

            {patient.status !== 'seen' && patient.status !== 'cancelled' && (
              <div className="bg-slate-50 rounded-2xl px-4 py-3">
                {prediction?.eta_turn ? (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 text-sm">Your turn at</span>
                    <span className="font-black text-slate-800 text-xl">{prediction.eta_turn}</span>
                  </div>
                ) : urgency.leaveNow ? (
                  <p className="text-green-600 font-semibold text-sm text-center">Head to clinic now</p>
                ) : (
                  <p className="text-slate-400 text-sm text-center animate-pulse">Calculating your time...</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Cancel */}
        {canCancel && !confirmCancel && (
          <button onClick={() => setConfirmCancel(true)} className="w-full text-slate-400 hover:text-red-400 text-sm py-2 transition-colors text-center">
            Cancel my appointment
          </button>
        )}
        {confirmCancel && (
          <div className="bg-white border border-slate-100 rounded-3xl shadow-sm p-5 text-center space-y-4">
            <p className="font-semibold text-slate-800">Cancel your appointment?</p>
            <p className="text-slate-500 text-sm">You will lose your spot. You will need to re-register.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmCancel(false)} className="flex-1 border border-slate-200 rounded-2xl py-3 text-slate-600 font-medium text-sm hover:bg-slate-50">Keep my spot</button>
              <button onClick={handleCancel} disabled={cancelling} className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-2xl py-3 font-semibold text-sm disabled:opacity-50">
                {cancelling ? 'Cancelling...' : 'Yes, cancel'}
              </button>
            </div>
          </div>
        )}
        {patient.status === 'cancelled' && (
          <p className="text-center text-slate-500 text-sm">Your spot has been removed. Queue updated.</p>
        )}
        {/* Feedback — shown when seen */}
        {patient.status === 'seen' && !feedbackSent && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 text-center space-y-3">
            <p className="font-semibold text-slate-800">How was your wait today?</p>
            <div className="flex gap-3 justify-center">
              {[
                { val: 1, emoji: '😊', label: 'Good' },
                { val: 2, emoji: '😐', label: 'OK' },
                { val: 3, emoji: '😞', label: 'Too long' },
              ].map((f) => (
                <button key={f.val} onClick={async () => {
                  setFeedback(f.val)
                  const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
                  await fetch(`${API}/feedback`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token_number: patient.token_number, feedback: f.val }),
                  })
                  setFeedbackSent(true)
                }}
                  className={`flex flex-col items-center gap-1 w-20 py-3 rounded-2xl border transition-all ${feedback === f.val ? 'bg-brand-50 border-brand-300' : 'bg-slate-50 border-slate-200 hover:border-brand-200'}`}>
                  <span className="text-3xl">{f.emoji}</span>
                  <span className="text-xs text-slate-600 font-medium">{f.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {patient.status === 'seen' && feedbackSent && (
          <p className="text-center text-brand-600 text-sm font-medium">Thank you for your feedback!</p>
        )}

        {/* Pause notice */}
        {clinic?.is_paused && patient.status !== 'seen' && patient.status !== 'cancelled' && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3.5 text-center">
            <p className="font-semibold text-amber-800 text-sm">Doctor is on a short break</p>
            <p className="text-amber-600 text-xs mt-0.5">Queue will resume shortly — stay home</p>
          </div>
        )}

        {patient.status !== 'cancelled' && (
          <p className="text-center text-slate-400 text-xs">Refreshes every 30 seconds</p>
        )}
      </div>
    </div>
  )
}
