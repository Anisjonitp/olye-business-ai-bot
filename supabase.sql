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
  owner_user_id text,
  owner_username text,
  owner_first_name text,
  business_owner_id text,
  admin_chat_id text,
  business_connection_id text,
  project_name text,
  bot_enabled boolean default true,
  auto_reply_enabled boolean default false,
  archive_enabled boolean default true,
  archive_notify_enabled boolean default true,
  reports_enabled boolean default true,
  custom_commands_enabled boolean default true,
  ai_rules_enabled boolean default true,
  media_archive_enabled boolean default true,
  media_archive_download boolean default false,
  media_archive_max_bytes bigint default 20000000,
  storage_bucket text default 'business-media-archive',
  daily_auto jsonb default '{}'::jsonb,
  daily_report_time text default '18:00',
  flow_key text default 'info_only',
  timezone text default 'Asia/Tashkent',
  last_seen_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists business_connection_accounts (
  business_connection_id text primary key,
  account_key text not null,
  user_id text,
  username text,
  first_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists business_accounts (
  account_key text primary key,
  label text,
  project_name text,
  owner_user_id text,
  owner_username text,
  admin_chat_id text,
  business_connection_id text,
  bot_enabled boolean default true,
  auto_reply_enabled boolean default false,
  archive_enabled boolean default true,
  reports_enabled boolean default true,
  ai_intent_enabled boolean default false,
  custom_commands_enabled boolean default true,
  ai_rules_enabled boolean default true,
  timezone text default 'Asia/Tashkent',
  last_seen_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists account_admins (
  id bigserial primary key,
  account_key text not null,
  telegram_user_id text not null,
  username text,
  role text default 'owner',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists platform_admins (
  telegram_user_id text primary key,
  username text,
  role text default 'owner',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists platform_audit_logs (
  id bigserial primary key,
  admin_user_id text,
  admin_username text,
  action text not null,
  target_account_key text,
  before_json jsonb default '{}'::jsonb,
  after_json jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists account_custom_commands (
  id bigserial primary key,
  account_key text not null,
  command_key text not null,
  title text,
  description text,
  trigger_type text default 'slash_command',
  trigger_patterns jsonb default '[]'::jsonb,
  response_type text default 'text',
  response_text text,
  template_key text,
  template_sequence jsonb default '[]'::jsonb,
  flow_key text,
  step_key text,
  ai_rule_key text,
  is_enabled boolean default true,
  notify_admin boolean default false,
  stop_after_response boolean default false,
  sort_order integer default 100,
  created_by text,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists custom_command_executions (
  id bigserial primary key,
  account_key text not null,
  command_key text not null,
  chat_id text,
  business_connection_id text,
  matched boolean default true,
  user_text text,
  response_type text,
  created_at timestamptz default now()
);

create table if not exists account_setup_sessions (
  telegram_user_id text primary key,
  account_key text,
  mode text,
  step text,
  payload jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists account_ai_rules (
  id bigserial primary key,
  account_key text not null,
  rule_key text not null,
  display_name text,
  flow_key text,
  step_key text,
  example_phrases jsonb default '[]'::jsonb,
  target_intent text,
  confidence_threshold numeric default 0.7,
  action text default 'human_needed',
  response_text text,
  template_key text,
  template_sequence jsonb default '[]'::jsonb,
  next_step text,
  notify_admin boolean default false,
  stop_after_action boolean default false,
  is_enabled boolean default true,
  created_by text,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table bot_accounts add column if not exists label text;
alter table bot_accounts add column if not exists owner_user_id text;
alter table bot_accounts add column if not exists owner_username text;
alter table bot_accounts add column if not exists owner_first_name text;
alter table bot_accounts add column if not exists business_owner_id text;
alter table bot_accounts add column if not exists admin_chat_id text;
alter table bot_accounts add column if not exists business_connection_id text;
alter table bot_accounts add column if not exists project_name text;
alter table bot_accounts add column if not exists bot_enabled boolean default true;
alter table bot_accounts add column if not exists auto_reply_enabled boolean default false;
alter table bot_accounts add column if not exists archive_enabled boolean default true;
alter table bot_accounts add column if not exists track_deleted_enabled boolean default true;
alter table bot_accounts add column if not exists track_edited_enabled boolean default true;
alter table bot_accounts add column if not exists archive_notify_enabled boolean default true;
alter table bot_accounts add column if not exists reports_enabled boolean default true;
alter table bot_accounts add column if not exists custom_commands_enabled boolean default true;
alter table bot_accounts add column if not exists ai_rules_enabled boolean default true;
alter table bot_accounts add column if not exists media_archive_enabled boolean default true;
alter table bot_accounts add column if not exists media_archive_download boolean default false;
alter table bot_accounts add column if not exists media_archive_max_bytes bigint default 20000000;
alter table bot_accounts add column if not exists storage_bucket text default 'business-media-archive';
alter table bot_accounts add column if not exists daily_auto jsonb default '{}'::jsonb;
alter table bot_accounts add column if not exists daily_report_time text default '18:00';
alter table bot_accounts add column if not exists flow_key text default 'info_only';
alter table bot_accounts add column if not exists timezone text default 'Asia/Tashkent';
alter table bot_accounts add column if not exists last_seen_at timestamptz;
alter table bot_accounts add column if not exists created_at timestamptz default now();
alter table bot_accounts add column if not exists updated_at timestamptz default now();

alter table business_connection_accounts add column if not exists account_key text;
alter table business_connection_accounts add column if not exists user_id text;
alter table business_connection_accounts add column if not exists username text;
alter table business_connection_accounts add column if not exists first_name text;
alter table business_connection_accounts add column if not exists created_at timestamptz default now();
alter table business_connection_accounts add column if not exists updated_at timestamptz default now();

alter table business_accounts add column if not exists label text;
alter table business_accounts add column if not exists project_name text;
alter table business_accounts add column if not exists owner_user_id text;
alter table business_accounts add column if not exists owner_username text;
alter table business_accounts add column if not exists admin_chat_id text;
alter table business_accounts add column if not exists business_connection_id text;
alter table business_accounts add column if not exists bot_enabled boolean default true;
alter table business_accounts add column if not exists auto_reply_enabled boolean default false;
alter table business_accounts add column if not exists archive_enabled boolean default true;
alter table business_accounts add column if not exists track_deleted_enabled boolean default true;
alter table business_accounts add column if not exists track_edited_enabled boolean default true;
alter table business_accounts add column if not exists media_archive_enabled boolean default true;
alter table business_accounts add column if not exists media_archive_download boolean default false;
alter table business_accounts add column if not exists archive_notify_enabled boolean default true;
alter table business_accounts add column if not exists reports_enabled boolean default true;
alter table business_accounts add column if not exists ai_intent_enabled boolean default false;
alter table business_accounts add column if not exists custom_commands_enabled boolean default true;
alter table business_accounts add column if not exists ai_rules_enabled boolean default true;
alter table business_accounts add column if not exists timezone text default 'Asia/Tashkent';
alter table business_accounts add column if not exists last_seen_at timestamptz;
alter table business_accounts add column if not exists created_at timestamptz default now();
alter table business_accounts add column if not exists updated_at timestamptz default now();

alter table account_admins add column if not exists account_key text;
alter table account_admins add column if not exists telegram_user_id text;
alter table account_admins add column if not exists username text;
alter table account_admins add column if not exists role text default 'owner';
alter table account_admins add column if not exists is_active boolean default true;
alter table account_admins add column if not exists created_at timestamptz default now();
alter table account_admins add column if not exists updated_at timestamptz default now();

alter table platform_admins add column if not exists username text;
alter table platform_admins add column if not exists role text default 'owner';
alter table platform_admins add column if not exists is_active boolean default true;
alter table platform_admins add column if not exists created_at timestamptz default now();
alter table platform_admins add column if not exists updated_at timestamptz default now();

alter table platform_audit_logs add column if not exists admin_user_id text;
alter table platform_audit_logs add column if not exists admin_username text;
alter table platform_audit_logs add column if not exists action text;
alter table platform_audit_logs add column if not exists target_account_key text;
alter table platform_audit_logs add column if not exists before_json jsonb default '{}'::jsonb;
alter table platform_audit_logs add column if not exists after_json jsonb default '{}'::jsonb;
alter table platform_audit_logs add column if not exists created_at timestamptz default now();

alter table account_custom_commands add column if not exists account_key text;
alter table account_custom_commands add column if not exists command_key text;
alter table account_custom_commands add column if not exists title text;
alter table account_custom_commands add column if not exists description text;
alter table account_custom_commands add column if not exists trigger_type text default 'slash_command';
alter table account_custom_commands add column if not exists trigger_patterns jsonb default '[]'::jsonb;
alter table account_custom_commands add column if not exists response_type text default 'text';
alter table account_custom_commands add column if not exists response_text text;
alter table account_custom_commands add column if not exists template_key text;
alter table account_custom_commands add column if not exists template_sequence jsonb default '[]'::jsonb;
alter table account_custom_commands add column if not exists flow_key text;
alter table account_custom_commands add column if not exists step_key text;
alter table account_custom_commands add column if not exists ai_rule_key text;
alter table account_custom_commands add column if not exists is_enabled boolean default true;
alter table account_custom_commands add column if not exists notify_admin boolean default false;
alter table account_custom_commands add column if not exists stop_after_response boolean default false;
alter table account_custom_commands add column if not exists sort_order integer default 100;
alter table account_custom_commands add column if not exists created_by text;
alter table account_custom_commands add column if not exists updated_by text;
alter table account_custom_commands add column if not exists created_at timestamptz default now();
alter table account_custom_commands add column if not exists updated_at timestamptz default now();

alter table custom_command_executions add column if not exists account_key text;
alter table custom_command_executions add column if not exists command_key text;
alter table custom_command_executions add column if not exists chat_id text;
alter table custom_command_executions add column if not exists business_connection_id text;
alter table custom_command_executions add column if not exists matched boolean default true;
alter table custom_command_executions add column if not exists user_text text;
alter table custom_command_executions add column if not exists response_type text;
alter table custom_command_executions add column if not exists created_at timestamptz default now();

alter table account_setup_sessions add column if not exists telegram_user_id text;
alter table account_setup_sessions add column if not exists account_key text;
alter table account_setup_sessions add column if not exists mode text;
alter table account_setup_sessions add column if not exists step text;
alter table account_setup_sessions add column if not exists payload jsonb default '{}'::jsonb;
alter table account_setup_sessions add column if not exists updated_at timestamptz default now();

alter table account_ai_rules add column if not exists account_key text;
alter table account_ai_rules add column if not exists rule_key text;
alter table account_ai_rules add column if not exists display_name text;
alter table account_ai_rules add column if not exists flow_key text;
alter table account_ai_rules add column if not exists step_key text;
alter table account_ai_rules add column if not exists example_phrases jsonb default '[]'::jsonb;
alter table account_ai_rules add column if not exists target_intent text;
alter table account_ai_rules add column if not exists confidence_threshold numeric default 0.7;
alter table account_ai_rules add column if not exists action text default 'human_needed';
alter table account_ai_rules add column if not exists response_text text;
alter table account_ai_rules add column if not exists template_key text;
alter table account_ai_rules add column if not exists template_sequence jsonb default '[]'::jsonb;
alter table account_ai_rules add column if not exists next_step text;
alter table account_ai_rules add column if not exists notify_admin boolean default false;
alter table account_ai_rules add column if not exists stop_after_action boolean default false;
alter table account_ai_rules add column if not exists is_enabled boolean default true;
alter table account_ai_rules add column if not exists created_by text;
alter table account_ai_rules add column if not exists updated_by text;
alter table account_ai_rules add column if not exists created_at timestamptz default now();
alter table account_ai_rules add column if not exists updated_at timestamptz default now();

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
  account_key text,
  template_key text,
  step text,
  payload jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table admin_sessions add column if not exists account_key text;
alter table admin_sessions add column if not exists template_key text;
alter table admin_sessions add column if not exists step text;
alter table admin_sessions add column if not exists mode text;
alter table admin_sessions add column if not exists payload jsonb default '{}'::jsonb;
alter table admin_sessions add column if not exists updated_at timestamptz default now();

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
  storage_url text,
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

create table if not exists ai_decisions (
  id bigserial primary key,
  account_key text,
  chat_id text not null,
  stage text,
  step_key text,
  user_text text,
  intent text,
  confidence numeric,
  next_step text,
  template_key text,
  should_stop boolean default false,
  reason text,
  raw_json jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists account_reply_rules (
  id bigserial primary key,
  account_key text,
  flow_key text,
  step_key text,
  intent text,
  template_key text,
  next_step text,
  should_stop boolean default false,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table account_flow_steps add column if not exists account_key text;
alter table account_flow_steps add column if not exists flow_key text;
alter table account_flow_steps add column if not exists step_key text;
alter table account_flow_steps add column if not exists display_name text;
alter table account_flow_steps add column if not exists template_key text;
alter table account_flow_steps add column if not exists wait_for_reply boolean default true;
alter table account_flow_steps add column if not exists next_step_yes text;
alter table account_flow_steps add column if not exists next_step_no text;
alter table account_flow_steps add column if not exists next_step_partial text;
alter table account_flow_steps add column if not exists next_step_unknown text;
alter table account_flow_steps add column if not exists next_step_on_confirm text;
alter table account_flow_steps add column if not exists next_step_on_reject text;
alter table account_flow_steps add column if not exists next_step_on_needs_info text;
alter table account_flow_steps add column if not exists next_step_on_unclear text;
alter table account_flow_steps add column if not exists human_needed_on_unclear boolean default true;
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
alter table message_archive add column if not exists storage_url text;
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

alter table ai_decisions add column if not exists account_key text;
alter table ai_decisions add column if not exists chat_id text;
alter table ai_decisions add column if not exists stage text;
alter table ai_decisions add column if not exists step_key text;
alter table ai_decisions add column if not exists user_text text;
alter table ai_decisions add column if not exists intent text;
alter table ai_decisions add column if not exists confidence numeric;
alter table ai_decisions add column if not exists next_step text;
alter table ai_decisions add column if not exists template_key text;
alter table ai_decisions add column if not exists should_stop boolean default false;
alter table ai_decisions add column if not exists reason text;
alter table ai_decisions add column if not exists raw_json jsonb default '{}'::jsonb;
alter table ai_decisions add column if not exists created_at timestamptz default now();

alter table account_reply_rules add column if not exists account_key text;
alter table account_reply_rules add column if not exists flow_key text;
alter table account_reply_rules add column if not exists step_key text;
alter table account_reply_rules add column if not exists rule_name text;
alter table account_reply_rules add column if not exists example_phrases text;
alter table account_reply_rules add column if not exists target_intent text;
alter table account_reply_rules add column if not exists confidence_threshold numeric default 0.7;
alter table account_reply_rules add column if not exists action text;
alter table account_reply_rules add column if not exists intent text;
alter table account_reply_rules add column if not exists template_key text;
alter table account_reply_rules add column if not exists next_step text;
alter table account_reply_rules add column if not exists notify_admin boolean default false;
alter table account_reply_rules add column if not exists stop_after_action boolean default false;
alter table account_reply_rules add column if not exists should_stop boolean default false;
alter table account_reply_rules add column if not exists is_active boolean default true;
alter table account_reply_rules add column if not exists created_at timestamptz default now();
alter table account_reply_rules add column if not exists updated_at timestamptz default now();

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
create index if not exists ai_decisions_account_chat_idx on ai_decisions(account_key, chat_id, created_at desc);
create index if not exists ai_decisions_intent_idx on ai_decisions(account_key, intent);
create index if not exists account_reply_rules_account_idx on account_reply_rules(account_key, flow_key, step_key, intent);
create unique index if not exists account_flow_steps_unique_idx on account_flow_steps(account_key, flow_key, step_key);
create index if not exists account_flow_steps_account_idx on account_flow_steps(account_key, flow_key, sort_order);
create index if not exists business_connection_accounts_account_idx on business_connection_accounts(account_key);
create index if not exists business_connection_accounts_user_idx on business_connection_accounts(user_id);
create unique index if not exists account_admins_unique_idx on account_admins(account_key, telegram_user_id);
create index if not exists account_admins_user_idx on account_admins(telegram_user_id) where is_active = true;
create index if not exists platform_audit_logs_created_idx on platform_audit_logs(created_at desc);
create index if not exists platform_audit_logs_account_idx on platform_audit_logs(target_account_key, created_at desc);
create unique index if not exists account_custom_commands_unique_idx on account_custom_commands(account_key, command_key);
create index if not exists account_custom_commands_enabled_idx on account_custom_commands(account_key, is_enabled, sort_order);
create index if not exists custom_command_executions_account_idx on custom_command_executions(account_key, created_at desc);
create index if not exists custom_command_executions_command_idx on custom_command_executions(account_key, command_key, created_at desc);
create index if not exists admin_sessions_account_idx on admin_sessions(account_key, updated_at desc);
create index if not exists account_setup_sessions_account_idx on account_setup_sessions(account_key, updated_at desc);
create unique index if not exists account_ai_rules_unique_idx on account_ai_rules(account_key, rule_key);
create index if not exists account_ai_rules_enabled_idx on account_ai_rules(account_key, is_enabled, step_key);

insert into bot_accounts (account_key, label, project_name, business_owner_id, admin_chat_id, flow_key, archive_enabled, archive_notify_enabled)
values ('uzlye', 'UZLYE', 'O‘zbekiston Lider Yoshlari Ensiklopediyasi', null, null, 'uzlye_info_only', true, true)
on conflict (account_key) do nothing;

insert into bot_accounts (account_key, label, project_name, business_owner_id, admin_chat_id, flow_key, archive_enabled, archive_notify_enabled)
values ('second', 'Ikkinchi akkaunt', 'Millat Iftixorlari ensiklopediyasi', '8304283149', '8304283149', 'second_info_only', true, true)
on conflict (account_key) do nothing;

insert into account_flow_steps (account_key, flow_key, step_key, template_key, next_step_yes, next_step_no, next_step_partial, next_step_unknown, stop_after_send, sort_order, is_active)
values
('uzlye', 'uzlye_info_only', 'ask_application', 'ask_application', 'ask_info', 'application_link', 'ask_info', null, false, 10, true),
('uzlye', 'uzlye_info_only', 'ask_info', 'ask_info', 'has_info', 'no_info', 'has_info', 'no_info', false, 20, true),
('uzlye', 'uzlye_info_only', 'has_info', 'known_info_preface,short_intro,offer_end', null, null, null, null, true, 30, true),
('uzlye', 'uzlye_info_only', 'no_info', 'unknown_info_preface,full_intro,offer_end', null, null, null, null, true, 40, true),
('uzlye', 'uzlye_info_only', 'application_link', 'application_link_reply', null, null, null, null, true, 50, true)
on conflict (account_key, flow_key, step_key) do nothing;

insert into account_flow_steps (account_key, flow_key, step_key, template_key, next_step_yes, next_step_no, next_step_partial, next_step_unknown, stop_after_send, sort_order, is_active)
values
('second', 'second_info_only', 'ask_application', 'ask_application', 'ask_info', null, 'ask_info', null, false, 10, true),
('second', 'second_info_only', 'ask_info', 'ask_info', 'has_info', 'no_info', 'has_info', null, false, 20, true),
('second', 'second_info_only', 'has_info', 'known_info_preface,full_intro,offer_end', null, null, null, null, true, 30, true),
('second', 'second_info_only', 'no_info', 'full_intro,offer_end', null, null, null, null, true, 40, true)
on conflict (account_key, flow_key, step_key) do nothing;

insert into reply_templates (key, account_key, title, body) values
('second:ask_application', 'second', 'Ariza qoldirganini so‘rash', $$Siz “Millat Iftixorlari ensiklopediyasi”ga kirish uchun ariza qoldirgansiz. Shunaqami?$$),
('second:ask_info', 'second', 'Ma’lumot bor-yo‘qligini so‘rash', $$Siz ensiklopediyamizga kirishning foydali jihatlari haqida batafsil ma’lumotga egamisiz?$$),
('second:known_info_preface', 'second', 'Ma’lumot bor desa kirish', $$Ajoyib, keling unda yana bir bor tanishtirib o‘taman.$$),
('second:full_intro', 'second', 'Millat Iftixorlari batafsil tanishtiruv', $$Ushbu xabarda sizga “Millat Iftixorlari” ensiklopediyasi haqida qo‘shimcha ma’lumotlarni taqdim etamiz. 📚✨

“Millat Iftixorlari” ensiklopediyasi — yoshlarning yutuqlarini hujjatlashtirish, ularni ommaga tanitish va boshqalarga ilhom manbai sifatida targ‘ib qilish uchun yaratilgan noyob loyiha. Bu platformaga istalgan sohada faoliyat yuritayotgan, o‘z ustida izchil ishlayotgan hamda jamiyat rivojiga hissa qo‘shayotgan yoshlar qabul qilinadi.

Ensiklopediyaga kiritilgan nomzodlar quyidagi muhim ustunliklarga ega bo‘ladilar:

🔹 Qidiruv tizimlarida ko‘rinish 🔎
Siz haqingizdagi maqola Google, Yandex, Bing kabi qidiruv tizimlarida chiqadi. Bu esa sizni hamkorlar, ish beruvchilar, ilmiy tashkilotlar yoki jurnalistlar osongina topa olishini ta’minlaydi.

🔹 Sun’iy intellekt platformalarida tanilish 🤖
Bugungi kunda ChatGPT, Copilot, Gemini kabi sun’iy intellekt tizimlari ishonchli manbalarga tayangan holda ishlaydi. Siz haqingizdagi maqola shu manbalardan biri bo‘lib, onlayn obro‘yingizni mustahkamlaydi.

🔹 Kelajakdagi Wikipedia sahifangiz uchun asos 🌍
Bugun e’lon qilinadigan maqola ertaga siz haqingizda yaratiladigan Wikipedia sahifasi uchun tayyor va ishonchli manba bo‘lishi mumkin.

🔹 Ijtimoiy tarmoqlarda tasdiq belgisi olish imkoniyati ✔️
Instagram, Facebook, TikTok, YouTube kabi platformalarda “ko‘k nishon” olish uchun siz haqingizda onlayn maqolalar zarur. Ushbu maqola bu yo‘lda muhim hujjat bo‘lib xizmat qiladi.

🔹 Rezyume va grantlar uchun rasmiy havola 📄
Ish qidirishda, grant yoki xalqaro tanlovlarda qatnashishda siz haqingizdagi maqola shaxsiy brendingizni ko‘rsatuvchi kuchli manba bo‘ladi.

🔹 Loyihaning ijtimoiy tarmoqlari va kanallarida yoritilish 📣
Sizning maqolangiz nafaqat saytimizda, balki loyihaning ijtimoiy tarmoqlari va maxsus kanallarida ham keng targ‘ib qilinadi.

🔹 OAV e’tiboriga tushish imkoniyati 🎙️
Jurnalistlar, blogerlar, televideniye va radio vakillari uchun siz haqingizdagi maqola ishonchli manba bo‘lib xizmat qiladi. Natijada sizga intervyu yoki chiqishlar bo‘yicha murojaatlar ko‘payishi mumkin.

🔹 Iqtiboslar ruknida faollik 💬
Jamiyat uchun foydali va mazmunli fikrlaringizni “Iqtiboslar” rukni orqali keng ommaga taqdim etishingiz mumkin.

🔹 Shaxsiy brendingiz uchun mustahkam poydevor 🌟
Bugungi kunda har bir ekspert yoki jamoat faoli uchun shaxsiy brend muhim. Ushbu maqola sizning obro‘yingiz va ishonchliligingizni yanada mustahkamlaydi.

🔹 Kelajak loyihalarda ajralib turish imkoniyati 🚀
Forumlar, konferensiyalar, grant dasturlari va xalqaro tanlovlarda qatnashishda siz haqingizdagi onlayn maqola sizni boshqalardan ajratib ko‘rsatadi.

✨ “Millat Iftixorlari” ensiklopediyasiga kiritilish — bu sizning shaxsiy brendingiz, obro‘yingiz va kelajakdagi muvaffaqiyatlaringiz uchun mustahkam poydevordir.$$),
('second:offer_end', 'second', 'Oferta yakuni', $$Ensiklopediyamizning ommaviy ofertasi bilan quyidagi link orqali batafsil tanishishingiz mumkin:
https://t.me/mie_rasmiy/3

👨‍🎓 Vebsayt | 📱 Instagram | 📱 Telegram

Oferta va xabar bilan tanishib chiqing va ayting.$$)
on conflict (key) do nothing;

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
