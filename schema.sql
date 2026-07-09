create table if not exists leads (
  chat_id text primary key,
  business_connection_id text,
  username text,
  first_name text,
  last_name text,
  stage text default 'new',
  paused boolean default false,
  final_stopped boolean default false,
  last_template text,
  last_message text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table leads add column if not exists business_connection_id text;
alter table leads add column if not exists username text;
alter table leads add column if not exists first_name text;
alter table leads add column if not exists last_name text;
alter table leads add column if not exists stage text default 'new';
alter table leads add column if not exists paused boolean default false;
alter table leads add column if not exists final_stopped boolean default false;
alter table leads add column if not exists last_template text;
alter table leads add column if not exists last_message text;
alter table leads add column if not exists updated_at timestamptz default now();
alter table leads add column if not exists created_at timestamptz default now();

create table if not exists reply_templates (
  key text primary key,
  body text not null,
  updated_at timestamptz default now()
);

create table if not exists custom_rules (
  id bigserial primary key,
  phrase text not null,
  template_key text not null,
  new_stage text,
  stop_after boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists leads_updated_at_idx on leads(updated_at desc);
create index if not exists custom_rules_active_idx on custom_rules(is_active);
