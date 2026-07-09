-- OLYE Business AI Bot v5 Lite
-- XAVFSIZ MIGRATSIYA: bu SQL eski lidlar va tahrirlangan shablonlarni o'chirmaydi.
-- Muhim: reply_templates insertlari ON CONFLICT DO NOTHING. Ya'ni siz tahrirlagan eski shablonlar overwrite qilinmaydi.

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
  hot_lead boolean default false,
  outreach_sent_at timestamptz,
  outreach_session_id text,
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
alter table business_leads add column if not exists hot_lead boolean default false;
alter table business_leads add column if not exists outreach_sent_at timestamptz;
alter table business_leads add column if not exists outreach_session_id text;
alter table business_leads add column if not exists created_at timestamptz default now();
alter table business_leads add column if not exists updated_at timestamptz default now();

create index if not exists idx_business_leads_stage on business_leads(stage);
create index if not exists idx_business_leads_status on business_leads(status);
create index if not exists idx_business_leads_updated_at on business_leads(updated_at);
create index if not exists idx_business_leads_hot_lead on business_leads(hot_lead);
create index if not exists idx_business_leads_outreach_session on business_leads(outreach_session_id);

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

create table if not exists processed_messages (
  chat_id text not null,
  message_id text not null,
  created_at timestamptz default now(),
  primary key (chat_id, message_id)
);

create table if not exists chat_locks (
  chat_id text primary key,
  locked_until timestamptz not null,
  updated_at timestamptz default now()
);

create table if not exists response_packages (
  package_id text primary key,
  chat_id text not null,
  turn_id text not null,
  action_name text not null,
  status text default 'sending',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);
create index if not exists idx_response_packages_chat_id on response_packages(chat_id);

create table if not exists sent_bot_messages (
  package_id text not null,
  chat_id text not null,
  message_index integer not null,
  template_key text,
  created_at timestamptz default now(),
  primary key (package_id, message_index)
);
create index if not exists idx_sent_bot_messages_chat_id on sent_bot_messages(chat_id);

-- Admin sessiyalari. Endi bu jadval drop qilinmaydi.
create table if not exists admin_sessions (
  chat_id text primary key,
  mode text not null,
  payload jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table admin_sessions add column if not exists mode text;
alter table admin_sessions add column if not exists payload jsonb default '{}'::jsonb;
alter table admin_sessions add column if not exists updated_at timestamptz default now();

-- Bot sozlamalari: Outreach Auto, greeting patternlar va hokazo.
create table if not exists bot_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

insert into bot_settings (key, value) values
('outreach_auto', '{"enabled":false}'::jsonb),
('greeting_patterns', '["assalomu alaykum", "assalomu alaykum yaxshimisiz", "assalomu alaykum, yaxshimisiz", "assalomu alaykum * yaxshimisiz"]'::jsonb)
on conflict (key) do nothing;

-- DIQQAT: quyidagi template seed eski tahrirlangan body'larni O'ZGARTIRMAYDI.
-- Faqat hali mavjud bo'lmagan yangi shablonlarni qo'shadi.
insert into reply_templates (key, title, body) values
('ask_application', 'Ariza/qiziqishni tasdiqlash', $$Siz “O‘zbekiston Lider Yoshlari Ensiklopediyasi”ga kirish uchun ariza qoldirgansiz. Shunaqami?$$),

('application_link_reply', 'Ariza havolasini yuborish', $$Tushunarli. Unda avval quyidagi havola orqali ariza qoldiring:

{APPLICATION_LINK}

Arizani yuborganingizdan so‘ng shu chatga “ariza qoldirdim” deb yozing, keyin davom ettiramiz.$$),

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

('explain_reply', 'Loyiha haqida tushuntirish boshlanishi', $$Tushunarli. Keling, hozir batafsil tushuntirib beraman.$$),

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

('human_takeover_reply', 'Operatorga o‘tkazish javobi', $$Tushunarli. Bu xabarni mas’ul odam ko‘rib chiqadi va sizga javob beradi.$$),

('voice_text_request', 'Ovozli xabar o‘rniga matn so‘rash', $$Ovozli xabaringizni qabul qildik. Iltimos, javobingizni qisqa matn ko‘rinishida yuborsangiz, davom ettirishimiz oson bo‘ladi.$$),

('media_text_request', 'Media/fayl o‘rniga matn so‘rash', $$Fayl yoki rasmni qabul qildik. Hozirgi bosqichda javobingizni qisqa matn ko‘rinishida yuborsangiz, davom ettiramiz.$$),

('next_steps_reply', 'Nima qilish kerak javobi', $$Jarayon oddiy:

1. Siz loyiha ma’lumoti bilan tanishasiz.
2. Ma’qul bo‘lsa, biografik maqola uchun savollarga javob yuborasiz.
3. Ma’lumotlar asosida maqola tayyorlanadi.
4. Maqola ensiklopediyaga joylanadi va sertifikat beriladi.$$),

('later_reply', 'Keyinroq javobi', $$Mayli, tushunarli. Keyinroq davom ettiramiz.$$),

('reject_reply', 'Rad javobi', $$Tushunarli. Bezovta qilgan bo‘lsak uzr. Yaxshi kun tilaymiz.$$)

on conflict (key) do nothing;
