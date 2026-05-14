-- ─────────────────────────────────────────────────────────────────
-- NXTURN — Full Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────

-- Clinics
create table if not exists clinics (
  id             uuid    primary key default gen_random_uuid(),
  name           text    not null,
  doctor_name    text    not null,
  clinic_code    text,
  visiting_start text    default '10:00',  -- 24h format, e.g. "10:00"
  visiting_end   text    default '13:00',  -- 24h format, e.g. "13:00"
  created_at     timestamptz default now()
);

-- Patients (one row per queue entry per day)
create table if not exists patients (
  id             uuid    primary key default gen_random_uuid(),
  clinic_id      uuid    references clinics(id) on delete cascade,
  name           text    not null,
  phone          text    not null,
  case_type      text    not null check (case_type in ('fever', 'new_patient', 'follow_up')),
  has_whatsapp   boolean default true,
  token_number   int     not null,
  status         text    default 'waiting' check (status in ('waiting', 'ready', 'in_progress', 'seen')),
  travel_mins    int     default 15,
  leave_at       text,       -- AI-predicted leave time, e.g. "11:13am"
  eta_turn       text,       -- AI-predicted turn time, e.g. "11:23am"
  notified_at    timestamptz,
  created_at     timestamptz default now()
);

-- Queue events (every action logged — this is the AI's training data)
create table if not exists queue_events (
  id                         uuid primary key default gen_random_uuid(),
  clinic_id                  uuid references clinics(id) on delete cascade,
  patient_id                 uuid references patients(id) on delete set null,
  event_type                 text not null check (event_type in (
                               'registered', 'seen', 'in_progress',
                               'delayed', 'late', 'no_show'
                             )),
  delay_minutes              int,   -- filled when event_type = 'delayed'
  consultation_duration_mins int,   -- filled when event_type = 'seen'
  timestamp                  timestamptz default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────
create index if not exists patients_clinic_id_status on patients(clinic_id, status);
create index if not exists patients_token_number     on patients(token_number);
create index if not exists queue_events_clinic_id    on queue_events(clinic_id);
create index if not exists queue_events_patient_id   on queue_events(patient_id);

-- ─── Realtime ─────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'patients'
  ) then
    alter publication supabase_realtime add table patients;
  end if;
end $$;

-- ─── Row Level Security ───────────────────────────────────────────
alter table clinics      enable row level security;
alter table patients     enable row level security;
alter table queue_events enable row level security;

-- Drop existing policies first to avoid duplicate errors on re-run
drop policy if exists "public read clinics"          on clinics;
drop policy if exists "public update clinics"        on clinics;
drop policy if exists "public read patients"         on patients;
drop policy if exists "public insert patients"       on patients;
drop policy if exists "public update patients"       on patients;
drop policy if exists "public read queue_events"     on queue_events;
drop policy if exists "public insert queue_events"   on queue_events;

-- Public access (no auth for MVP)
create policy "public read clinics"        on clinics      for select using (true);
create policy "public update clinics"      on clinics      for update using (true);
create policy "public read patients"       on patients     for select using (true);
create policy "public insert patients"     on patients     for insert with check (true);
create policy "public update patients"     on patients     for update using (true);
create policy "public read queue_events"   on queue_events for select using (true);
create policy "public insert queue_events" on queue_events for insert with check (true);

-- ─── Add columns to existing table (safe to run on existing DB) ───
alter table clinics add column if not exists visiting_start text default '10:00';
alter table clinics add column if not exists visiting_end   text default '13:00';
alter table clinics alter column clinic_code drop not null;

alter table patients add column if not exists symptoms         text[] default '{}';
alter table patients add column if not exists appointment_date date   default current_date;

-- Update case_type to new_patient / follow_up only
alter table patients drop constraint if exists patients_case_type_check;
alter table patients add constraint patients_case_type_check
  check (case_type in ('new_patient', 'follow_up'));

-- Allow cancelled status
alter table patients drop constraint if exists patients_status_check;
alter table patients add constraint patients_status_check
  check (status in ('waiting', 'ready', 'in_progress', 'seen', 'cancelled'));
