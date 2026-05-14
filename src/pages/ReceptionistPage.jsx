import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${ampm}`
}

const CASE_TYPES = ['new_patient', 'follow_up']
const CASE_LABELS = { new_patient: 'New Patient', follow_up: 'Follow-up' }
const DELAY_OPTIONS = [15, 30, 60]
const TRAVEL_OPTIONS = [
  { label: 'Near', mins: 10, desc: '< 10 mins' },
  { label: 'Medium', mins: 20, desc: '10–25 mins' },
  { label: 'Far', mins: 35, desc: '> 25 mins' },
]
const SYMPTOMS = [
  'Fever', 'Cold', 'Cough', 'Throat pain', 'Stomach ache',
  'Dysentery', 'Body pain', 'Headache', 'Vomiting', 'Chest pain',
  'Skin rash', 'Back pain', 'Joint pain', 'Breathlessness',
  'Ear pain', 'Eye problem', 'Dizziness', 'Weakness',
]
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

const STATUS_STYLE = {
  in_progress: { bg: 'bg-green-50 border-green-200', dot: 'bg-green-500', label: 'Now', labelCls: 'bg-green-500 text-white' },
  ready:       { bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-400', label: 'Next', labelCls: 'bg-amber-400 text-white' },
  waiting:     { bg: 'bg-white border-slate-100',    dot: 'bg-slate-300', label: null,   labelCls: '' },
}

export default function ReceptionistPage() {
  const { clinicId: paramClinicId } = useParams()
  const clinicId = paramClinicId || import.meta.env.VITE_DEFAULT_CLINIC_ID

  const [clinic, setClinic] = useState(null)
  const [queue, setQueue] = useState([])
  const [allPatients, setAllPatients] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState('queue') // 'queue' | 'schedule'
  const [listTab, setListTab] = useState('active')
  const [form, setForm] = useState({ name: '', phone: '', case_type: 'new_patient', has_whatsapp: true, symptoms: [], appointment_date: today, travel_mins: 20, notes: '', priority: false })
  const [submitting, setSubmitting] = useState(false)
  const [markingNext, setMarkingNext] = useState(false)
  const [delayOpen, setDelayOpen] = useState(false)
  const [delaying, setDelaying] = useState(false)
  const [editingHours, setEditingHours] = useState(false)
  const [hoursForm, setHoursForm] = useState({ visiting_start: '', visiting_end: '', doctor_phone: '' })
  const [savingHours, setSavingHours] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [phoneHints, setPhoneHints] = useState([])
  const [formErrors, setFormErrors] = useState({})
  const [toast, setToast] = useState(null)
  const [lastNotified, setLastNotified] = useState(null)
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false)
  const [bulkCancelling, setBulkCancelling] = useState(false)
  const [sendingSummary, setSendingSummary] = useState(false)
  const [recalculating, setRecalculating] = useState(false)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const loadQueue = useCallback(async () => {
    if (!clinicId) return
    const { data: active } = await supabase.from('patients').select('*')
      .eq('clinic_id', clinicId).eq('appointment_date', today)
      .in('status', ['waiting', 'ready', 'in_progress'])
      .order('priority', { ascending: false }).order('token_number', { ascending: true })
    setQueue(active || [])
    const { data: all } = await supabase.from('patients').select('*')
      .eq('clinic_id', clinicId).eq('appointment_date', today)
      .order('token_number', { ascending: true })
    setAllPatients(all || [])
  }, [clinicId])

  const loadClinic = useCallback(async () => {
    if (!clinicId) return
    const { data } = await supabase.from('clinics').select('*').eq('id', clinicId).single()
    if (data) {
      setClinic(data)
      setHoursForm({ visiting_start: data.visiting_start || '', visiting_end: data.visiting_end || '', doctor_phone: data.doctor_phone || '' })
    }
  }, [clinicId])

  useEffect(() => {
    if (!clinicId) return
    loadClinic(); loadQueue()
    const ch = supabase.channel(`patients:${clinicId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients', filter: `clinic_id=eq.${clinicId}` }, loadQueue)
      .subscribe()

    // Auto-recalculate turn times every 5 minutes
    const recalcInterval = setInterval(async () => {
      try {
        await fetch(`${API}/recalculate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clinic_id: clinicId }),
        })
        await loadQueue()
      } catch {}
    }, 5 * 60 * 1000)

    return () => { supabase.removeChannel(ch); clearInterval(recalcInterval) }
  }, [clinicId, loadClinic, loadQueue])

  const saveHours = async () => {
    setSavingHours(true)
    const { error } = await supabase.from('clinics').update(hoursForm).eq('id', clinicId)
    if (!error) { setClinic((c) => ({ ...c, ...hoursForm })); setEditingHours(false); showToast('Settings saved') }
    else showToast(error.message, 'error')
    setSavingHours(false)
  }

  const handlePhoneChange = async (phone) => {
    setForm((f) => ({ ...f, phone })); setSuggestions([]); setPhoneHints([])
    if (phone.length === 10) setFormErrors((e) => ({ ...e, phone: undefined }))
    if (phone.length < 3) return
    const { data } = await supabase.from('patients').select('name, phone, travel_mins').ilike('phone', `%${phone}%`).order('created_at', { ascending: false }).limit(30)
    if (!data?.length) return
    if (phone.length === 10) {
      const matches = data.filter((p) => p.phone === `91${phone}`)
      if (matches.length) {
        const unique = [...new Map(matches.map((p) => [p.name.toLowerCase(), p.name])).values()]
        setSuggestions(unique)
        if (unique.length === 1) {
          const match = matches.find(m => m.name === unique[0])
          setForm((f) => ({ ...f, name: unique[0], travel_mins: match?.travel_mins || 20 }))
        }
      }
    } else {
      setPhoneHints([...new Map(data.map((p) => [p.phone, p.phone])).values()])
    }
  }

  const selectPhoneHint = async (stored) => {
    const digits = stored.replace(/\D/g, '').replace(/^91/, '')
    setForm((f) => ({ ...f, phone: digits })); setPhoneHints([])
    const { data } = await supabase.from('patients').select('name, travel_mins').eq('phone', stored).order('created_at', { ascending: false }).limit(20)
    if (data?.length) {
      const unique = [...new Map(data.map((p) => [p.name.toLowerCase(), p.name])).values()]
      setSuggestions(unique)
      if (unique.length === 1) setForm((f) => ({ ...f, name: unique[0], travel_mins: data[0]?.travel_mins || 20 }))
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    const errors = {}
    if (form.phone.length !== 10) errors.phone = 'Enter a valid 10-digit number'
    if (!form.name.trim()) errors.name = 'Name is required'
    if (!form.appointment_date) errors.appointment_date = 'Select a date'
    if (form.symptoms.length === 0) errors.symptoms = 'Select at least one symptom'
    if (Object.keys(errors).length) { setFormErrors(errors); return }
    setFormErrors({}); setSubmitting(true)
    try {
      const res = await fetch(`${API}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, phone: `91${form.phone}`, clinic_id: clinicId }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showToast(`${form.priority ? 'PRIORITY — ' : ''}Token #${data.token_number} assigned to ${form.name}`)
      if (form.has_whatsapp) setLastNotified({ token: data.token_number, name: form.name, message: `Hi ${form.name}! You are registered.\nToken: #${data.token_number}\nWe will message you when it is your turn 🏥` })
      setForm({ name: '', phone: '', case_type: 'new_patient', has_whatsapp: true, symptoms: [], appointment_date: today, travel_mins: 20, notes: '', priority: false })
      setSuggestions([]); setPhoneHints([]); setShowForm(false)
    } catch (err) { showToast(err.message, 'error') }
    finally { setSubmitting(false) }
  }

  const handleMarkSeen = async () => {
    const inProgress = queue.find((p) => p.status === 'in_progress')
    if (!inProgress && queue.filter((p) => p.status === 'waiting').length === 0) return
    setMarkingNext(true)
    try {
      const res = await fetch(`${API}/mark-seen`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic_id: clinicId, patient_id: inProgress?.id || null }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showToast('Queue updated')
      const nextReady = queue.find((p) => p.status === 'waiting' && p.id !== inProgress?.id)
      if (nextReady?.has_whatsapp) setLastNotified({ token: nextReady.token_number, name: nextReady.name, message: `Your turn is coming up 🏥\nHead to ${clinic?.name || 'the clinic'} now.` })
    } catch (err) { showToast(err.message, 'error') }
    finally { setMarkingNext(false) }
  }

  const handlePatientAction = async (patient, action) => {
    try {
      if (action === 'call') {
        if (inProgress && inProgress.id !== patient.id) await supabase.from('patients').update({ status: 'waiting' }).eq('id', inProgress.id)
        await supabase.from('patients').update({ status: 'in_progress' }).eq('id', patient.id)
        showToast(`Calling #${patient.token_number} ${patient.name}`)
      } else if (action === 'skip') {
        await supabase.from('patients').update({ status: 'seen' }).eq('id', patient.id)
        await supabase.from('queue_events').insert({ clinic_id: clinicId, patient_id: patient.id, event_type: 'no_show' })
        showToast(`#${patient.token_number} marked as no-show`)
      } else if (action === 'waiting') {
        await supabase.from('patients').update({ status: 'waiting' }).eq('id', patient.id)
        showToast(`#${patient.token_number} moved back to waiting`)
      }
    } catch (err) { showToast(err.message, 'error') }
  }

  const handleDoctorDelay = async (mins) => {
    setDelaying(true)
    try {
      const res = await fetch(`${API}/doctor-delay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinic_id: clinicId, delay_minutes: mins }) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showToast(`${mins}-min delay — patients notified`); setDelayOpen(false)
    } catch (err) { showToast(err.message, 'error') }
    finally { setDelaying(false) }
  }

  const handleTogglePause = async () => {
    try {
      const res = await fetch(`${API}/pause`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinic_id: clinicId }) })
      const data = await res.json()
      setClinic((c) => ({ ...c, is_paused: data.is_paused }))
      showToast(data.is_paused ? 'Queue paused — patients notified' : 'Queue resumed')
    } catch (err) { showToast(err.message, 'error') }
  }

  const handleBulkCancel = async () => {
    setBulkCancelling(true)
    try {
      const res = await fetch(`${API}/bulk-cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinic_id: clinicId }) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showToast(`${data.cancelled} patients cancelled — all notified via WhatsApp`)
      setBulkCancelOpen(false)
    } catch (err) { showToast(err.message, 'error') }
    finally { setBulkCancelling(false) }
  }

  const handleRecalculate = async () => {
    setRecalculating(true)
    try {
      const res = await fetch(`${API}/recalculate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinic_id: clinicId }) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      await loadQueue()
      showToast(`Turn times updated for ${data.updated} patients`)
    } catch (err) { showToast(err.message, 'error') }
    finally { setRecalculating(false) }
  }

  const handleEndOfDay = async () => {
    setSendingSummary(true)
    try {
      const res = await fetch(`${API}/end-of-day`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinic_id: clinicId }) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showToast(clinic?.doctor_phone ? 'Summary sent to doctor' : 'Summary ready — add doctor phone in settings to send')
    } catch (err) { showToast(err.message, 'error') }
    finally { setSendingSummary(false) }
  }

  const inProgress = queue.find((p) => p.status === 'in_progress')
  const seenToday = allPatients.filter((p) => p.status === 'seen').length
  const waiting = queue.filter((p) => p.status === 'waiting').length

  // Visiting hours guard
  const isWithinHours = (() => {
    if (!clinic?.visiting_start || !clinic?.visiting_end) return true // no hours set — allow
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const [sh, sm] = clinic.visiting_start.split(':').map(Number)
    const [eh, em] = clinic.visiting_end.split(':').map(Number)
    const mins = now.getHours() * 60 + now.getMinutes()
    return mins >= sh * 60 + sm && mins <= eh * 60 + em
  })()

  const hoursLabel = clinic?.visiting_start
    ? `${fmtTime(clinic.visiting_start)} – ${fmtTime(clinic.visiting_end)}`
    : ''

  return (
    <div className="min-h-screen bg-brand-gradient-soft flex flex-col">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-lg text-white text-sm font-medium ${toast.type === 'error' ? 'bg-red-500' : 'bg-brand-700'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="bg-brand-gradient px-5 py-4 sticky top-0 z-30 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white truncate">{clinic?.name || 'Clinic'}</h1>
              {clinic?.is_paused && <span className="bg-amber-400 text-amber-900 text-xs font-bold px-2 py-0.5 rounded-full">PAUSED</span>}
            </div>
            <p className="text-white/80 text-xs">{clinic?.doctor_name}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Stat label="Waiting" value={waiting} color="text-amber-300" />
            <div className="w-px h-8 bg-white/20" />
            <Stat label="Seen" value={seenToday} color="text-green-300" />
            <div className="w-px h-8 bg-white/20" />
            {!editingHours ? (
              <button onClick={() => setEditingHours(true)} className="text-right">
                <p className="text-xs text-white/60 leading-none mb-1">Hours</p>
                <p className="text-xs font-semibold text-white hover:text-brand-200 transition-colors">
                  {clinic?.visiting_start ? `${fmtTime(clinic.visiting_start)} – ${fmtTime(clinic.visiting_end)}` : <span className="text-amber-300">Set hours</span>}
                </p>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                <input type="time" value={hoursForm.visiting_start} onChange={(e) => setHoursForm((f) => ({ ...f, visiting_start: e.target.value }))} className="border border-white/30 bg-white/10 rounded-lg px-2 py-1 text-xs text-white w-24 focus:outline-none" />
                <span className="text-white/60 text-xs">–</span>
                <input type="time" value={hoursForm.visiting_end} onChange={(e) => setHoursForm((f) => ({ ...f, visiting_end: e.target.value }))} className="border border-white/30 bg-white/10 rounded-lg px-2 py-1 text-xs text-white w-24 focus:outline-none" />
                <input type="tel" value={hoursForm.doctor_phone} onChange={(e) => setHoursForm((f) => ({ ...f, doctor_phone: e.target.value }))} placeholder="Doctor phone" className="border border-white/30 bg-white/10 rounded-lg px-2 py-1 text-xs text-white w-28 focus:outline-none placeholder-white/40" />
                <button onClick={saveHours} disabled={savingHours} className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-2 py-1 rounded-lg">Save</button>
                <button onClick={() => setEditingHours(false)} className="text-white/60 text-xs">x</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-5 pb-6">
        <div className="flex gap-5 items-start">
          {/* Left column */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Tab toggle */}
            <div className="flex gap-1 bg-white/60 backdrop-blur rounded-2xl p-1 shadow-sm border border-brand-100">
              {[{ key: 'queue', label: 'Live Queue' }, { key: 'schedule', label: 'Today\'s Schedule' }].map((t) => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === t.key ? 'bg-brand-600 text-white shadow-sm' : 'text-brand-700 hover:bg-brand-50'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === 'queue' ? (
              <>
                {/* Live queue */}
                {queue.length > 0 ? (
                  <div className="space-y-2">
                    {queue.map((p) => {
                      const s = STATUS_STYLE[p.status] || STATUS_STYLE.waiting
                      return (
                        <div key={p.id} className={`border rounded-2xl px-4 py-3 transition-all ${s.bg}`}>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-slate-100 shadow-sm shrink-0 relative">
                              <span className="text-sm font-black text-slate-700">#{p.token_number}</span>
                              {p.priority && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-black">!</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-slate-800 truncate">{p.name}</p>
                                {s.label && <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${s.labelCls}`}>{s.label}</span>}
                                {p.priority && <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full">Priority</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-xs text-slate-600">{CASE_LABELS[p.case_type]}</span>
                                {p.symptoms?.length > 0 && <span className="text-xs text-slate-500">· {p.symptoms.slice(0, 2).join(', ')}{p.symptoms.length > 2 ? ` +${p.symptoms.length - 2}` : ''}</span>}
                                {p.travel_mins && <span className="text-xs text-slate-400">· {p.travel_mins}m away</span>}
                                {p.eta_turn && <span className="text-xs font-medium text-brand-600 ml-auto">~{p.eta_turn}</span>}
                              </div>
                              {p.notes && <p className="text-xs text-amber-700 mt-0.5 italic">Note: {p.notes}</p>}
                            </div>
                            <div className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                          </div>
                          <div className="flex gap-2 mt-2.5 justify-start">
                            {p.status !== 'in_progress' && (
                              <button onClick={() => {
                                if (!isWithinHours) { showToast(`Doctor session is ${hoursLabel}`, 'error'); return }
                                handlePatientAction(p, 'call')
                              }} className={`text-xs font-semibold rounded-xl px-4 py-1.5 transition-colors ${isWithinHours ? 'bg-brand-600 hover:bg-brand-700 text-white' : 'bg-slate-200 text-slate-400'}`}>Call now</button>
                            )}
                            {p.status === 'ready' && (
                              <button onClick={() => handlePatientAction(p, 'waiting')} className="bg-white border border-brand-200 text-brand-700 text-xs font-medium rounded-xl px-4 py-1.5 hover:border-brand-400 transition-colors">Back to waiting</button>
                            )}
                            {p.status !== 'in_progress' && (
                              <button onClick={() => handlePatientAction(p, 'skip')} className="bg-white border border-slate-200 text-slate-500 text-xs rounded-xl px-3 py-1.5 hover:text-red-400 hover:border-red-200 transition-colors">No-show</button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <p className="text-5xl mb-3">🏥</p>
                    <p className="font-medium text-slate-600">No patients in queue</p>
                    <p className="text-sm text-slate-500 mt-1">Register the first patient below</p>
                  </div>
                )}

                {/* Today's patient list */}
                {allPatients.length > 0 && (
                  <div className="bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden">
                    <div className="px-4 pt-4 pb-2">
                      <h2 className="font-semibold text-brand-900 mb-3">Today's Patients <span className="text-brand-500 font-normal">({allPatients.length})</span></h2>
                      <div className="flex gap-1 bg-brand-50 rounded-xl p-1">
                        {[
                          { key: 'active', label: 'Active', count: allPatients.filter(p => ['waiting','ready','in_progress'].includes(p.status)).length },
                          { key: 'seen', label: 'Seen', count: allPatients.filter(p => p.status === 'seen').length },
                          { key: 'cancelled', label: 'Cancelled', count: allPatients.filter(p => p.status === 'cancelled').length },
                          { key: 'all', label: 'All', count: allPatients.length },
                        ].map((t) => (
                          <button key={t.key} onClick={() => setListTab(t.key)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${listTab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-brand-600 hover:text-brand-800'}`}>
                            {t.label} {t.count > 0 && `(${t.count})`}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="divide-y divide-brand-50">
                      {allPatients.filter(p => {
                        if (listTab === 'active') return ['waiting','ready','in_progress'].includes(p.status)
                        if (listTab === 'seen') return p.status === 'seen'
                        if (listTab === 'cancelled') return p.status === 'cancelled'
                        return true
                      }).map((p) => (
                        <div key={p.id} className="px-4 py-3 hover:bg-brand-50/50 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-sm relative
                              ${p.status === 'in_progress' ? 'bg-emerald-100 text-emerald-700' : p.status === 'seen' ? 'bg-slate-100 text-slate-500' : p.status === 'cancelled' ? 'bg-red-50 text-red-400' : 'bg-brand-100 text-brand-700'}`}>
                              #{p.token_number}
                              {p.priority && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-black">!</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-brand-900 text-sm">{p.name}</span>
                                <StatusPill status={p.status} />
                                {p.feedback && <FeedbackBadge feedback={p.feedback} />}
                                {p.eta_turn && p.status !== 'seen' && p.status !== 'cancelled' && <span className="text-xs text-brand-600 font-medium ml-auto">~{p.eta_turn}</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-slate-600">
                                <span>{p.phone?.replace(/^91/, '')}</span>
                                <span className="text-slate-300">·</span>
                                <span>{CASE_LABELS[p.case_type]}</span>
                                {p.travel_mins && <><span className="text-slate-300">·</span><span>{p.travel_mins}m away</span></>}
                                {p.symptoms?.length > 0 && <><span className="text-slate-300">·</span><span className="truncate max-w-[140px]">{p.symptoms.slice(0, 2).join(', ')}{p.symptoms.length > 2 ? ` +${p.symptoms.length - 2}` : ''}</span></>}
                              </div>
                              {p.notes && <p className="text-xs text-amber-600 mt-0.5 italic">{p.notes}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                      {allPatients.filter(p => {
                        if (listTab === 'active') return ['waiting','ready','in_progress'].includes(p.status)
                        if (listTab === 'seen') return p.status === 'seen'
                        if (listTab === 'cancelled') return p.status === 'cancelled'
                        return true
                      }).length === 0 && <p className="text-center text-slate-500 text-sm py-6">No patients in this category</p>}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Daily schedule view */
              <div className="bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-brand-50 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-700">Today's Schedule — {today}</h2>
                  <button onClick={handleRecalculate} disabled={recalculating}
                    className="text-xs text-brand-600 font-medium bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1">
                    {recalculating ? 'Updating...' : '↻ Recalculate times'}
                  </button>
                </div>
                {allPatients.length === 0 ? (
                  <p className="text-center text-slate-500 text-sm py-10">No patients registered today</p>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {allPatients.map((p) => (
                      <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                        <div className="w-16 text-center shrink-0">
                          <p className="text-sm font-black text-brand-700">{p.eta_turn || '—'}</p>
                          <p className="text-xs text-slate-400">est. turn</p>
                        </div>
                        <div className={`w-1 h-10 rounded-full shrink-0 ${
                          p.status === 'seen' ? 'bg-slate-200' :
                          p.status === 'in_progress' ? 'bg-green-500' :
                          p.status === 'cancelled' ? 'bg-red-200' :
                          p.priority ? 'bg-red-400' : 'bg-brand-300'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800 text-sm">{p.name}</span>
                            {p.priority && <span className="text-xs bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded-full">Priority</span>}
                            <span className="text-xs text-slate-400">#{p.token_number}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <span>{CASE_LABELS[p.case_type]}</span>
                            {p.symptoms?.length > 0 && <><span>·</span><span>{p.symptoms.slice(0, 2).join(', ')}</span></>}
                            {p.travel_mins && <><span>·</span><span>{p.travel_mins}m away</span></>}
                          </div>
                        </div>
                        <StatusPill status={p.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Register modal */}
            {showForm && (
            <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6">
              {/* Backdrop */}
              <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
              {/* Modal */}
              <div className="relative bg-white w-full md:max-w-xl md:rounded-3xl rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h2 className="font-bold text-slate-800">Register New Patient</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Fill in patient details to add to queue</p>
                </div>
                <button type="button" onClick={() => setShowForm(false)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors font-bold text-lg">x</button>
              </div>
              <div className="overflow-y-auto flex-1">
                <form onSubmit={handleRegister} className="px-5 pb-5 pt-4 space-y-4">

                  {/* Priority toggle */}
                  <div className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-red-800">Priority Patient</p>
                      <p className="text-xs text-red-500">Emergency / Senior citizen / Pregnant — goes to front of queue</p>
                    </div>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, priority: !f.priority }))}
                      className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${form.priority ? 'bg-red-500' : 'bg-slate-300'}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${form.priority ? 'translate-x-8' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                      <span>Phone number</span>
                      {form.phone.length > 0 && form.phone.length < 10 && <span className="text-amber-500">{form.phone.length}/10</span>}
                      {form.phone.length === 10 && <span className="text-green-600 font-medium">Valid</span>}
                    </label>
                    <div className="flex">
                      <span className="flex items-center px-3.5 bg-slate-50 border border-r-0 border-slate-200 rounded-l-xl text-slate-600 text-sm font-medium">🇮🇳 +91</span>
                      <input type="tel" placeholder="10-digit number" value={form.phone} maxLength={10} minLength={10}
                        onChange={(e) => handlePhoneChange(e.target.value.replace(/\D/g, ''))}
                        className={`flex-1 border rounded-r-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm ${formErrors.phone ? 'border-red-300' : 'border-slate-200'}`}
                      />
                    </div>
                    {formErrors.phone && <p className="text-red-400 text-xs mt-1">{formErrors.phone}</p>}
                    {phoneHints.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <p className="w-full text-xs text-slate-500">Matching numbers:</p>
                        {phoneHints.map((p) => (
                          <button key={p} type="button" onClick={() => selectPhoneHint(p)}
                            className="px-3 py-1 rounded-full text-xs border bg-white text-slate-700 border-slate-200 hover:border-brand-400 transition-colors">
                            {p.replace(/^91/, '')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Name + Date */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-600 mb-1.5 flex items-center gap-1.5">
                        Patient name {suggestions.length > 0 && <span className="text-green-600 font-medium">Returning</span>}
                      </label>
                      <input required type="text" placeholder="Full name" value={form.name}
                        onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); if (e.target.value) setFormErrors((er) => ({ ...er, name: undefined })) }}
                        className={`w-full border rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm ${formErrors.name ? 'border-red-300' : suggestions.length ? 'border-green-300 bg-green-50/30' : 'border-slate-200'}`}
                      />
                      {formErrors.name && <p className="text-red-400 text-xs mt-1">{formErrors.name}</p>}
                      {suggestions.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {suggestions.map((name) => (
                            <button key={name} type="button" onClick={() => setForm((f) => ({ ...f, name }))}
                              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${form.name === name ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-200 hover:border-brand-300'}`}>
                              {name}
                            </button>
                          ))}
                          <button type="button" onClick={() => { setForm((f) => ({ ...f, name: '' })); setSuggestions([]) }}
                            className="px-2.5 py-1 rounded-full text-xs border border-slate-200 text-slate-500">+ New</button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-slate-600 mb-1.5 block">Appointment date</label>
                      <input required type="date" value={form.appointment_date}
                        onChange={(e) => setForm((f) => ({ ...f, appointment_date: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm"
                      />
                    </div>
                  </div>

                  {/* Case type */}
                  <div>
                    <label className="text-xs text-slate-600 mb-1.5 block">Case type</label>
                    <div className="flex gap-2">
                      {CASE_TYPES.map((c) => (
                        <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, case_type: c }))}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${form.case_type === c ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-400'}`}>
                          {CASE_LABELS[c]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Travel time — feeds into AI */}
                  <div>
                    <label className="text-xs text-slate-600 mb-1.5 flex items-center gap-1.5">
                      How far is the patient from clinic?
                      <span className="text-xs text-brand-500 bg-brand-50 px-1.5 py-0.5 rounded-full">Used by AI</span>
                    </label>
                    <div className="flex gap-2">
                      {TRAVEL_OPTIONS.map((t) => (
                        <button key={t.mins} type="button" onClick={() => setForm((f) => ({ ...f, travel_mins: t.mins }))}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${form.travel_mins === t.mins ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-400'}`}>
                          <span className="block">{t.label}</span>
                          <span className="text-xs opacity-70">{t.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Symptoms */}
                  <div>
                    <label className="text-xs mb-1.5 flex items-center gap-2">
                      <span className={formErrors.symptoms ? 'text-red-400' : 'text-slate-600'}>Symptoms</span>
                      {form.symptoms.length > 0 && <span className="bg-brand-100 text-brand-700 text-xs px-2 py-0.5 rounded-full">{form.symptoms.length} selected</span>}
                      {formErrors.symptoms && <span className="text-red-400 text-xs">{formErrors.symptoms}</span>}
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {SYMPTOMS.map((s) => {
                        const sel = form.symptoms.includes(s)
                        return (
                          <button key={s} type="button"
                            onClick={() => { setFormErrors((e) => ({ ...e, symptoms: undefined })); setForm((f) => ({ ...f, symptoms: sel ? f.symptoms.filter((x) => x !== s) : [...f.symptoms, s] })) }}
                            className={`px-3 py-1.5 rounded-full text-xs border transition-all ${sel ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}>
                            {s}
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <input id="custom-symptom" type="text" placeholder="Other symptom..."
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim(); if (v && !form.symptoms.includes(v)) setForm((f) => ({ ...f, symptoms: [...f.symptoms, v] })); e.target.value = '' } }}
                      />
                      <button type="button" onClick={() => { const i = document.getElementById('custom-symptom'); const v = i.value.trim(); if (v && !form.symptoms.includes(v)) setForm((f) => ({ ...f, symptoms: [...f.symptoms, v] })); i.value = '' }}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl">Add</button>
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-xs text-slate-600 mb-1.5 block">Notes <span className="text-slate-400">(optional)</span></label>
                    <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="e.g. Elderly patient, needs extra time... "
                      rows={2}
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm resize-none"
                    />
                  </div>

                  {/* WhatsApp */}
                  <div>
                    <label className="text-xs text-slate-600 mb-1.5 block">Has WhatsApp?</label>
                    <div className="flex gap-2">
                      {[true, false].map((v) => (
                        <button key={String(v)} type="button" onClick={() => setForm((f) => ({ ...f, has_whatsapp: v }))}
                          className={`flex-1 rounded-xl py-2.5 text-sm font-medium border transition-all ${form.has_whatsapp === v ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                          {v ? 'Yes' : 'No'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button type="submit" disabled={submitting}
                    className={`w-full text-white font-semibold rounded-xl py-3.5 text-sm shadow-sm disabled:opacity-40 transition-opacity hover:opacity-90 ${form.priority ? 'bg-red-500' : 'bg-brand-gradient'}`}>
                    {submitting ? 'Registering...' : form.priority ? 'Add Priority Patient to Queue' : 'Add to Queue'}
                  </button>
                </form>
              </div>
              </div>
            </div>
            )}
          </div>
          {/* End left column */}

          {/* Right column */}
          <div className="w-72 shrink-0 hidden md:block">
            <div className="sticky top-24 space-y-3">

              {/* WhatsApp preview */}
              <div className="bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden">
                <div className="bg-brand-50 border-b border-brand-100 px-4 py-2.5 flex items-center gap-2">
                  <span className="text-green-500 text-lg">💬</span>
                  <p className="text-xs font-semibold text-brand-700">
                    {lastNotified ? `WhatsApp sent to #${lastNotified.token}` : 'WhatsApp preview'}
                  </p>
                </div>
                <div className="px-4 py-4">
                  {lastNotified ? (
                    <div className="bg-brand-50 rounded-xl p-3">
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{lastNotified.message}</p>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-xs text-center py-3">Message preview appears here after registering</p>
                  )}
                </div>
              </div>

              {/* Quick register */}
              <button onClick={() => setShowForm(true)}
                className="w-full bg-white border-2 border-brand-400 text-brand-700 font-bold rounded-2xl py-3 text-sm hover:bg-brand-50 transition-colors flex items-center justify-center gap-1.5">
                <span className="text-lg font-black leading-none">+</span> New Patient
              </button>

              {/* Now serving */}
              {inProgress && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <div className="min-w-0">
                    <p className="text-emerald-800 text-xs font-semibold truncate">#{inProgress.token_number} {inProgress.name}</p>
                    <p className="text-emerald-600 text-xs">With doctor now</p>
                  </div>
                </div>
              )}

              {/* Visiting hours warning */}
              {!isWithinHours && clinic?.visiting_start && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-center">
                  <p className="text-amber-800 text-xs font-semibold">Outside visiting hours</p>
                  <p className="text-amber-600 text-xs mt-0.5">Doctor session: {hoursLabel}</p>
                </div>
              )}

              {/* Mark as Seen */}
              <button onClick={() => {
                if (!isWithinHours) { showToast(`Doctor session is ${hoursLabel} — cannot mark outside hours`, 'error'); return }
                handleMarkSeen()
              }}
                disabled={markingNext || (!inProgress && queue.filter(p => p.status === 'waiting').length === 0) || clinic?.is_paused}
                className={`w-full font-bold rounded-2xl py-4 transition-all text-sm shadow-sm ${isWithinHours ? 'bg-brand-gradient hover:opacity-90 active:opacity-80 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'} disabled:opacity-30`}>
                {markingNext ? 'Updating...' : '✓ Mark as Seen → Next'}
              </button>

              {/* Queue pause */}
              <button onClick={handleTogglePause}
                className={`w-full border font-medium rounded-2xl py-2.5 transition-colors text-sm ${clinic?.is_paused ? 'bg-amber-500 text-white border-amber-500' : 'bg-white border-brand-200 text-brand-700 hover:border-brand-400'}`}>
                {clinic?.is_paused ? '▶ Resume Queue' : '⏸ Pause Queue (Break)'}
              </button>

              {/* Doctor Delay */}
              <button onClick={() => {
                if (!isWithinHours) { showToast(`Doctor session is ${hoursLabel}`, 'error'); return }
                setDelayOpen(!delayOpen)
              }}
                className={`w-full border font-medium rounded-2xl py-2.5 transition-colors text-sm ${delayOpen ? 'bg-amber-50 border-amber-300 text-amber-700' : isWithinHours ? 'bg-white border-brand-200 text-brand-700 hover:border-brand-400' : 'bg-white border-slate-200 text-slate-400'}`}>
                ⏱ Doctor Delayed
              </button>
              {delayOpen && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-2">
                  <p className="text-amber-800 text-xs font-semibold uppercase tracking-wide">How long?</p>
                  <div className="flex gap-2">
                    {DELAY_OPTIONS.map((m) => (
                      <button key={m} onClick={() => handleDoctorDelay(m)} disabled={delaying}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl py-2 text-sm disabled:opacity-50">
                        {m >= 60 ? '1 hr' : `${m}m`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* End of day + Bulk cancel */}
              <button onClick={handleRecalculate} disabled={recalculating}
                className="w-full bg-white border border-brand-200 text-brand-700 text-xs font-medium rounded-xl py-2.5 hover:border-brand-400 transition-colors disabled:opacity-50">
                {recalculating ? 'Updating...' : '↻ Recalculate Turn Times'}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleEndOfDay} disabled={sendingSummary}
                  className="bg-white border border-brand-200 text-brand-700 text-xs font-medium rounded-xl py-2.5 hover:border-brand-400 transition-colors disabled:opacity-50">
                  {sendingSummary ? 'Sending...' : 'End of Day'}
                </button>
                <button onClick={() => setBulkCancelOpen(true)}
                  className="bg-white border border-red-200 text-red-500 text-xs font-medium rounded-xl py-2.5 hover:border-red-400 transition-colors">
                  Doctor Absent
                </button>
              </div>

              {bulkCancelOpen && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-3">
                  <p className="text-red-800 font-semibold text-sm">Cancel all patients today?</p>
                  <p className="text-red-600 text-xs">All waiting patients will be cancelled and notified via WhatsApp.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setBulkCancelOpen(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-xl py-2">Cancel</button>
                    <button onClick={handleBulkCancel} disabled={bulkCancelling} className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl py-2 disabled:opacity-50">
                      {bulkCancelling ? 'Cancelling...' : 'Yes, cancel all'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function StatusPill({ status }) {
  const map = { waiting: 'bg-brand-100 text-brand-700', ready: 'bg-amber-100 text-amber-700', in_progress: 'bg-emerald-100 text-emerald-700', seen: 'bg-slate-100 text-slate-600', cancelled: 'bg-red-50 text-red-500' }
  const labels = { waiting: 'Waiting', ready: 'Get Ready', in_progress: 'With Doctor', seen: 'Seen', cancelled: 'Cancelled' }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] || ''}`}>{labels[status] || status}</span>
}

function FeedbackBadge({ feedback }) {
  const map = { 1: { emoji: '😊', label: 'Good', cls: 'bg-green-100 text-green-700' }, 2: { emoji: '😐', label: 'OK', cls: 'bg-yellow-100 text-yellow-700' }, 3: { emoji: '😞', label: 'Long wait', cls: 'bg-red-100 text-red-600' } }
  const f = map[feedback]
  if (!f) return null
  return <span className={`text-xs px-2 py-0.5 rounded-full ${f.cls}`}>{f.emoji} {f.label}</span>
}

function Stat({ label, value, color }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-black leading-none ${color}`}>{value}</p>
      <p className="text-xs text-white/70 mt-0.5">{label}</p>
    </div>
  )
}
