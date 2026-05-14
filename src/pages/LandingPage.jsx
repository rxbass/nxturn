export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-b border-teal-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand-gradient flex items-center justify-center">
              <span className="text-white font-black text-sm">N</span>
            </div>
            <span className="font-black text-xl text-brand-800 tracking-tight">Nxturn</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#how" className="hover:text-brand-600 transition-colors">How it works</a>
            <a href="#features" className="hover:text-brand-600 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-brand-600 transition-colors">Pricing</a>
          </div>
          <a href="/receptionist"
            className="bg-brand-gradient text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity shadow-sm">
            Try Demo
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 bg-brand-gradient-soft relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(13,148,136,0.15),_transparent_60%)]" />
        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 bg-brand-100 text-brand-700 text-sm font-semibold px-4 py-2 rounded-full mb-6">
            <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
            Built for small clinics in India
          </div>
          <h1 className="text-5xl md:text-6xl font-black text-brand-900 leading-tight mb-6">
            No more patients<br />
            <span className="text-transparent bg-clip-text bg-brand-gradient">waiting in the dark</span>
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
            Nxturn tells every patient exactly when to arrive at the clinic.
            AI predicts the queue. WhatsApp delivers the alert. Patients rest at home.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/receptionist"
              className="bg-brand-gradient text-white font-bold px-8 py-4 rounded-2xl text-lg hover:opacity-90 transition-opacity shadow-lg shadow-brand-200">
              See it live
            </a>
            <a href="#how"
              className="bg-white text-brand-700 font-semibold px-8 py-4 rounded-2xl text-lg border border-brand-200 hover:border-brand-400 transition-colors">
              How it works
            </a>
          </div>
        </div>

        {/* Mock UI */}
        <div className="max-w-5xl mx-auto mt-16 relative">
          <div className="bg-white rounded-3xl shadow-2xl shadow-brand-200/50 border border-brand-100 overflow-hidden">
            <div className="bg-brand-gradient px-6 py-4 flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-white/30" />
                <div className="w-3 h-3 rounded-full bg-white/30" />
                <div className="w-3 h-3 rounded-full bg-white/30" />
              </div>
              <div className="flex-1 bg-white/20 rounded-lg px-3 py-1 text-white/90 text-xs">nxturn.app/receptionist</div>
            </div>
            <div className="p-6 grid md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-3">
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-emerald-800 font-semibold text-sm">#3 Priya Sharma — With doctor now</span>
                </div>
                {[
                  ['#4 Ravi Kumar', 'Fever, Cough', 'Get Ready', 'bg-amber-50 border-amber-100 text-amber-800'],
                  ['#5 Anita Devi', 'Follow-up', 'Waiting', 'bg-brand-50 border-brand-100 text-brand-700'],
                  ['#6 Suresh M', 'New Patient', 'Waiting', 'bg-brand-50 border-brand-100 text-brand-700'],
                ].map(([name, sym, status, cls]) => (
                  <div key={name} className={`flex items-center justify-between border rounded-xl px-3 py-2.5 ${cls}`}>
                    <div>
                      <p className="font-semibold text-sm">{name}</p>
                      <p className="text-xs opacity-70">{sym}</p>
                    </div>
                    <span className="text-xs font-medium bg-white/60 px-2 py-0.5 rounded-full">{status}</span>
                  </div>
                ))}
              </div>
              <div className="bg-brand-gradient-soft rounded-2xl p-4 flex flex-col justify-between border border-brand-100">
                <div>
                  <p className="text-brand-700 text-xs font-medium mb-1">WhatsApp sent to #4</p>
                  <div className="bg-white rounded-xl p-3 shadow-sm">
                    <p className="text-xs text-slate-600 leading-relaxed">Hi Ravi! Your turn is at <strong>11:35am</strong> 🏥<br />Head to City Clinic now.</p>
                  </div>
                </div>
                <button className="w-full bg-brand-gradient text-white font-bold rounded-xl py-3 text-sm mt-3 shadow-sm">
                  Mark as Seen — Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black text-slate-800 mb-4">The waiting room problem is real</h2>
            <p className="text-slate-600 max-w-xl mx-auto">Every day, sick patients sit in crowded waiting rooms for hours — guessing when their turn will come.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { stat: '2.5 hrs', label: 'Average wait time in Indian OPDs', icon: '⏱️' },
              { stat: '40%',     label: 'Patients who leave without being seen', icon: '🚶' },
              { stat: '₹0',     label: 'What patients earn while waiting', icon: '💸' },
            ].map((c) => (
              <div key={c.stat} className="text-center bg-red-50 border border-red-100 rounded-2xl p-6">
                <p className="text-4xl mb-3">{c.icon}</p>
                <p className="text-4xl font-black text-red-600 mb-2">{c.stat}</p>
                <p className="text-slate-600 text-sm">{c.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 px-6 bg-brand-gradient-soft">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black text-brand-900 mb-4">How Nxturn works</h2>
            <p className="text-brand-700 max-w-xl mx-auto">Three simple steps. No app needed. Works on any phone.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-10 left-1/3 right-1/3 h-0.5 bg-brand-200" />
            {[
              { step: '1', icon: '📋', title: 'Receptionist registers', desc: 'Patient name, phone, symptoms. Takes 30 seconds. Patient gets a WhatsApp confirmation with their token link.' },
              { step: '2', icon: '🤖', title: 'AI predicts the queue', desc: 'Every tap of "Mark as Seen" feeds data to AI. It calculates exactly when each patient will be called.' },
              { step: '3', icon: '📱', title: 'Patient gets notified', desc: 'WhatsApp message: "Your turn is at 11:35am." Patient rests at home, arrives on time. No waiting room.' },
            ].map((s) => (
              <div key={s.step} className="text-center relative">
                <div className="w-16 h-16 bg-brand-gradient rounded-2xl flex items-center justify-center text-3xl mx-auto mb-5 shadow-md shadow-brand-200">
                  {s.icon}
                </div>
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-6 bg-white border-2 border-brand-400 rounded-full flex items-center justify-center text-xs font-black text-brand-600">
                  {s.step}
                </div>
                <h3 className="font-bold text-brand-900 text-lg mb-2">{s.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black text-slate-800 mb-4">Everything a clinic needs</h2>
            <p className="text-slate-600 max-w-xl mx-auto">Built for the receptionist, the doctor, and the patient — all in one.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: '🤖', title: 'AI Queue Prediction', desc: "Learns your doctor's pace. Gets smarter every day. Accounts for case type, symptoms, and delays." },
              { icon: '📱', title: 'WhatsApp Notifications', desc: 'Token confirmation on registration. Turn alert when nearby. No app download needed.' },
              { icon: '📺', title: 'Token Display Screen', desc: 'Fullscreen display for your clinic TV. Updates live. For patients without a smartphone.' },
              { icon: '⏱️', title: 'Doctor Delay Handling', desc: 'One tap logs the delay. AI recalculates instantly. All waiting patients notified automatically.' },
              { icon: '❌', title: 'Patient Self-Cancel', desc: 'Patient can cancel from their status page. Queue reshuffles automatically. No receptionist needed.' },
              { icon: '📊', title: 'Doctor Analytics', desc: 'Daily/weekly/monthly reports. New vs follow-up trends. Symptom patterns. Export to CSV.' },
              { icon: '🔄', title: 'Auto Daily Reset', desc: 'Queue resets at midnight IST. Token numbers restart from #1. History preserved for AI learning.' },
              { icon: '🏠', title: 'Patient Status Page', desc: 'Live turn status at a link. Works on any browser. Shows estimated turn time and delay alerts.' },
              { icon: '💾', title: 'Symptom History', desc: 'Returning patient phone lookup. Auto-fills name. Symptoms tracked over time for better predictions.' },
            ].map((f) => (
              <div key={f.title} className="bg-brand-50 border border-brand-100 rounded-2xl p-5 hover:border-brand-300 hover:shadow-sm transition-all">
                <p className="text-3xl mb-3">{f.icon}</p>
                <h3 className="font-bold text-brand-900 mb-1.5">{f.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For who */}
      <section className="py-20 px-6 bg-brand-gradient-soft">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black text-brand-900 mb-4">Built for everyone in the clinic</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { role: 'Receptionist', icon: '👩‍💼', color: 'bg-brand-600', points: ['Register patient in 30 seconds', 'One big "Mark as Seen" button', 'Doctor delay — 3 options', 'See full patient list with status', 'No training needed'] },
              { role: 'Doctor', icon: '👨‍⚕️', color: 'bg-sky-600', points: ['Analytics dashboard', 'Avg consultation time trends', 'New vs follow-up ratio', 'Top symptoms by month', 'Export patient data to CSV'] },
              { role: 'Patient', icon: '🧑‍🦽', color: 'bg-emerald-600', points: ['WhatsApp confirmation on arrival', 'Live status page — no app needed', 'Exact turn time prediction', 'Delay alerts instantly', 'Self-cancel from phone'] },
            ].map((p) => (
              <div key={p.role} className="bg-white rounded-2xl p-6 shadow-sm border border-brand-100">
                <div className={`w-12 h-12 ${p.color} rounded-2xl flex items-center justify-center text-2xl mb-4`}>
                  {p.icon}
                </div>
                <h3 className="font-bold text-slate-800 text-lg mb-4">{p.role}</h3>
                <ul className="space-y-2">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-brand-500 mt-0.5 shrink-0">✓</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black text-slate-800 mb-4">Simple pricing</h2>
            <p className="text-slate-600">Start free. Pay only when you grow.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { plan: 'Free', price: '₹0', period: 'forever', desc: 'Perfect for piloting', features: ['1 doctor', 'Unlimited patients', 'AI queue prediction', 'Patient status page', 'Display screen', 'Basic analytics'], cta: 'Start free', highlight: false },
              { plan: 'Pro', price: '₹999', period: '/month', desc: 'For growing clinics', features: ['Everything in Free', 'WhatsApp notifications', 'Doctor delay alerts', 'Full analytics + export', 'Multi-doctor support', 'Priority support'], cta: 'Start 14-day trial', highlight: true },
              { plan: 'Premium', price: '₹2,499', period: '/month', desc: 'For serious clinics', features: ['Everything in Pro', 'Custom WhatsApp messages', 'SMS fallback', 'API access', 'Multi-clinic management', 'Dedicated support'], cta: 'Contact us', highlight: false },
            ].map((p) => (
              <div key={p.plan} className={`rounded-3xl p-6 border ${p.highlight ? 'bg-brand-gradient border-brand-600 shadow-xl shadow-brand-200' : 'bg-white border-slate-200'}`}>
                {p.highlight && <div className="text-xs font-bold text-white/80 uppercase tracking-widest mb-3">Most popular</div>}
                <h3 className={`font-black text-2xl mb-1 ${p.highlight ? 'text-white' : 'text-slate-800'}`}>{p.plan}</h3>
                <div className="flex items-end gap-1 mb-1">
                  <span className={`text-4xl font-black ${p.highlight ? 'text-white' : 'text-slate-800'}`}>{p.price}</span>
                  <span className={`text-sm mb-1.5 ${p.highlight ? 'text-white/80' : 'text-slate-600'}`}>{p.period}</span>
                </div>
                <p className={`text-sm mb-6 ${p.highlight ? 'text-white/80' : 'text-slate-600'}`}>{p.desc}</p>
                <ul className="space-y-2 mb-6">
                  {p.features.map((f) => (
                    <li key={f} className={`flex items-center gap-2 text-sm ${p.highlight ? 'text-white/90' : 'text-slate-700'}`}>
                      <span className={p.highlight ? 'text-white' : 'text-brand-500'}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${p.highlight ? 'bg-white text-brand-700 hover:bg-brand-50' : 'bg-brand-gradient text-white hover:opacity-90 shadow-sm'}`}>
                  {p.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-brand-gradient relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(255,255,255,0.1),_transparent_60%)]" />
        <div className="max-w-3xl mx-auto text-center relative">
          <h2 className="text-4xl font-black text-white mb-4">Ready to empty your waiting room?</h2>
          <p className="text-white/80 text-lg mb-10">Give sick patients their time back. Start for free today.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/receptionist"
              className="bg-white text-brand-700 font-bold px-8 py-4 rounded-2xl text-lg hover:bg-brand-50 transition-colors shadow-lg">
              Try the demo
            </a>
            <a href="mailto:hello@nxturn.app"
              className="border-2 border-white/40 text-white font-semibold px-8 py-4 rounded-2xl text-lg hover:bg-white/10 transition-colors">
              Talk to us
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-brand-900 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-gradient flex items-center justify-center">
              <span className="text-white font-black text-xs">N</span>
            </div>
            <span className="font-black text-white tracking-tight">Nxturn</span>
          </div>
          <p className="text-brand-400 text-sm">No more waiting rooms. Built for India. 🇮🇳</p>
          <div className="flex gap-6 text-brand-400 text-sm">
            <a href="/receptionist" className="hover:text-white transition-colors">Receptionist</a>
            <a href="/doctor" className="hover:text-white transition-colors">Analytics</a>
            <a href="mailto:hello@nxturn.app" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
