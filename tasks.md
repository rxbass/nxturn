# MVP Task List — Clinic Queue System

## Progress tracker
Update the checkbox `[x]` as you complete each task.

---

## Patient channel strategy

| Patient type | Notification channel | Cost |
|---|---|---|
| Has WhatsApp | WhatsApp link (free) | ₹0 |
| No WhatsApp, has smartphone | SMS link | ~₹0.25/SMS |
| No smartphone at all | Clinic token display screen | ₹0 (one-time tablet) |

Every patient type is covered. No one is left out.

---

## Week 1 — Setup & Receptionist App

- [ ] **Apply for WhatsApp Business API**
  - Register on Meta developer portal
  - Takes 2-3 days for approval
  - Do this on Day 1 — it blocks everything else

- [ ] **Set up Supabase project**
  - Create project at supabase.com
  - Set up the following tables:
    - `clinics` — id, name, doctor_name, created_at
    - `doctors` — id, clinic_id, name
    - `patients` — id, clinic_id, name, phone, case_type, token, status, created_at
    - `queue_events` — id, clinic_id, patient_id, event_type, timestamp
  - Enable Realtime on `patients` table

- [ ] **Build receptionist register screen**
  - Fields: patient name, phone number, case type (fever / new patient / follow-up)
  - Add one extra field: "Has WhatsApp? Yes / No"
  - On submit: assign token number, add to queue
  - If WhatsApp → send WhatsApp link
  - If no WhatsApp → send SMS link (same status page, different delivery)
  - If no smartphone → assign token number only, shown on clinic display screen
  - Keep it simple — one page, no login for MVP

- [ ] **Set up SMS fallback provider**
  - Recommended: MSG91 (Indian provider, cheap, reliable)
  - Alternative: Fast2SMS (even cheaper for MVP)
  - Cost: ~₹0.15-0.25 per SMS — negligible at clinic scale
  - Only triggered when patient has no WhatsApp

- [ ] **Build clinic token display screen**
  - Simple fullscreen page showing current token number being served
  - Mounted on a cheap tablet or TV in the waiting area
  - Updates live via Supabase Realtime on every receptionist tap
  - For patients with no phone at all — they just watch the screen
  - URL: `/display/[clinic_id]` — open once, stays live all day

- [ ] **Build "Mark as Seen → Next" button**
  - One big button on receptionist screen
  - On tap: log timestamp + event to `queue_events`
  - Trigger Claude API call to recalculate queue
  - Update current patient status to "seen"

---

## Week 2 — AI Brain & Queue Logic

- [ ] **Integrate Claude API via Supabase edge function**
  - Create edge function: `recalculate-queue`
  - Called every time receptionist taps next
  - Never call Claude directly from frontend

- [ ] **Build Claude prompt with full context**
  - Include: doctor name, current time, day of week
  - Include: avg consultation time per case type (from DB history)
  - Include: list of waiting patients with case types and travel times
  - Return: JSON array of leave_at times per patient

- [ ] **Handle doctor delay flow**
  - Add "Doctor Delayed" button on receptionist screen
  - Options: 15 mins / 30 mins / 1 hour
  - Trigger Claude recalculation with delay context
  - Auto-send WhatsApp update to all waiting patients

- [ ] **Handle late patient flow**
  - Patient replies "Need more time" via WhatsApp
  - Webhook receives reply, updates patient status
  - Claude reshuffles queue, notifies next patient if needed

---

## Week 3 — Patient Experience & WhatsApp

- [ ] **Send token link on registration (WhatsApp or SMS)**
  - WhatsApp patients → send link via WhatsApp immediately
  - SMS patients → send same link via MSG91/Fast2SMS
  - No smartphone patients → token number shown on display screen only
  - Message: "Hi [name], you're registered at [clinic]. Track your turn here: [link]"
  - Link opens patient status page (no login needed)

- [ ] **Build patient status page**
  - Hosted at `/status/[token]`
  - Shows one of four states:
    - 🟡 Waiting — X patients ahead of you
    - 🟠 Get ready — your turn is coming soon
    - 🟢 Leave now — head to clinic
    - ✅ Done — please visit reception for payment
  - Auto-refreshes every 30 seconds
  - Works on any browser — no app needed

- [ ] **Send "leave now" notification (WhatsApp or SMS)**
  - WhatsApp patients → WhatsApp message with reply options
  - SMS patients → SMS with status page link
  - No smartphone patients → display screen updates automatically
  - Message: "Your turn is in ~15 mins. Time to head to [clinic name]"
  - WhatsApp only: include reply options "On my way" / "Need 10 more mins"

- [ ] **Handle patient reply via WhatsApp webhook**
  - "On my way" → keep queue as is
  - "Need 10 more mins" → Claude reshuffles
  - No reply after 5 mins → auto bump to end of queue, notify next patient
  - SMS patients — no reply handling, queue managed automatically

---

## Week 4 — Testing & First Clinic

- [ ] **End-to-end internal test**
  - Simulate a full clinic day with test phone numbers
  - Register 10 fake patients, tap through the queue
  - Verify all notifications arrive at correct times
  - Test delay flow, late patient flow, no-response flow

- [ ] **Find 1 local clinic to pilot**
  - Walk in personally — don't email or call
  - Show live demo on your phone
  - Offer completely free for 3 months
  - One good clinic is enough to start

- [ ] **Run live pilot for 1 week**
  - Real patients, real queue
  - Success metric: did patients arrive within 5 mins of their turn?
  - Track: notification accuracy, patient complaints, receptionist ease

- [ ] **Collect feedback and fix top 3 issues**
  - Talk to receptionist after each day
  - Talk to 2-3 patients directly
  - List all bugs/friction points
  - Fix only the top 3 that affect core experience

---

## Deliberately out of scope for MVP

- Payment collection
- Appointment booking
- Patient medical history
- Analytics dashboard
- Multi-doctor support
- Doctor mobile app
- Admin panel
- Multi-clinic management

These come after the pilot works.
