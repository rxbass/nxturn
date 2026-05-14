# Claude — AI Brain for Clinic Queue System

## What Claude does in this product

Claude acts as the intelligent brain behind the queue prediction system. Every time a receptionist taps "Mark as Seen → Next", Claude receives the latest queue data and returns precise notification times for each waiting patient.

---

## How Claude is used

### API call on every tap

Every receptionist tap triggers a Claude API call with the following context:

```javascript
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: buildPrompt(queueData)
      }
    ]
  })
});
```

---

## Prompt structure

```
You are a queue prediction engine for a medical clinic.

Doctor: Dr. Kumar
Current time: 11:00am
Day: Monday
Consultations today: 6
Average time per patient today: 8 mins
Breakdown by case type:
  - Fever: avg 7 mins (3 cases)
  - New patient: avg 14 mins (2 cases)
  - Follow-up: avg 5 mins (1 case)

Waiting patients:
  1. Patient A — fever — travel time: 10 mins
  2. Patient B — new patient — travel time: 15 mins
  3. Patient C — follow-up — travel time: 8 mins

For each waiting patient, return the exact time they should leave home.
Add a 2-minute buffer before their estimated turn.
Return ONLY a JSON array in this format:
[
  { "patient": "Patient A", "leave_at": "11:13am", "eta_turn": "11:23am" },
  ...
]
```

---

## What Claude learns over time

As more taps are recorded in the database, the prompt gets richer:

| Data point | What Claude learns |
|---|---|
| Consultation timestamps | Actual doctor pace per session |
| Case type durations | Fever vs new patient vs follow-up averages |
| Day of week patterns | Mondays slower, Fridays faster |
| Time of day patterns | Post-lunch doctor is faster |
| No-show history | Adjust queue automatically |
| Delay events | Weight recent delays higher |

Claude does not need retraining. Feeding better context = better predictions automatically.

---

## Response handling

```javascript
const data = await response.json();
const text = data.content.map(i => i.text || "").join("");
const predictions = JSON.parse(text);

// predictions = [
//   { patient: "Patient A", leave_at: "11:13am", eta_turn: "11:23am" },
//   { patient: "Patient B", leave_at: "11:20am", eta_turn: "11:35am" },
//   { patient: "Patient C", leave_at: "11:33am", eta_turn: "11:41am" },
// ]
```

Each prediction triggers a WhatsApp notification at the right time.

---

## Special scenarios handled by Claude

### Doctor delay
```
Doctor is running 30 mins late. Recalculate all patient notification times.
```

### Late patient
```
Patient A replied they need 10 more mins.
Shuffle queue — notify Patient B to come slightly earlier if possible.
```

### Emergency walk-in
```
An emergency patient has been added to the top of the queue.
Recalculate all times for remaining patients.
```

### No response patient
```
Patient A has not responded to the leave-now notification for 5 mins.
Recommend whether to bump them to end of queue or wait.
```

---

## Environment variables needed

```
ANTHROPIC_API_KEY=your_key_here
```

Never expose the API key on the frontend. All Claude calls go through a Supabase edge function.
