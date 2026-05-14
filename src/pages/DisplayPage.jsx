import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function DisplayPage() {
  const { clinicId } = useParams()
  const [clinic, setClinic] = useState(null)
  const [currentToken, setCurrentToken] = useState(null)
  const [currentName, setCurrentName] = useState(null)
  const [waitingQueue, setWaitingQueue] = useState([])
  const [flash, setFlash] = useState(false)
  const [time, setTime] = useState(new Date())

  const loadData = async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

    const { data: inProgress } = await supabase
      .from('patients').select('token_number, name').eq('clinic_id', clinicId)
      .eq('status', 'in_progress').order('token_number', { ascending: true }).limit(1).single()

    const { data: waiting } = await supabase
      .from('patients').select('token_number, name, case_type').eq('clinic_id', clinicId)
      .eq('appointment_date', today).in('status', ['waiting', 'ready'])
      .order('token_number', { ascending: true }).limit(5)

    setCurrentToken(inProgress?.token_number ?? null)
    setCurrentName(inProgress?.name ?? null)
    setWaitingQueue(waiting || [])
  }

  useEffect(() => {
    supabase.from('clinics').select('*').eq('id', clinicId).single().then(({ data }) => { if (data) setClinic(data) })
    loadData()
    const channel = supabase.channel(`display:${clinicId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients', filter: `clinic_id=eq.${clinicId}` }, () => {
        setFlash(true); setTimeout(() => setFlash(false), 1000); loadData()
      }).subscribe()
    const clock = setInterval(() => setTime(new Date()), 1000)
    return () => { supabase.removeChannel(channel); clearInterval(clock) }
  }, [clinicId])

  const timeStr = time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
  const dateStr = time.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })

  return (
    <div className={`min-h-screen bg-slate-900 flex flex-col transition-colors duration-700 ${flash ? 'bg-slate-800' : ''}`}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-10 pt-8 pb-4">
        <div>
          <p className="text-slate-400 text-sm font-medium uppercase tracking-widest">{clinic?.name || 'Clinic'}</p>
          <p className="text-slate-500 text-xs mt-0.5">{clinic?.doctor_name}</p>
        </div>
        <div className="text-right">
          <p className="text-white text-3xl font-black tabular-nums">{timeStr}</p>
          <p className="text-slate-500 text-xs mt-0.5">{dateStr}</p>
        </div>
      </div>

      {/* Main token */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 -mt-8">
        <p className="text-slate-500 text-sm uppercase tracking-[0.3em] mb-4">Now Serving</p>
        <div className={`transition-all duration-500 ${flash ? 'scale-105' : 'scale-100'}`}>
          {currentToken !== null ? (
            <>
              <p className={`text-[180px] font-black leading-none text-center transition-colors duration-500 ${flash ? 'text-green-400' : 'text-white'}`}>
                #{currentToken}
              </p>
              {currentName && (
                <p className="text-center text-slate-400 text-2xl font-medium mt-2">{currentName}</p>
              )}
            </>
          ) : (
            <p className="text-[180px] font-black leading-none text-slate-700">—</p>
          )}
        </div>
      </div>

      {/* Waiting list */}
      {waitingQueue.length > 0 && (
        <div className="px-10 pb-10">
          <div className="border-t border-slate-800 pt-6">
            <p className="text-slate-600 text-xs uppercase tracking-widest mb-4">Up next</p>
            <div className="flex gap-4">
              {waitingQueue.slice(0, 4).map((p, i) => (
                <div key={p.token_number} className={`flex-1 rounded-2xl px-4 py-3 ${i === 0 ? 'bg-slate-800 border border-slate-700' : 'bg-slate-900 border border-slate-800'}`}>
                  <p className={`text-2xl font-black ${i === 0 ? 'text-white' : 'text-slate-500'}`}>#{p.token_number}</p>
                  <p className={`text-sm mt-0.5 truncate ${i === 0 ? 'text-slate-300' : 'text-slate-600'}`}>{p.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
