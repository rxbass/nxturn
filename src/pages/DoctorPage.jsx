import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../lib/supabase'

const CLINIC_ID = import.meta.env.VITE_DEFAULT_CLINIC_ID
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316']

function toIST(date) {
  return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
}
function isoDate(d) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}
function getRange(preset) {
  const now = toIST(new Date())
  const today = isoDate(new Date())
  if (preset === 'today') return { from: today, to: today }
  if (preset === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - now.getDay())
    return { from: isoDate(start), to: today }
  }
  if (preset === 'month') {
    return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }
  }
  if (preset === 'prev_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: isoDate(start), to: isoDate(end) }
  }
  return null
}

export default function DoctorPage() {
  const { clinicId: paramId } = useParams()
  const clinicId = paramId || CLINIC_ID

  const [clinic, setClinic] = useState(null)
  const [preset, setPreset] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [patients, setPatients] = useState([])
  const [events, setEvents] = useState([])
  const [noShows, setNoShows] = useState([])
  const [loading, setLoading] = useState(true)

  const range = preset === 'custom'
    ? { from: customFrom, to: customTo }
    : getRange(preset)

  const load = useCallback(async () => {
    if (!clinicId || !range?.from || !range?.to) return
    setLoading(true)
    const [{ data: cl }, { data: pts }, { data: evts }, { data: ns }] = await Promise.all([
      supabase.from('clinics').select('*').eq('id', clinicId).single(),
      supabase.from('patients').select('*').eq('clinic_id', clinicId)
        .gte('appointment_date', range.from).lte('appointment_date', range.to)
        .order('appointment_date', { ascending: true }),
      supabase.from('queue_events').select('*, patients(case_type, symptoms)')
        .eq('clinic_id', clinicId).eq('event_type', 'seen')
        .not('consultation_duration_mins', 'is', null)
        .gte('timestamp', `${range.from}T00:00:00`)
        .lte('timestamp', `${range.to}T23:59:59`),
      supabase.from('queue_events').select('patient_id')
        .eq('clinic_id', clinicId).eq('event_type', 'no_show')
        .gte('timestamp', `${range.from}T00:00:00`)
        .lte('timestamp', `${range.to}T23:59:59`),
    ])
    setClinic(cl); setPatients(pts || []); setEvents(evts || []); setNoShows(ns || [])
    setLoading(false)
  }, [clinicId, range?.from, range?.to])

  useEffect(() => { load() }, [load])

  // ── Summary stats ──────────────────────────────────────────────────────
  const total = patients.length
  const newPts = patients.filter((p) => p.case_type === 'new_patient').length
  const followUps = patients.filter((p) => p.case_type === 'follow_up').length
  const cancelled = patients.filter((p) => p.status === 'cancelled').length
  const avgDuration = events.length
    ? Math.round(events.reduce((s, e) => s + e.consultation_duration_mins, 0) / events.length)
    : 0
  const noShowRate = total > 0 ? Math.round((noShows.length / total) * 100) : 0

  // Feedback breakdown
  const feedbacks = patients.filter(p => p.feedback)
  const goodCount = feedbacks.filter(p => p.feedback === 1).length
  const okCount = feedbacks.filter(p => p.feedback === 2).length
  const poorCount = feedbacks.filter(p => p.feedback === 3).length
  const feedbackRate = total > 0 ? Math.round((feedbacks.length / total) * 100) : 0

  // ── New patients vs follow-ups by date ────────────────────────────────
  const byDate = {}
  for (const p of patients) {
    if (!byDate[p.appointment_date]) byDate[p.appointment_date] = { date: p.appointment_date, new_patient: 0, follow_up: 0 }
    byDate[p.appointment_date][p.case_type] = (byDate[p.appointment_date][p.case_type] || 0) + 1
  }
  const dailyData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))

  // ── Avg duration by case type ─────────────────────────────────────────
  const durationMap = {}
  for (const e of events) {
    const ct = e.patients?.case_type || 'unknown'
    if (!durationMap[ct]) durationMap[ct] = { total: 0, count: 0 }
    durationMap[ct].total += e.consultation_duration_mins
    durationMap[ct].count++
  }
  const durationData = Object.entries(durationMap).map(([name, v]) => ({
    name: name === 'new_patient' ? 'New Patient' : 'Follow-up',
    avg_mins: Math.round(v.total / v.count),
  }))

  // ── Day-of-week: patient count + avg duration ─────────────────────────
  const dowShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dowMap = {}
  for (const p of patients) {
    const k = dowShort[new Date(p.appointment_date).getDay()]
    if (!dowMap[k]) dowMap[k] = { patients: 0, totalMins: 0, count: 0 }
    dowMap[k].patients++
  }
  for (const e of events) {
    const k = dowShort[new Date(e.timestamp).getDay()]
    if (!dowMap[k]) dowMap[k] = { patients: 0, totalMins: 0, count: 0 }
    dowMap[k].totalMins += e.consultation_duration_mins
    dowMap[k].count++
  }
  const dowData = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => ({
    day: d,
    patients: dowMap[d]?.patients || 0,
    avg_mins: dowMap[d]?.count > 0 ? Math.round(dowMap[d].totalMins / dowMap[d].count) : 0,
  }))

  // ── Time-of-day breakdown ─────────────────────────────────────────────
  const todMap = { Morning: { total: 0, count: 0 }, Afternoon: { total: 0, count: 0 }, Evening: { total: 0, count: 0 } }
  for (const e of events) {
    const h = toIST(new Date(e.timestamp)).getHours()
    const period = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'
    todMap[period].total += e.consultation_duration_mins
    todMap[period].count++
  }
  const todData = [
    { period: 'Morning', time: '6am–12pm', ...todMap.Morning },
    { period: 'Afternoon', time: '12pm–5pm', ...todMap.Afternoon },
    { period: 'Evening', time: '5pm–10pm', ...todMap.Evening },
  ].map((t) => ({ ...t, avg_mins: t.count > 0 ? Math.round(t.total / t.count) : 0 }))

  // ── Symptom frequency (pie) ───────────────────────────────────────────
  const symMap = {}
  for (const p of patients) {
    for (const s of p.symptoms || []) { symMap[s] = (symMap[s] || 0) + 1 }
  }
  const symptomData = Object.entries(symMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }))

  // ── Symptom duration ranking (AI learns this) ─────────────────────────
  const symDurMap = {}
  for (const e of events) {
    for (const s of e.patients?.symptoms || []) {
      if (!symDurMap[s]) symDurMap[s] = { total: 0, count: 0 }
      symDurMap[s].total += e.consultation_duration_mins
      symDurMap[s].count++
    }
  }
  const symDurData = Object.entries(symDurMap)
    .map(([name, v]) => ({ name, avg_mins: Math.round(v.total / v.count), count: v.count }))
    .sort((a, b) => b.avg_mins - a.avg_mins)
    .slice(0, 10)

  // ── CSV export ────────────────────────────────────────────────────────
  const exportCSV = () => {
    const durByPt = {}
    for (const e of events) { if (e.patient_id) durByPt[e.patient_id] = e.consultation_duration_mins }
    const headers = ['Date', 'Time', 'Name', 'Phone', 'Case Type', 'Symptoms', 'Status', 'Turn Time', 'Consultation (mins)']
    const rows = patients.map((p) => [
      p.appointment_date,
      new Date(p.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }),
      p.name, p.phone,
      p.case_type === 'new_patient' ? 'New Patient' : 'Follow-up',
      (p.symptoms || []).join('; '), p.status, p.eta_turn || '', durByPt[p.id] || '',
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `nxturn-${range.from}-to-${range.to}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const PRESETS = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'prev_month', label: 'Prev Month' },
    { key: 'custom', label: 'Custom' },
  ]

  return (
    <div className="min-h-screen bg-brand-gradient-soft">
      <div className="bg-brand-gradient px-6 py-5 sticky top-0 z-20 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">{clinic?.name || 'Analytics'}</h1>
            <p className="text-white/80 text-sm">{clinic?.doctor_name}</p>
          </div>
          <button onClick={exportCSV} disabled={patients.length === 0}
            className="bg-white/20 hover:bg-white/30 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors disabled:opacity-30 border border-white/20">
            Export CSV
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-5">
        {/* Date filter */}
        <div className="bg-white rounded-2xl px-4 py-3.5 shadow-sm border border-slate-100 flex flex-wrap gap-2 items-center">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${preset === p.key ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="flex items-center gap-2 ml-1">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              <span className="text-slate-500">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
          )}
          {range && <span className="ml-auto text-slate-500 text-xs">{range.from} to {range.to}</span>}
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-400 animate-pulse">Loading...</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {[
                { label: 'Total', value: total, color: 'text-slate-800', bg: 'bg-white' },
                { label: 'New Patients', value: newPts, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Follow-ups', value: followUps, color: 'text-green-600', bg: 'bg-green-50' },
                { label: 'Cancelled', value: cancelled, color: 'text-red-500', bg: 'bg-red-50' },
                { label: 'No-shows', value: noShows.length, color: 'text-orange-500', bg: 'bg-orange-50' },
                { label: 'Avg Consult', value: avgDuration ? `${avgDuration}m` : 'N/A', color: 'text-amber-600', bg: 'bg-amber-50' },
              ].map((c) => (
                <div key={c.label} className={`${c.bg} rounded-2xl p-4 shadow-sm border border-slate-100 text-center`}>
                  <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
                  <p className="text-slate-600 text-xs mt-1 font-medium">{c.label}</p>
                </div>
              ))}
            </div>

            {/* Time-of-day pattern — what AI uses */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-700">Session Pace by Time of Day</h2>
                <span className="text-xs text-brand-600 bg-brand-50 px-2 py-1 rounded-full font-medium">Used by AI</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {todData.map((t) => (
                  <div key={t.period} className={`rounded-2xl p-4 text-center border ${t.avg_mins > 0 ? 'bg-brand-50 border-brand-100' : 'bg-slate-50 border-slate-100'}`}>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t.period}</p>
                    <p className="text-xs text-slate-400 mb-2">{t.time}</p>
                    <p className={`text-3xl font-black ${t.avg_mins > 0 ? 'text-brand-700' : 'text-slate-300'}`}>
                      {t.avg_mins > 0 ? `${t.avg_mins}m` : '—'}
                    </p>
                    <p className="text-slate-500 text-xs mt-1">{t.count} cases</p>
                  </div>
                ))}
              </div>
            </div>

            {/* New patients vs Follow-ups */}
            {dailyData.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <h2 className="font-semibold text-slate-700 mb-4">New Patients vs Follow-ups</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dailyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v, n) => [v, n === 'new_patient' ? 'New Patient' : 'Follow-up']} />
                    <Legend formatter={(v) => v === 'new_patient' ? 'New Patient' : 'Follow-up'} />
                    <Bar dataKey="new_patient" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="follow_up" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Day-of-week: patients + avg duration */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-700">Busiest Days + Avg Duration</h2>
                <span className="text-xs text-brand-600 bg-brand-50 px-2 py-1 rounded-full font-medium">Used by AI</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dowData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="m" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="patients" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Patients" />
                  <Bar yAxisId="right" dataKey="avg_mins" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Avg mins" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Avg consultation by case type */}
              {durationData.length > 0 && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                  <h2 className="font-semibold text-slate-700 mb-4">Avg Duration by Case Type</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={durationData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} unit="m" />
                      <Tooltip formatter={(v) => [`${v} mins`]} />
                      <Bar dataKey="avg_mins" fill="#f59e0b" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 12, fill: '#64748b', formatter: (v) => `${v}m` }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Top symptoms */}
              {symptomData.length > 0 && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                  <h2 className="font-semibold text-slate-700 mb-4">Most Common Symptoms</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={symptomData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                        {symptomData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Symptom duration ranking — AI complexity scoring */}
            {symDurData.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-slate-700">Symptom Duration Ranking</h2>
                    <p className="text-slate-500 text-xs mt-0.5">Which symptoms require more consultation time — used by AI to flag complex cases</p>
                  </div>
                  <span className="text-xs text-brand-600 bg-brand-50 px-2 py-1 rounded-full font-medium">Used by AI</span>
                </div>
                <div className="space-y-2">
                  {symDurData.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 w-4 text-right">{i + 1}</span>
                      <span className="text-sm text-slate-700 flex-1">{s.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-slate-100 rounded-full h-2">
                          <div className="bg-brand-500 h-2 rounded-full" style={{ width: `${Math.min(100, (s.avg_mins / (symDurData[0]?.avg_mins || 1)) * 100)}%` }} />
                        </div>
                        <span className="text-sm font-bold text-slate-700 w-12 text-right">{s.avg_mins}m</span>
                        <span className="text-xs text-slate-400 w-14">({s.count} cases)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Patient feedback */}
            {feedbacks.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <h2 className="font-semibold text-slate-700 mb-4">Patient Feedback <span className="text-slate-500 font-normal text-sm">({feedbacks.length} responses, {feedbackRate}% response rate)</span></h2>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { emoji: '😊', label: 'Good', count: goodCount, color: 'bg-green-50 border-green-100 text-green-700' },
                    { emoji: '😐', label: 'OK', count: okCount, color: 'bg-yellow-50 border-yellow-100 text-yellow-700' },
                    { emoji: '😞', label: 'Too long', count: poorCount, color: 'bg-red-50 border-red-100 text-red-600' },
                  ].map((f) => (
                    <div key={f.label} className={`rounded-2xl p-4 border text-center ${f.color}`}>
                      <p className="text-3xl mb-1">{f.emoji}</p>
                      <p className="text-2xl font-black">{f.count}</p>
                      <p className="text-xs font-medium mt-0.5">{f.label}</p>
                      <p className="text-xs opacity-60 mt-0.5">{feedbacks.length > 0 ? Math.round((f.count / feedbacks.length) * 100) : 0}%</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No-show insights */}
            {noShows.length > 0 && (
              <div className="bg-orange-50 border border-orange-100 rounded-2xl px-5 py-4 flex items-center gap-5">
                <div className="text-center shrink-0">
                  <p className="text-3xl font-black text-orange-500">{noShowRate}%</p>
                  <p className="text-xs text-orange-500 font-medium">No-show rate</p>
                </div>
                <div className="w-px h-10 bg-orange-200" />
                <div>
                  <p className="text-orange-800 font-semibold text-sm">{noShows.length} patient{noShows.length > 1 ? 's' : ''} did not show up in this period</p>
                  <p className="text-orange-500 text-xs mt-0.5">These patients are automatically flagged in AI predictions for future sessions</p>
                </div>
              </div>
            )}

            {/* Patient records table */}
            {patients.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-700">Patient Records <span className="text-slate-500 font-normal">({patients.length})</span></h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                      <tr>
                        {['Date & Time', 'Name', 'Type', 'Symptoms', 'Turn', 'Status'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {patients.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <p className="text-slate-700 font-medium">{p.appointment_date}</p>
                            <p className="text-slate-500 text-xs">{new Date(p.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}</p>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.case_type === 'new_patient' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                              {p.case_type === 'new_patient' ? 'New' : 'Follow-up'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate">
                            {(p.symptoms || []).length > 0 ? p.symptoms.join(', ') : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{p.eta_turn || <span className="text-slate-400">—</span>}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              p.status === 'seen' ? 'bg-slate-100 text-slate-600' :
                              p.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                              'bg-yellow-100 text-yellow-700'}`}>
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {patients.length === 0 && (
              <div className="text-center py-16 text-slate-500">No patient data for this period</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
