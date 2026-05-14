# Tech Stack — Clinic Queue System

## Overview

| Layer | Tool | Purpose |
|---|---|---|
| Frontend | React + Tailwind | Receptionist app, patient status page, display screen |
| Backend | Supabase Edge Functions | API logic, Claude calls, webhook handling |
| Database | Supabase (Postgres) | Queue data, patient records, clinic events |
| Realtime | Supabase Realtime | Live queue updates to display screen and status page |
| AI Brain | Claude API (Sonnet) | Queue prediction, delay handling, reshuffle logic |
| Notifications | WhatsApp Business API | Token link, leave-now alert, patient replies |
| SMS Fallback | MSG91 / Fast2SMS | For patients without WhatsApp |
| Hosting | Vercel | Frontend deployment |

---

## Frontend — React + Tailwind

### Three screens to build

**1. Receptionist App** (`/receptionist/[clinic_id]`)
- Register patient form — name, phone, case type, WhatsApp yes/no
- Current queue list — who's being seen, who's waiting
- "Mark as Seen → Next" — one big button
- "Doctor Delayed" button — 15 / 30 / 60 mins options

**2. Patient Status Page** (`/status/[token]`)
- No login needed — just a link
- Shows live queue state: waiting / get ready / leave now / done
- Auto-refreshes every 30 seconds via Supabase Realtime
- Works on any browser, any phone

**3. Clinic Display Screen** (`/display/[clinic_id]`)
- Fullscreen token number display
- Mounted on tablet or TV in waiting area
- For patients with no smartphone
- Updates live on every receptionist tap

### Setup
```bash
npx create-react-app clinic-queue
cd clinic-queue
npm install @supabase/supabase-js
npm install -D tailwindcss
```

---

## Backend — Supabase Edge Functions

All business logic lives in edge functions. Frontend never calls Claude or WhatsApp directly.

### Edge functions to build

| Function | Trigger | What it does |
|---|---|---|
| `register-patient` | Receptionist submits form | Adds patient to queue, sends WhatsApp/SMS |
| `mark-seen` | Receptionist taps Next | Logs event, calls Claude, sends notifications |
| `doctor-delay` | Receptionist taps Delay | Recalculates queue, notifies all waiting patients |
| `whatsapp-webhook` | Patient replies on WhatsApp | Handles "on my way" / "need more time" responses |
| `notify-patient` | Called internally | Sends WhatsApp or SMS based on patient preference |

### Setup
```bash
npm install -g supabase
supabase init
supabase functions new register-patient
supabase functions new mark-seen
supabase functions new doctor-delay
supabase functions new whatsapp-webhook
supabase functions new notify-patient
```

---

## Database — Supabase Postgres

### Tables

```sql
-- Clinics
create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  doctor_name text not null,
  created_at timestamptz default now()
);

-- Patients (queue entries)
create table patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  name text not null,
  phone text not null,
  case_type text not null, -- 'fever' | 'new_patient' | 'follow_up'
  has_whatsapp boolean default true,
  token_number int not null,
  status text default 'waiting', -- 'waiting' | 'ready' | 'in_progress' | 'seen'
  notified_at timestamptz,
  created_at timestamptz default now()
);

-- Queue events (every tap gets logged — this is AI training data)
create table queue_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  patient_id uuid references patients(id),
  event_type text not null, -- 'registered' | 'seen' | 'delayed' | 'late' | 'no_show'
  delay_minutes int, -- filled when event_type = 'delayed'
  consultation_duration_mins int, -- filled when event_type = 'seen'
  timestamp timestamptz default now()
);
```

### Enable Realtime
```sql
-- Enable realtime on patients table for live display screen updates
alter publication supabase_realtime add table patients;
```

---

## AI Brain — Claude API

### Model
```
claude-sonnet-4-20250514
```

### When Claude is called
Every time receptionist taps "Mark as Seen → Next" — inside the `mark-seen` edge function.

### What gets sent to Claude

```javascript
const prompt = `
You are a queue prediction engine for a medical clinic.

Doctor: ${doctor_name}
Current time: ${current_time}
Day: ${day_of_week}
Consultations completed today: ${completed_count}
Average consultation time today: ${avg_duration} mins
Breakdown by case type:
${case_type_breakdown}

Waiting patients:
${waiting_patients.map((p, i) =>
  `${i + 1}. ${p.name} — ${p.case_type} — travel time: ${p.travel_mins} mins`
).join('\n')}

For each waiting patient, return the exact time they should leave home.
Include a 2-minute buffer before their estimated turn.
Return ONLY a JSON array, no explanation:
[
  { "patient_id": "...", "leave_at": "11:13am", "eta_turn": "11:23am" },
  ...
]
`;
```

### Cost estimate
- ~500 tokens per call
- ~40 patients per clinic per day = 40 calls
- Claude Sonnet pricing: roughly ₹1-2 per clinic per day
- Essentially free at MVP scale

---

## Notifications — WhatsApp Business API

### Message category
**Service** — completely free since November 1, 2024. Unlimited, no monthly cap.

### Setup
1. Go to [Meta Developer Portal](https://developers.facebook.com)
2. Create a WhatsApp Business App
3. Apply for WhatsApp Business API access
4. Approval takes 2-3 days — **apply on Day 1**

### Environment variables
```
WHATSAPP_TOKEN=your_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_VERIFY_TOKEN=your_webhook_verify_token
```

### Messages sent

**1. Registration confirmation**
```
Hi [name], you're registered at [clinic name].
Token number: [token]
Track your turn live here: [link]
We'll message you when it's time to leave home 🏥
```

**2. Leave now alert**
```
Your turn is in ~15 mins.
Time to head to [clinic name] 🏥

Reply:
1️⃣ On my way
2️⃣ Need 10 more mins
```

**3. Doctor delay update**
```
Dr. [name] is running [X] mins late today.
Your updated turn time is [new_time].
Stay comfortable at home — we'll notify you 🙏
```

### Webhook (patient replies)
```javascript
// POST /whatsapp-webhook
// Handles incoming replies from patients
if (message.text === '1' || message.text.toLowerCase().includes('on my way')) {
  // Keep queue as is
} else if (message.text === '2' || message.text.toLowerCase().includes('need')) {
  // Claude reshuffles queue
} else {
  // Unknown reply — ignore
}
```

---

## SMS Fallback — MSG91

Used only when patient has no WhatsApp.

### Why MSG91
- Indian provider — better delivery rates in India
- Simple REST API
- Cost: ~₹0.15-0.25 per SMS
- Free tier available for testing

### Setup
```
MSG91_AUTH_KEY=your_auth_key
MSG91_SENDER_ID=CLINIC (or your registered sender ID)
```

### SMS sent
```
[Clinic name]: Hi [name], token [number].
Track your turn: [link]
We'll SMS you when to leave.
```

### Alternative
**Fast2SMS** — even cheaper, good for very early MVP testing.

---

## Hosting — Vercel

### Frontend deployment
```bash
npm install -g vercel
vercel deploy
```

### Environment variables on Vercel
```
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## Cost at MVP scale (1 clinic, 40 patients/day)

| Service | Cost | Notes |
|---|---|---|
| Supabase | ₹0 | Free tier — 500MB DB, 2GB bandwidth |
| Vercel | ₹0 | Free tier — plenty for MVP |
| WhatsApp Business API | ₹0 | Service messages are free |
| Claude API | ~₹1-2/day | ~40 API calls per clinic per day |
| SMS (MSG91) | ~₹2-3/day | Only for patients without WhatsApp |
| **Total** | **~₹3-5/day** | **Less than a cup of chai** |

---

## Scaling later (50+ clinics)

- Supabase Pro — $25/month
- Vercel Pro — $20/month
- Claude API — scales linearly with usage
- WhatsApp — still free (service messages)
- SMS — still ~₹0.25 per message

No architecture changes needed. Same stack handles 500 clinics.

---

## Local development setup

```bash
# 1. Clone and install
git clone your-repo
cd clinic-queue
npm install

# 2. Set up environment variables
cp .env.example .env.local
# Fill in Supabase URL, keys, WhatsApp token, MSG91 key, Anthropic API key

# 3. Start Supabase locally
supabase start

# 4. Run edge functions locally
supabase functions serve

# 5. Start frontend
npm start
```

---

## Environment variables — full list

```
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Claude AI
ANTHROPIC_API_KEY=

# WhatsApp Business API
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=

# SMS Fallback
MSG91_AUTH_KEY=
MSG91_SENDER_ID=

# App
REACT_APP_SUPABASE_URL=
REACT_APP_SUPABASE_ANON_KEY=
```
