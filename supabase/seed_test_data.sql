-- ─── Fresh start ───────────────────────────────────────────────────────────
truncate table queue_events restart identity cascade;
truncate table patients restart identity cascade;

-- ─── 20 test patients for today ────────────────────────────────────────────
-- Clinic ID: 4bc1f360-12d8-4205-b68c-9f4c163160d8 (Test Clinic / Dr. Kumar)

insert into patients
  (clinic_id, name, phone, case_type, has_whatsapp, token_number, status,
   appointment_date, travel_mins, symptoms, notes, priority)
values

-- Seen patients (first 5 — already done for the day)
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Rajesh Kumar',    '919876543210', 'new_patient', true,  1, 'seen',        '2026-05-14', 10, ARRAY['Fever','Headache'],            null,                        false),
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Priya Sharma',    '919765432109', 'follow_up',   true,  2, 'seen',        '2026-05-14', 20, ARRAY['Back pain','Weakness'],         null,                        false),
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Mohammed Irfan',  '919654321098', 'new_patient', false, 3, 'seen',        '2026-05-14', 30, ARRAY['Cold','Cough','Throat pain'],   null,                        false),
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Lakshmi Devi',    '919543210987', 'follow_up',   true,  4, 'seen',        '2026-05-14', 15, ARRAY['Joint pain'],                  'Diabetic patient',          false),
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Arun Patel',      '919432109876', 'new_patient', true,  5, 'seen',        '2026-05-14', 25, ARRAY['Stomach ache','Vomiting'],     null,                        false),

-- In progress (currently with doctor)
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Sunita Rao',      '919321098765', 'follow_up',   true,  6, 'in_progress', '2026-05-14', 10, ARRAY['Body pain','Fever'],           null,                        false),

-- Ready (next up — notified to get ready)
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Vikram Singh',    '919210987654', 'new_patient', true,  7, 'ready',       '2026-05-14', 20, ARRAY['Chest pain','Breathlessness'], 'Referred by Dr. Mehta',     false),

-- Waiting patients
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Anitha Menon',    '919109876543', 'follow_up',   true,  8, 'waiting',     '2026-05-14', 15, ARRAY['Headache','Dizziness'],        null,                        false),
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Suresh Babu',     '919098765432', 'new_patient', false, 9, 'waiting',     '2026-05-14', 35, ARRAY['Skin rash','Fever'],           null,                        false),
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Deepa Nair',      '918987654321', 'follow_up',   true,  10,'waiting',    '2026-05-14', 10, ARRAY['Ear pain'],                    null,                        false),
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Ramesh Gupta',    '918876543219', 'new_patient', true,  11,'waiting',    '2026-05-14', 20, ARRAY['Dysentery','Stomach ache'],    null,                        false),
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Kavitha Reddy',   '918765432198', 'follow_up',   true,  12,'waiting',    '2026-05-14', 15, ARRAY['Eye problem'],                 'Post-op checkup',           false),
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Abdul Rashid',    '918654321987', 'new_patient', true,  13,'waiting',    '2026-05-14', 25, ARRAY['Cough','Cold','Weakness'],     null,                        false),
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Meena Krishnan',  '918543219876', 'follow_up',   false, 14,'waiting',    '2026-05-14', 30, ARRAY['Back pain'],                   null,                        false),
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Santosh Joshi',   '918432198765', 'new_patient', true,  15,'waiting',    '2026-05-14', 10, ARRAY['Vomiting','Fever','Body pain'],'Elderly patient',           false),

-- Priority patient
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Geetha Iyer',     '918321987654', 'new_patient', true,  16,'waiting',    '2026-05-14', 10, ARRAY['Chest pain'],                  '75 years old — urgent',     true),

-- More waiting
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Ravi Chandran',   '918210976543', 'follow_up',   true,  17,'waiting',    '2026-05-14', 20, ARRAY['Joint pain','Body pain'],      null,                        false),
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Pooja Verma',     '918109865432', 'new_patient', true,  18,'waiting',    '2026-05-14', 15, ARRAY['Throat pain','Fever'],         null,                        false),

-- Cancelled
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Kiran Bhat',      '917998754321', 'follow_up',   true,  19,'cancelled',  '2026-05-14', 25, ARRAY['Headache'],                    null,                        false),

-- Last waiting
('4bc1f360-12d8-4205-b68c-9f4c163160d8', 'Nalini Pillai',   '917887643210', 'new_patient', true,  20,'waiting',    '2026-05-14', 35, ARRAY['Cold','Cough'],                null,                        false);


-- ─── Queue events for seen patients (gives AI real consultation duration data) ─
-- Token 1 — Rajesh Kumar (new patient, fever+headache, took 15 mins)
insert into queue_events (clinic_id, patient_id, event_type, consultation_duration_mins, timestamp)
select '4bc1f360-12d8-4205-b68c-9f4c163160d8', id, 'seen', 15, '2026-05-14T17:15:00+05:30'
from patients where token_number = 1 and appointment_date = '2026-05-14';

-- Token 2 — Priya Sharma (follow-up, back pain, took 8 mins)
insert into queue_events (clinic_id, patient_id, event_type, consultation_duration_mins, timestamp)
select '4bc1f360-12d8-4205-b68c-9f4c163160d8', id, 'seen', 8, '2026-05-14T17:23:00+05:30'
from patients where token_number = 2 and appointment_date = '2026-05-14';

-- Token 3 — Mohammed Irfan (new patient, cold+cough, took 12 mins)
insert into queue_events (clinic_id, patient_id, event_type, consultation_duration_mins, timestamp)
select '4bc1f360-12d8-4205-b68c-9f4c163160d8', id, 'seen', 12, '2026-05-14T17:35:00+05:30'
from patients where token_number = 3 and appointment_date = '2026-05-14';

-- Token 4 — Lakshmi Devi (follow-up, joint pain, took 6 mins)
insert into queue_events (clinic_id, patient_id, event_type, consultation_duration_mins, timestamp)
select '4bc1f360-12d8-4205-b68c-9f4c163160d8', id, 'seen', 6, '2026-05-14T17:41:00+05:30'
from patients where token_number = 4 and appointment_date = '2026-05-14';

-- Token 5 — Arun Patel (new patient, stomach, took 14 mins)
insert into queue_events (clinic_id, patient_id, event_type, consultation_duration_mins, timestamp)
select '4bc1f360-12d8-4205-b68c-9f4c163160d8', id, 'seen', 14, '2026-05-14T17:55:00+05:30'
from patients where token_number = 5 and appointment_date = '2026-05-14';

-- Token 6 — Sunita Rao started (in_progress event)
insert into queue_events (clinic_id, patient_id, event_type, timestamp)
select '4bc1f360-12d8-4205-b68c-9f4c163160d8', id, 'in_progress', '2026-05-14T17:56:00+05:30'
from patients where token_number = 6 and appointment_date = '2026-05-14';

-- ─── Update clinics visiting hours ─────────────────────────────────────────
update clinics
set visiting_start = '17:00', visiting_end = '21:00'
where id = '4bc1f360-12d8-4205-b68c-9f4c163160d8';
