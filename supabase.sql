-- OLYE Business AI Bot v5 Lite
-- Supabase SQL Editor'da to'liq ishlating.

create table if not exists business_leads (
  id bigserial primary key,
  chat_id text unique not null,
  business_connection_id text,
  first_name text,
  username text,
  status text default 'active',
  stage text default 'new',
  bot_enabled boolean default true,
  is_old_lead boolean default false,
  last_user_message text,
  last_bot_message text,
  last_message_at timestamptz default now(),
  review_stage text,
  ai_intent text,
  ai_confidence numeric,
  last_bot_sent_at timestamptz,
  last_bot_template_key text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table business_leads add column if not exists business_connection_id text;
alter table business_leads add column if not exists first_name text;
alter table business_leads add column if not exists username text;
alter table business_leads add column if not exists status text default 'active';
alter table business_leads add column if not exists stage text default 'new';
alter table business_leads add column if not exists bot_enabled boolean default true;
alter table business_leads add column if not exists is_old_lead boolean default false;
alter table business_leads add column if not exists last_user_message text;
alter table business_leads add column if not exists last_bot_message text;
alter table business_leads add column if not exists last_message_at timestamptz default now();
alter table business_leads add column if not exists review_stage text;
alter table business_leads add column if not exists ai_intent text;
alter table business_leads add column if not exists ai_confidence numeric;
alter table business_leads add column if not exists last_bot_sent_at timestamptz;
alter table business_leads add column if not exists last_bot_template_key text;
alter table business_leads add column if not exists created_at timestamptz default now();
alter table business_leads add column if not exists updated_at timestamptz default now();

create index if not exists idx_business_leads_stage on business_leads(stage);
create index if not exists idx_business_leads_status on business_leads(status);
create index if not exists idx_business_leads_updated_at on business_leads(updated_at);

create table if not exists reply_templates (
  key text primary key,
  title text,
  body text not null,
  updated_at timestamptz default now()
);

create table if not exists lead_events (
  id bigserial primary key,
  chat_id text not null,
  event_type text not null,
  message text,
  created_at timestamptz default now()
);

create index if not exists idx_lead_events_chat_id on lead_events(chat_id);
create index if not exists idx_lead_events_created_at on lead_events(created_at);

-- Webhook duplicate xabarlarni qayta ishlamaslik uchun.
create table if not exists processed_messages (
  chat_id text not null,
  message_id text not null,
  created_at timestamptz default now(),
  primary key (chat_id, message_id)
);

-- Admin tugmali menyu sessiyalari.
-- Eski noto'g'ri schema bo'lsa, xavfsiz qayta yaratiladi.
drop table if exists admin_sessions;
create table admin_sessions (
  chat_id text primary key,
  mode text not null,
  payload jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

insert into reply_templates (key, title, body) values
('ask_application', 'Ariza/qiziqishni tasdiqlash', $$Siz “O‘zbekiston Lider Yoshlari Ensiklopediyasi”ga kirish uchun ariza qoldirgansiz. Shunaqami?$$),

('ask_info', 'Ma’lumot bor-yo‘qligini so‘rash', $$Ajoyib. Siz ensiklopediyamizga kirishning foydali jihatlari haqida batafsil ma’lumotga egamisiz?$$),

('short_intro', 'Qisqa tanishtiruv', $$Keling, unda yana bir bor qisqacha tanishtirib o‘taman.

“O‘zbekiston Lider Yoshlari Ensiklopediyasi” — faol, iqtidorli va tashabbuskor yoshlar haqida biografik maqola tayyorlab, ularni ensiklopediya formatida yoritadigan loyiha.

Bu siz uchun internetda ko‘rinish, shaxsiy portfolio, grant, tanlov, forum va turli arizalarda havola sifatida foydalanish imkonini beradi.$$),

('full_intro', 'To‘liq tanishtiruv', $$“O‘zbekiston Lider Yoshlari Ensiklopediyasi” — faol, iqtidorli va tashabbuskor yoshlar haqida biografik maqola tayyorlab, ularni ensiklopediya formatida yoritadigan loyiha.

Loyihaga kiritilgan ishtirokchi haqida maxsus biografik maqola tayyorlanadi. Bu maqola orqali siz haqingizdagi ma’lumotlar internetda tartibli, rasmiy va chiroyli ko‘rinishda joylashadi.

Foydali jihatlari:
— Google va boshqa qidiruv tizimlarida ko‘rinish;
— AI tizimlarida tanilish imkoniyati;
— shaxsiy portfolio sifatida foydalanish;
— grant, forum, tanlov va arizalarda havola sifatida berish;
— kelajakda Wikipedia sahifasi uchun asos bo‘lishi mumkin;
— maxsus sertifikat taqdim etiladi.$$),

('explain_reply', 'Loyiha haqida tushuntirish boshlanishi', $$Bor, tushunarli. Keling, hozir batafsil tushuntirib beraman.$$),

('offer_end', 'Oferta oxiri', $$Oferta va xabar bilan tanishib chiqing va ayting!!!$$),

('ask_bio_confirm', 'Biografik maqola taklifi', $$Ajoyib, sizga ma’qulmi? Sizga ham biografik maqola yozamizmi unda ensiklopediyamizga kiritish uchun?$$),

('bio_questions', 'Biografik savollar', $$Ajoyib. Unda quyidagi savollarga javob yuboring:

1. Ism-familiyangiz, otangizning ismi?
2. Tug‘ilgan sana va joyingiz?
3. Hozirgi yashash manzilingiz?
4. Ta’lim olgan yoki olayotgan joyingiz?
5. Hozirgi faoliyatingiz?
6. Qaysi yildan beri shu sohada faoliyat yuritasiz?
7. Yutuqlaringiz, sertifikatlaringiz, loyihalaringiz yoki muhim faoliyatlaringiz?
8. Rasm yuboring.

Ma’lumotlarni yuborganingizdan so‘ng maqola tayyorlash jarayoni boshlanadi.$$),

('price_reply', 'Narx/badal savoliga javob', $$Loyihaga kiritish uchun yillik texnik badal mavjud. Bu badal biografik maqolani tayyorlash, saytga joylash, texnik yuritish va sertifikat bilan bog‘liq xarajatlarni qoplaydi.

To‘lov karta orqali qilinadi. Xohlasangiz karta ma’lumotlarini yuboraman.$$),

('card_reply', 'Karta/to‘lov rekvizitlari', $$Ha, to‘lov karta orqali qilinadi.

Karta raqam:
0000 0000 0000 0000

Karta egasi:
ISM FAMILIYA

To‘lov qilganingizdan so‘ng chek rasmini yuboring.$$),

('expensive_reply', 'Qimmat ekan javobi', $$Tushunarli. Bu to‘lov biografik maqolani tayyorlash, saytga joylash, texnik yuritish va sertifikat bilan bog‘liq xarajatlarni qoplaydi.

Agar xohlasangiz, 14 kunlik kelishuv asosida boshlang‘ich to‘lov bilan ham boshlash mumkin.$$),

('next_steps_reply', 'Nima qilish kerak javobi', $$Jarayon oddiy:

1. Siz loyiha ma’lumoti bilan tanishasiz.
2. Ma’qul bo‘lsa, biografik maqola uchun savollarga javob yuborasiz.
3. Ma’lumotlar asosida maqola tayyorlanadi.
4. Maqola ensiklopediyaga joylanadi va sertifikat beriladi.$$),

('later_reply', 'Keyinroq javobi', $$Mayli, tushunarli. Keyinroq davom ettiramiz.$$),

('reject_reply', 'Rad javobi', $$Tushunarli. Bezovta qilgan bo‘lsak uzr. Yaxshi kun tilaymiz.$$)

on conflict (key) do update set
  title = excluded.title,
  body = excluded.body,
  updated_at = now();
