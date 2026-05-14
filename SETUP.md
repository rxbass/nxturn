# Nxturn — Setup Guide

## Prerequisites
- Node.js 18+
- Supabase CLI: `npm install -g supabase`
- Supabase project already created at supabase.com

---

## 1. Run the database migration

Go to your Supabase dashboard → SQL Editor and paste the contents of:
`supabase/migrations/20240101000000_init.sql`

Or with Supabase CLI:
```bash
supabase db push
```

---

## 2. Set environment variables

### Frontend (`.env.local` — already created)
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are already filled in
- `VITE_DEFAULT_CLINIC_ID` — update to your actual clinic UUID after running migration

### Edge functions (`supabase/functions/.env`)
- Add your `ANTHROPIC_API_KEY` from console.anthropic.com
- Add your `MSG91_AUTH_KEY` if using SMS fallback
- WhatsApp credentials are pre-filled

---

## 3. Deploy edge functions

```bash
supabase functions deploy register-patient --project-ref mqffhijxecuhhghghinc
supabase functions deploy mark-seen --project-ref mqffhijxecuhhghghinc
supabase functions deploy doctor-delay --project-ref mqffhijxecuhhghghinc
supabase functions deploy whatsapp-webhook --project-ref mqffhijxecuhhghghinc
supabase functions deploy notify-patient --project-ref mqffhijxecuhhghghinc
```

Set secrets on Supabase:
```bash
supabase secrets set --project-ref mqffhijxecuhhghghinc \
  OPENAI_API_KEY=your_key \
  WHATSAPP_TOKEN=your_token \
  WHATSAPP_PHONE_NUMBER_ID=1126068897256940 \
  WHATSAPP_VERIFY_TOKEN=nxturn_webhook_verify_2024 \
  APP_URL=https://your-vercel-domain.vercel.app
```

---

## 4. Set up WhatsApp webhook

In Meta Developer Portal → WhatsApp → Configuration:
- Webhook URL: `https://mqffhijxecuhhghghinc.supabase.co/functions/v1/whatsapp-webhook`
- Verify token: `nxturn_webhook_verify_2024`
- Subscribe to: `messages`

---

## 5. Start local development

```bash
npm run dev
```

Then open:
- Receptionist: http://localhost:5173/receptionist
- Display screen: http://localhost:5173/display/00000000-0000-0000-0000-000000000001
- Patient status: http://localhost:5173/status/{token_number}

---

## 6. Deploy frontend to Vercel

```bash
npx vercel deploy
```

Add environment variables in Vercel dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_DEFAULT_CLINIC_ID`
- `VITE_APP_URL` → your Vercel domain
