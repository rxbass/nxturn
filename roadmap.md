# Product Roadmap — Clinic Queue System

## Vision

> Give sick patients their time back. No more waiting rooms. No more guessing. Just rest at home until it's your turn.

---

## Phase 1 — MVP (Month 1)

**Goal:** Prove the core loop works with 1 real clinic.

### What gets built
- Receptionist register screen (name, phone, case type)
- "Mark as Seen → Next" single button
- Claude AI queue prediction engine
- WhatsApp notification: token link + leave-now alert
- Patient status page (no app, just a link)
- Doctor delay flow
- Late patient reply handling

### Success metric
> Did patients arrive within 5 minutes of their turn — without sitting in the waiting room?

### Target
- 1 clinic
- 1 doctor
- 1 receptionist
- ~20-40 patients per day

---

## Phase 2 — Validate & Expand (Month 2-3)

**Goal:** Prove it works across 10 clinics. Find what breaks at scale.

### What gets built
- Onboarding flow for new clinics (self-serve)
- Receptionist training guide (1 page)
- Basic analytics for clinic: avg wait time, on-time arrival rate
- Multi-doctor support within one clinic
- Emergency walk-in handling
- Feedback collection from patients (1-tap rating after visit)

### AI improvements
- Claude starts learning per-doctor patterns
- Predictions improve based on historical data
- Day-of-week and time-of-day adjustments kick in

### Success metric
- 10 clinics live
- 80%+ patients arriving within 5 mins of their turn
- Receptionists using it without hand-holding

---

## Phase 3 — Monetise (Month 4-6)

**Goal:** Convert free clinics to paying. Find the right price point.

### Pricing model

| Plan | Price | Features |
|---|---|---|
| Free | ₹0 | Basic queue, WhatsApp notifications, 1 doctor |
| Pro | ₹999/month | Analytics, delay management, multi-doctor, branding |
| Premium | ₹2,499/month | Priority support, custom messages, API access |

### What gets built
- Billing integration (Razorpay)
- Usage limits on free plan (max 30 patients/day)
- Pro feature gate
- Invoice generation for clinics

### Success metric
- 30% of active clinics convert to paid
- ₹1L MRR

---

## Phase 4 — Network Effects (Month 7-12)

**Goal:** Make the product spread by itself.

### Key insight
Patients visit multiple clinics. If they love the experience at one clinic, they'll ask for it at others.

### What gets built
- Patient profile (optional) — stores travel time, preferences across clinics
- "Request this clinic to join" feature — patient sends request to their regular doctor
- Clinic referral program — existing clinic recommends → gets 1 month free
- City-wise leaderboard — "Top clinics with zero wait time in Chennai"

### AI improvements
- Cross-clinic learning (anonymised) — AI gets smarter from aggregate data
- Predicts no-shows before they happen
- Suggests optimal appointment slots to clinic

### Success metric
- 200+ clinics
- 50% of new clinics acquired through referral/patient request
- AI prediction accuracy above 90%

---

## Phase 5 — Platform (Year 2)

**Goal:** Become the operating system for small clinics in India.

### Expansion areas

**Pre-visit**
- Symptom collection form before appointment
- Basic triage (is this urgent?)
- Document upload (prescriptions, reports)

**During visit**
- Doctor notes (voice to text)
- Prescription generation

**Post-visit**
- Medicine reminders
- Follow-up appointment nudges
- Lab report delivery

**Business layer**
- Revenue analytics for clinic
- Patient retention insights
- Staff performance (average consultation time per doctor)

### Potential integrations
- PharmEasy / Netmeds — medicine ordering from prescription
- Thyrocare / Dr. Lal — lab test booking
- Health insurance — claim assistance

---

## What we deliberately never build

- Telemedicine (different product, different trust model)
- Hospital management system (too complex, different buyer)
- EMR / Electronic Medical Records (regulatory minefield)
- Doctor discovery / marketplace (Practo already owns this)

---

## The data flywheel

```
More clinics
    ↓
More queue events logged
    ↓
Richer context for Claude
    ↓
More accurate predictions
    ↓
Better patient experience
    ↓
Patients request more clinics
    ↓
More clinics
```

Every clinic that joins makes the product smarter for all clinics.

---

## Key risks & mitigations

| Risk | Mitigation |
|---|---|
| Receptionist forgets to tap | Make the button impossible to miss. Add gentle reminder if no tap in 20 mins. |
| WhatsApp API approval delay | Apply Day 1. Use SMS as fallback during wait. |
| Clinic doesn't pay after free trial | Lock analytics behind paywall from Day 1, not after trial ends. |
| Doctor pace is unpredictable | Claude accounts for variance. Patient buffer built into every prediction. |
| Bigger player copies the idea | Speed and clinic relationships are the moat. Get to 50 clinics fast. |

---

## North star metric

**% of patients who enter a clinic within 2 minutes of their predicted turn time.**

Everything we build should move this number up.
