create table if not exists public.leads (
  chat_id text primary key,
  business_connection_id text,
  telegram_user_id text,
  username text,
  full_name text,
  lead_status text default 'new',
  last_intent text,
  bot_paused_until timestamptz,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists leads_status_idx on public.leads (lead_status);
create index if not exists leads_updated_at_idx on public.leads (updated_at desc);

create table if not exists public.reply_templates (
  key text primary key,
  text text not null,
  updated_at timestamptz default now()
);

create index if not exists reply_templates_updated_at_idx on public.reply_templates (updated_at desc);
