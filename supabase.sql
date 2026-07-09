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
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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

create table if not exists pending_actions (
  id bigserial primary key,
  action_type text not null,
  payload jsonb,
  status text default 'pending',
  created_at timestamptz default now(),
  confirmed_at timestamptz,
  canceled_at timestamptz
);

create table if not exists admin_sessions (
  chat_id text primary key,
  mode text not null,
  payload jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists installments (
  id bigserial primary key,
  chat_id text not null,
  initial_amount numeric default 0,
  started_at timestamptz default now(),
  day5_at timestamptz,
  day10_at timestamptz,
  day14_at timestamptz,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_installments_chat_id on installments(chat_id);
create index if not exists idx_installments_status on installments(status);

insert into reply_templates (key, title, body) values
('ask_application', 'Ariza qoldirganini so‘rash', $$Siz “O‘zbekiston Lider Yoshlari Ensiklopediyasi”ga kirish uchun ariza qoldirgansiz. Shunaqami?$$),

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

('discount_message', 'Chegirma xabari', $$Assalomu alaykum. Siz uchun ensiklopediyaga kirish bo‘yicha maxsus chegirma imkoniyati bor.

Agar bugun tasdiqlasangiz, maqola tayyorlash jarayonini boshlashimiz mumkin.$$)

on conflict (key) do update set
  title = excluded.title,
  body = excluded.body,
  updated_at = now();
