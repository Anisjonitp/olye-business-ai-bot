-- OLYE Business Info Only Bot v6
-- Safe SQL: existing templates are NOT overwritten.
-- You can run this repeatedly. Existing edited template bodies stay unchanged.

create table if not exists business_leads (
  id bigserial primary key,
  chat_id text unique not null,
  business_connection_id text,
  first_name text,
  username text,
  status text default 'active',
  stage text default 'new',
  bot_enabled boolean default true,
  outreach_sent boolean default false,
  outreach_session_id text,
  outreach_message text,
  outreach_at timestamptz,
  last_user_message text,
  last_bot_message text,
  last_admin_message text,
  last_message_at timestamptz default now(),
  stage_started_at timestamptz default now(),
  finished_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table business_leads add column if not exists business_connection_id text;
alter table business_leads add column if not exists first_name text;
alter table business_leads add column if not exists username text;
alter table business_leads add column if not exists status text default 'active';
alter table business_leads add column if not exists stage text default 'new';
alter table business_leads add column if not exists bot_enabled boolean default true;
alter table business_leads add column if not exists outreach_sent boolean default false;
alter table business_leads add column if not exists outreach_session_id text;
alter table business_leads add column if not exists outreach_message text;
alter table business_leads add column if not exists outreach_at timestamptz;
alter table business_leads add column if not exists last_user_message text;
alter table business_leads add column if not exists last_bot_message text;
alter table business_leads add column if not exists last_admin_message text;
alter table business_leads add column if not exists last_message_at timestamptz default now();
alter table business_leads add column if not exists stage_started_at timestamptz default now();
alter table business_leads add column if not exists finished_at timestamptz;
alter table business_leads add column if not exists created_at timestamptz default now();
alter table business_leads add column if not exists updated_at timestamptz default now();

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

create table if not exists processed_messages (
  message_key text primary key,
  chat_id text,
  created_at timestamptz default now()
);

create table if not exists sent_actions (
  action_key text primary key,
  chat_id text not null,
  action_name text not null,
  stage text,
  message text,
  created_at timestamptz default now()
);

create table if not exists bot_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists admin_sessions (
  chat_id text primary key,
  mode text not null,
  payload jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- IMPORTANT: on conflict do nothing = your edited templates will NOT be overwritten.
insert into reply_templates (key, title, body) values
('ask_application', 'Ariza qoldirganini so‘rash', 'Assalomu alaykum. Siz “O‘zbekiston Lider Yoshlari Ensiklopediyasi”ga kirish uchun ariza qoldirgansiz. Shunaqami?'),

('ask_info', 'Ma’lumot bor-yo‘qligini so‘rash', 'Ajoyib. Siz ensiklopediyamizga kirishning foydali jihatlari haqida batafsil ma’lumotga egamisiz?'),

('known_info_preface', 'Ma’lumot bor desa kirish', 'Keling, unda yana bir bor qisqacha tanishtirib o‘taman.'),

('unknown_info_preface', 'Ma’lumot yo‘q desa kirish', 'Keling, unda batafsil tushuntirib beraman.'),

('short_intro', 'Qisqa tanishtiruv', '“O‘zbekiston Lider Yoshlari Ensiklopediyasi” — faol, iqtidorli va tashabbuskor yoshlar haqida biografik maqola tayyorlab, ularni ensiklopediya formatida yoritadigan loyiha.

Bu siz uchun internetda ko‘rinish, shaxsiy portfolio, grant, tanlov, forum va turli arizalarda havola sifatida foydalanish imkonini beradi.'),

('full_intro', 'Batafsil ma’lumot', '“O‘zbekiston Lider Yoshlari Ensiklopediyasi” — faol, iqtidorli va tashabbuskor yoshlar haqida biografik maqola tayyorlab, ularni ensiklopediya formatida yoritadigan loyiha.

Loyihaga kiritilgan ishtirokchi haqida maxsus biografik maqola tayyorlanadi. Bu maqola orqali siz haqingizdagi ma’lumotlar internetda tartibli, rasmiy va chiroyli ko‘rinishda joylashadi.

Foydali jihatlari:
— Google va boshqa qidiruv tizimlarida ko‘rinish;
— shaxsiy portfolio sifatida foydalanish;
— grant, forum, tanlov va arizalarda havola sifatida berish;
— kelajakda Wikipedia sahifasi uchun asos bo‘lishi mumkin;
— maxsus sertifikat taqdim etiladi.'),

('offer_end', 'Oferta oxiri', 'Oferta va xabar bilan tanishib chiqing va ayting!!!'),

('application_link_reply', 'Ariza havolasi', 'Keling, unda avval ushbu havola orqali ariza qoldiring va qayta yozing.

{APPLICATION_LINK}'),

('clarify_application', 'Ariza aniqlashtirish', 'Aniqlik uchun ayting: ariza qoldirganmisiz? Ha yoki yo‘q deb javob bersangiz bo‘ladi.'),

('finished_notice_admin', 'Bot to‘xtadi admin eslatma', '✅ Bot ma’lumot va oferta xabarini yubordi. Endi ushbu chatni qo‘lda davom ettiring.'),

('media_text_request', 'Media o‘rniga matn so‘rash', 'Iltimos, javobingizni qisqa matn ko‘rinishida yuborsangiz, davom ettiramiz.')
on conflict (key) do nothing;
