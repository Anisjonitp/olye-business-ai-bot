-- OLYE Business AI CRM Bot v5 schema
-- Supabase → SQL Editor → New query → Run

create extension if not exists pgcrypto;

create table if not exists public.leads (
  chat_id text primary key,
  business_connection_id text,
  username text,
  first_name text,
  last_name text,
  stage text default 'new',
  bot_enabled boolean default true,
  final_stopped boolean default false,
  is_blacklisted boolean default false,
  is_hot boolean default false,
  last_template text,
  last_message text,
  last_customer_message text,
  last_customer_message_at timestamptz,
  last_admin_notified_at timestamptz,
  payment_plan text default 'none',
  payment_status text default 'unpaid',
  total_amount integer default 100000,
  paid_amount integer default 0,
  discount_percent integer default 0,
  discount_sent_at timestamptz,
  terms_accepted_at timestamptz,
  installment_started_at timestamptz,
  initial_payment_paid_at timestamptz,
  article_status text default 'not_started',
  meta jsonb default '{}'::jsonb,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.leads add column if not exists business_connection_id text;
alter table public.leads add column if not exists username text;
alter table public.leads add column if not exists first_name text;
alter table public.leads add column if not exists last_name text;
alter table public.leads add column if not exists stage text default 'new';
alter table public.leads add column if not exists bot_enabled boolean default true;
alter table public.leads add column if not exists final_stopped boolean default false;
alter table public.leads add column if not exists is_blacklisted boolean default false;
alter table public.leads add column if not exists is_hot boolean default false;
alter table public.leads add column if not exists last_template text;
alter table public.leads add column if not exists last_message text;
alter table public.leads add column if not exists last_customer_message text;
alter table public.leads add column if not exists last_customer_message_at timestamptz;
alter table public.leads add column if not exists last_admin_notified_at timestamptz;
alter table public.leads add column if not exists payment_plan text default 'none';
alter table public.leads add column if not exists payment_status text default 'unpaid';
alter table public.leads add column if not exists total_amount integer default 100000;
alter table public.leads add column if not exists paid_amount integer default 0;
alter table public.leads add column if not exists discount_percent integer default 0;
alter table public.leads add column if not exists discount_sent_at timestamptz;
alter table public.leads add column if not exists terms_accepted_at timestamptz;
alter table public.leads add column if not exists installment_started_at timestamptz;
alter table public.leads add column if not exists initial_payment_paid_at timestamptz;
alter table public.leads add column if not exists article_status text default 'not_started';
alter table public.leads add column if not exists meta jsonb default '{}'::jsonb;
alter table public.leads add column if not exists updated_at timestamptz default now();
alter table public.leads add column if not exists created_at timestamptz default now();

create table if not exists public.reply_templates (
  key text primary key,
  title text,
  category text default 'general',
  body text,
  updated_at timestamptz default now()
);

-- Older versions used a column named text. If it exists, copy it to body.
alter table public.reply_templates add column if not exists body text;
alter table public.reply_templates add column if not exists title text;
alter table public.reply_templates add column if not exists category text default 'general';
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reply_templates' and column_name='text'
  ) then
    execute 'update public.reply_templates set body = coalesce(body, "text") where body is null';
  end if;
end $$;
update public.reply_templates set body = '' where body is null;
alter table public.reply_templates alter column body set not null;

create table if not exists public.custom_scenarios (
  id bigserial primary key,
  name text not null,
  trigger_stage text not null,
  trigger_event text default 'user_replied',
  keyword text,
  template_key text,
  message text,
  next_stage text,
  stop_after boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.payments (
  id bigserial primary key,
  chat_id text references public.leads(chat_id) on delete cascade,
  amount integer not null,
  source text default 'manual',
  receipt_id bigint,
  note text,
  confirmed_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.receipts (
  id bigserial primary key,
  chat_id text references public.leads(chat_id) on delete cascade,
  file_id text,
  file_unique_id text,
  status text default 'pending',
  ai_json jsonb default '{}'::jsonb,
  amount integer,
  currency text,
  transaction_id text,
  risk text,
  confidence numeric,
  received_at timestamptz default now(),
  reviewed_at timestamptz
);

create table if not exists public.reminders (
  id bigserial primary key,
  chat_id text references public.leads(chat_id) on delete cascade,
  type text not null,
  due_at timestamptz not null,
  status text default 'pending_admin',
  template_key text,
  meta jsonb default '{}'::jsonb,
  approved_by_admin_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.consents (
  id bigserial primary key,
  chat_id text references public.leads(chat_id) on delete cascade,
  consent_text text not null,
  payment_plan text default 'installment14',
  accepted_at timestamptz default now()
);

create table if not exists public.events (
  id bigserial primary key,
  chat_id text,
  event_type text not null,
  detail jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.admin_sessions (
  admin_chat_id text primary key,
  mode text,
  payload jsonb default '{}'::jsonb,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

create index if not exists leads_updated_at_idx on public.leads(updated_at desc);
create index if not exists leads_stage_idx on public.leads(stage);
create index if not exists leads_payment_idx on public.leads(payment_plan, payment_status);
create index if not exists reminders_due_idx on public.reminders(due_at, status);
create index if not exists receipts_status_idx on public.receipts(status);
create index if not exists events_created_idx on public.events(created_at desc);
create index if not exists custom_scenarios_active_idx on public.custom_scenarios(is_active, trigger_stage);

alter table public.leads disable row level security;
alter table public.reply_templates disable row level security;
alter table public.custom_scenarios disable row level security;
alter table public.payments disable row level security;
alter table public.receipts disable row level security;
alter table public.reminders disable row level security;
alter table public.consents disable row level security;
alter table public.events disable row level security;
alter table public.admin_sessions disable row level security;
alter table public.settings disable row level security;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all tables in schema public to postgres;
grant all on all sequences in schema public to postgres;
