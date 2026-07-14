-- OLYE Business Info Only Bot v6
-- Safe SQL: existing templates are NOT overwritten.
-- You can run this repeatedly. Existing edited template bodies stay unchanged.

create table if not exists business_leads (
  id bigserial primary key,
  chat_id text unique not null,
  account_key text,
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

create table if not exists bot_accounts (
  account_key text primary key,
  label text,
  business_owner_id text,
  admin_chat_id text,
  business_connection_id text,
  project_name text,
  auto_reply_enabled boolean default false,
  archive_enabled boolean default true,
  archive_notify_enabled boolean default true,
  daily_auto jsonb default '{}'::jsonb,
  flow_key text default 'info_only',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table bot_accounts add column if not exists label text;
alter table bot_accounts add column if not exists business_owner_id text;
alter table bot_accounts add column if not exists admin_chat_id text;
alter table bot_accounts add column if not exists business_connection_id text;
alter table bot_accounts add column if not exists project_name text;
alter table bot_accounts add column if not exists auto_reply_enabled boolean default false;
alter table bot_accounts add column if not exists archive_enabled boolean default true;
alter table bot_accounts add column if not exists archive_notify_enabled boolean default true;
alter table bot_accounts add column if not exists daily_auto jsonb default '{}'::jsonb;
alter table bot_accounts add column if not exists flow_key text default 'info_only';
alter table bot_accounts add column if not exists created_at timestamptz default now();
alter table bot_accounts add column if not exists updated_at timestamptz default now();

alter table business_leads add column if not exists account_key text;
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
  account_key text,
  title text,
  body text not null,
  updated_at timestamptz default now()
);

alter table reply_templates add column if not exists account_key text;

create table if not exists lead_events (
  id bigserial primary key,
  chat_id text not null,
  account_key text,
  event_type text not null,
  message text,
  created_at timestamptz default now()
);

alter table lead_events add column if not exists account_key text;

create table if not exists processed_messages (
  message_key text primary key,
  account_key text,
  chat_id text,
  created_at timestamptz default now()
);

alter table processed_messages add column if not exists account_key text;

create table if not exists sent_actions (
  action_key text primary key,
  chat_id text not null,
  account_key text,
  action_name text not null,
  stage text,
  message text,
  created_at timestamptz default now()
);

alter table sent_actions add column if not exists account_key text;

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

create table if not exists message_archive (
  id bigserial primary key,
  account_key text,
  business_connection_id text,
  chat_id text not null,
  message_id bigint not null,
  from_id text,
  from_username text,
  from_first_name text,
  direction text default 'unknown',
  message_type text default 'other',
  text text,
  caption text,
  file_id text,
  file_unique_id text,
  file_name text,
  mime_type text,
  file_size bigint,
  storage_path text,
  public_url text,
  raw_json jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  edit_count integer default 0,
  delete_detected boolean default false,
  last_event_type text
);

create table if not exists message_edit_history (
  id bigserial primary key,
  archive_id bigint,
  account_key text,
  chat_id text not null,
  message_id bigint not null,
  old_text text,
  new_text text,
  old_caption text,
  new_caption text,
  old_raw_json jsonb,
  new_raw_json jsonb,
  edited_at timestamptz default now()
);

create table if not exists account_flow_steps (
  id bigserial primary key,
  account_key text not null,
  flow_key text not null,
  step_key text not null,
  template_key text not null,
  next_step_yes text,
  next_step_no text,
  next_step_partial text,
  next_step_unknown text,
  stop_after_send boolean default false,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table account_flow_steps add column if not exists account_key text;
alter table account_flow_steps add column if not exists flow_key text;
alter table account_flow_steps add column if not exists step_key text;
alter table account_flow_steps add column if not exists template_key text;
alter table account_flow_steps add column if not exists next_step_yes text;
alter table account_flow_steps add column if not exists next_step_no text;
alter table account_flow_steps add column if not exists next_step_partial text;
alter table account_flow_steps add column if not exists next_step_unknown text;
alter table account_flow_steps add column if not exists stop_after_send boolean default false;
alter table account_flow_steps add column if not exists sort_order integer default 0;
alter table account_flow_steps add column if not exists is_active boolean default true;
alter table account_flow_steps add column if not exists created_at timestamptz default now();
alter table account_flow_steps add column if not exists updated_at timestamptz default now();

alter table message_archive add column if not exists account_key text;
alter table message_archive add column if not exists business_connection_id text;
alter table message_archive add column if not exists chat_id text;
alter table message_archive add column if not exists message_id bigint;
alter table message_archive add column if not exists from_id text;
alter table message_archive add column if not exists from_username text;
alter table message_archive add column if not exists from_first_name text;
alter table message_archive add column if not exists direction text default 'unknown';
alter table message_archive add column if not exists message_type text default 'other';
alter table message_archive add column if not exists text text;
alter table message_archive add column if not exists caption text;
alter table message_archive add column if not exists file_id text;
alter table message_archive add column if not exists file_unique_id text;
alter table message_archive add column if not exists file_name text;
alter table message_archive add column if not exists mime_type text;
alter table message_archive add column if not exists file_size bigint;
alter table message_archive add column if not exists storage_path text;
alter table message_archive add column if not exists public_url text;
alter table message_archive add column if not exists raw_json jsonb default '{}'::jsonb;
alter table message_archive add column if not exists created_at timestamptz default now();
alter table message_archive add column if not exists edited_at timestamptz;
alter table message_archive add column if not exists deleted_at timestamptz;
alter table message_archive add column if not exists edit_count integer default 0;
alter table message_archive add column if not exists delete_detected boolean default false;
alter table message_archive add column if not exists last_event_type text;

alter table message_edit_history add column if not exists archive_id bigint;
alter table message_edit_history add column if not exists account_key text;
alter table message_edit_history add column if not exists chat_id text;
alter table message_edit_history add column if not exists message_id bigint;
alter table message_edit_history add column if not exists old_text text;
alter table message_edit_history add column if not exists new_text text;
alter table message_edit_history add column if not exists old_caption text;
alter table message_edit_history add column if not exists new_caption text;
alter table message_edit_history add column if not exists old_raw_json jsonb;
alter table message_edit_history add column if not exists new_raw_json jsonb;
alter table message_edit_history add column if not exists edited_at timestamptz default now();

create index if not exists business_leads_account_idx on business_leads(account_key);
create index if not exists business_leads_account_stage_idx on business_leads(account_key, stage);
create index if not exists business_leads_account_status_idx on business_leads(account_key, status);
create index if not exists business_leads_account_outreach_idx on business_leads(account_key, outreach_session_id);
create index if not exists reply_templates_account_idx on reply_templates(account_key);
create index if not exists lead_events_account_idx on lead_events(account_key, created_at desc);
create index if not exists processed_messages_account_idx on processed_messages(account_key);
create index if not exists sent_actions_account_idx on sent_actions(account_key);
create unique index if not exists message_archive_account_chat_message_idx on message_archive(account_key, chat_id, message_id);
create index if not exists message_archive_chat_idx on message_archive(chat_id);
create index if not exists message_archive_message_idx on message_archive(message_id);
create index if not exists message_archive_account_idx on message_archive(account_key);
create index if not exists message_archive_deleted_idx on message_archive(deleted_at);
create index if not exists message_archive_edited_idx on message_archive(edited_at);
create index if not exists message_archive_media_idx on message_archive(account_key, message_type) where file_id is not null;
create index if not exists message_edit_history_chat_idx on message_edit_history(chat_id);
create index if not exists message_edit_history_message_idx on message_edit_history(message_id);
create index if not exists message_edit_history_account_idx on message_edit_history(account_key);
create index if not exists message_edit_history_edited_idx on message_edit_history(edited_at);
create unique index if not exists account_flow_steps_unique_idx on account_flow_steps(account_key, flow_key, step_key);
create index if not exists account_flow_steps_account_idx on account_flow_steps(account_key, flow_key, sort_order);

insert into bot_accounts (account_key, label, project_name, business_owner_id, admin_chat_id, flow_key, archive_enabled, archive_notify_enabled)
values ('uzlye', 'UZLYE', 'O‘zbekiston Lider Yoshlari Ensiklopediyasi', null, null, 'uzlye_info_only', true, true)
on conflict (account_key) do nothing;

insert into account_flow_steps (account_key, flow_key, step_key, template_key, next_step_yes, next_step_no, next_step_partial, next_step_unknown, stop_after_send, sort_order, is_active)
values
('uzlye', 'uzlye_info_only', 'ask_application', 'ask_application', 'ask_info', 'application_link', 'ask_info', null, false, 10, true),
('uzlye', 'uzlye_info_only', 'ask_info', 'ask_info', 'has_info', 'no_info', 'has_info', 'no_info', false, 20, true),
('uzlye', 'uzlye_info_only', 'has_info', 'known_info_preface,short_intro,offer_end', null, null, null, null, true, 30, true),
('uzlye', 'uzlye_info_only', 'no_info', 'unknown_info_preface,full_intro,offer_end', null, null, null, null, true, 40, true),
('uzlye', 'uzlye_info_only', 'application_link', 'application_link_reply', null, null, null, null, true, 50, true)
on conflict (account_key, flow_key, step_key) do nothing;

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

-- New v6 menu/reminder template. Safe: existing edited template is NOT overwritten.
insert into reply_templates (key, title, body) values
('offer_followup', 'Oferta eslatma', 'Tanishib chiqdingizmi? Biz sizni kutyapmiz.')
on conflict (key) do nothing;
