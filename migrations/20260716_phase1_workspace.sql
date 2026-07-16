begin;

create table if not exists platform_users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text not null unique,
  username text,
  first_name text,
  last_name text,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null unique,
  name text not null,
  owner_user_id uuid references platform_users(id),
  status text default 'active',
  is_platform_internal boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  user_id uuid not null references platform_users(id),
  role text not null default 'owner',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(workspace_id, user_id)
);

create table if not exists workspace_business_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  existing_account_key text not null unique,
  business_connection_id text,
  display_name text,
  bot_enabled boolean default true,
  reach_enabled boolean default true,
  followup_enabled boolean default true,
  archive_enabled boolean default true,
  status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references workspaces(id),
  plan_code text default 'trial',
  status text default 'pending',
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  subscription_started_at timestamptz,
  subscription_ends_at timestamptz,
  is_platform_internal boolean default false,
  activated_by text,
  trial_24h_notified_at timestamptz,
  trial_6h_notified_at timestamptz,
  trial_expired_notified_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists subscription_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  subscription_id uuid references subscriptions(id),
  payment_amount numeric,
  payment_currency text default 'UZS',
  payment_note text,
  payment_reference text,
  activated_by text,
  created_at timestamptz default now()
);

alter table platform_audit_logs add column if not exists workspace_id uuid;
alter table platform_audit_logs add column if not exists account_id uuid;
alter table platform_audit_logs add column if not exists actor_user_id uuid;
alter table platform_audit_logs add column if not exists actor_role text;
alter table platform_audit_logs add column if not exists entity_type text;
alter table platform_audit_logs add column if not exists entity_id text;

alter table bot_accounts add column if not exists workspace_id uuid;
alter table bot_accounts add column if not exists workspace_business_account_id uuid;
alter table business_accounts add column if not exists workspace_id uuid;
alter table business_accounts add column if not exists workspace_business_account_id uuid;
alter table business_connection_accounts add column if not exists workspace_id uuid;
alter table business_connection_accounts add column if not exists workspace_business_account_id uuid;
alter table account_admins add column if not exists workspace_id uuid;
alter table reply_templates add column if not exists workspace_id uuid;
alter table reply_templates add column if not exists workspace_business_account_id uuid;
alter table business_leads add column if not exists workspace_id uuid;
alter table business_leads add column if not exists workspace_business_account_id uuid;
alter table account_flow_steps add column if not exists workspace_id uuid;
alter table account_flow_steps add column if not exists workspace_business_account_id uuid;
alter table account_custom_commands add column if not exists workspace_id uuid;
alter table account_custom_commands add column if not exists workspace_business_account_id uuid;
alter table account_ai_rules add column if not exists workspace_id uuid;
alter table account_ai_rules add column if not exists workspace_business_account_id uuid;
alter table message_archive add column if not exists workspace_id uuid;
alter table message_archive add column if not exists workspace_business_account_id uuid;
alter table message_edit_history add column if not exists workspace_id uuid;
alter table message_edit_history add column if not exists workspace_business_account_id uuid;

create or replace function bootstrap_legacy_workspace(p_account_key text)
returns uuid
language plpgsql
as $$
declare
  legacy_account jsonb;
  legacy_account_key text;
  owner_telegram_id text;
  owner_username text;
  owner_first_name text;
  legacy_business_connection_id text;
  legacy_workspace_name text;
  legacy_display_name text;
  legacy_bot_enabled boolean;
  legacy_reach_enabled boolean;
  legacy_followup_enabled boolean;
  legacy_archive_enabled boolean;
  platform_user_uuid uuid;
  workspace_uuid uuid;
  workspace_account_uuid uuid;
begin
  select to_jsonb(account_row)
  into legacy_account
  from bot_accounts account_row
  where account_row.account_key = p_account_key
  limit 1;

  if not found then return null; end if;

  legacy_account_key := coalesce(
    nullif(btrim(legacy_account ->> 'account_key'), ''),
    p_account_key
  );

  owner_telegram_id := coalesce(
    nullif(btrim(legacy_account ->> 'owner_user_id'), ''),
    nullif(btrim(legacy_account ->> 'business_owner_id'), ''),
    nullif(btrim(legacy_account ->> 'admin_chat_id'), ''),
    nullif(btrim(legacy_account ->> 'telegram_user_id'), '')
  );

  owner_username := nullif(btrim(legacy_account ->> 'owner_username'), '');
  owner_first_name := nullif(btrim(legacy_account ->> 'owner_first_name'), '');
  legacy_business_connection_id := coalesce(
    nullif(btrim(legacy_account ->> 'business_connection_id'), ''),
    nullif(btrim(legacy_account ->> 'connection_id'), '')
  );
  legacy_workspace_name := coalesce(
    nullif(btrim(legacy_account ->> 'project_name'), ''),
    nullif(btrim(legacy_account ->> 'label'), ''),
    legacy_account_key
  );
  legacy_display_name := coalesce(
    nullif(btrim(legacy_account ->> 'label'), ''),
    nullif(btrim(legacy_account ->> 'project_name'), ''),
    legacy_account_key
  );

  legacy_bot_enabled := case
    when lower(coalesce(legacy_account ->> 'bot_enabled', 'true')) in ('false', 'f', '0', 'no', 'off') then false
    else true
  end;
  legacy_reach_enabled := case
    when lower(coalesce(legacy_account ->> 'reach_enabled', 'true')) in ('false', 'f', '0', 'no', 'off') then false
    else true
  end;
  legacy_followup_enabled := case
    when lower(coalesce(legacy_account ->> 'followup_enabled', 'true')) in ('false', 'f', '0', 'no', 'off') then false
    else true
  end;
  legacy_archive_enabled := case
    when lower(coalesce(legacy_account ->> 'archive_enabled', 'true')) in ('false', 'f', '0', 'no', 'off') then false
    else true
  end;

  if owner_telegram_id is not null then
    insert into platform_users (telegram_user_id, username, first_name, status)
    values (owner_telegram_id, owner_username, owner_first_name, 'active')
    on conflict (telegram_user_id) do nothing;

    select id into platform_user_uuid
    from platform_users
    where telegram_user_id = owner_telegram_id;
  end if;

  insert into workspaces (workspace_key, name, owner_user_id, status, is_platform_internal)
  values (
    'legacy:' || legacy_account_key,
    legacy_workspace_name,
    platform_user_uuid,
    'active',
    true
  )
  on conflict (workspace_key) do nothing;

  select id into workspace_uuid
  from workspaces
  where workspace_key = 'legacy:' || legacy_account_key;

  if platform_user_uuid is not null then
    insert into workspace_members (workspace_id, user_id, role, is_active)
    values (workspace_uuid, platform_user_uuid, 'owner', true)
    on conflict (workspace_id, user_id) do nothing;
  end if;

  insert into workspace_business_accounts (
    workspace_id, existing_account_key, business_connection_id, display_name,
    bot_enabled, reach_enabled, followup_enabled, archive_enabled, status
  ) values (
    workspace_uuid,
    legacy_account_key,
    legacy_business_connection_id,
    legacy_display_name,
    legacy_bot_enabled,
    legacy_reach_enabled,
    legacy_followup_enabled,
    legacy_archive_enabled,
    case when legacy_business_connection_id is null then 'pending' else 'connected' end
  )
  on conflict (existing_account_key) do update
  set business_connection_id = coalesce(workspace_business_accounts.business_connection_id, excluded.business_connection_id),
      updated_at = now();

  select id into workspace_account_uuid
  from workspace_business_accounts
  where existing_account_key = legacy_account_key;

  insert into subscriptions (
    workspace_id, plan_code, status, subscription_started_at,
    subscription_ends_at, is_platform_internal, activated_by
  ) values (workspace_uuid, 'pro', 'pro', now(), null, true, 'legacy_bootstrap')
  on conflict (workspace_id) do nothing;

  update bot_accounts
  set workspace_id = coalesce(workspace_id, workspace_uuid),
      workspace_business_account_id = coalesce(workspace_business_account_id, workspace_account_uuid)
  where account_key = legacy_account_key;

  update business_accounts
  set workspace_id = coalesce(workspace_id, workspace_uuid),
      workspace_business_account_id = coalesce(workspace_business_account_id, workspace_account_uuid)
  where account_key = legacy_account_key;

  update business_connection_accounts
  set workspace_id = coalesce(workspace_id, workspace_uuid),
      workspace_business_account_id = coalesce(workspace_business_account_id, workspace_account_uuid)
  where account_key = legacy_account_key;

  return workspace_uuid;
end;
$$;

do $$
begin
  perform bootstrap_legacy_workspace('uzlye');
  perform bootstrap_legacy_workspace('second');
  perform bootstrap_legacy_workspace('liderlar');
end;
$$;

update account_admins a set workspace_id = wba.workspace_id
from workspace_business_accounts wba
where a.workspace_id is null and a.account_key = wba.existing_account_key;

update reply_templates t set workspace_id = wba.workspace_id, workspace_business_account_id = wba.id
from workspace_business_accounts wba
where t.workspace_id is null and t.account_key = wba.existing_account_key;

update business_leads l set workspace_id = wba.workspace_id, workspace_business_account_id = wba.id
from workspace_business_accounts wba
where l.workspace_id is null and l.account_key = wba.existing_account_key;

update account_flow_steps f set workspace_id = wba.workspace_id, workspace_business_account_id = wba.id
from workspace_business_accounts wba
where f.workspace_id is null and f.account_key = wba.existing_account_key;

update account_custom_commands c set workspace_id = wba.workspace_id, workspace_business_account_id = wba.id
from workspace_business_accounts wba
where c.workspace_id is null and c.account_key = wba.existing_account_key;

update account_ai_rules r set workspace_id = wba.workspace_id, workspace_business_account_id = wba.id
from workspace_business_accounts wba
where r.workspace_id is null and r.account_key = wba.existing_account_key;

update message_archive m set workspace_id = wba.workspace_id, workspace_business_account_id = wba.id
from workspace_business_accounts wba
where m.workspace_id is null and m.account_key = wba.existing_account_key;

update message_edit_history h set workspace_id = wba.workspace_id, workspace_business_account_id = wba.id
from workspace_business_accounts wba
where h.workspace_id is null and h.account_key = wba.existing_account_key;

create index if not exists platform_users_telegram_idx on platform_users(telegram_user_id);
create index if not exists workspaces_owner_idx on workspaces(owner_user_id, status);
create index if not exists workspace_members_user_idx on workspace_members(user_id, is_active);
create index if not exists workspace_business_accounts_workspace_idx on workspace_business_accounts(workspace_id, status);
create unique index if not exists workspace_business_accounts_connection_unique_idx
  on workspace_business_accounts(business_connection_id) where business_connection_id is not null;
create index if not exists subscriptions_status_idx on subscriptions(status, trial_ends_at, subscription_ends_at);
create index if not exists subscription_payments_workspace_idx on subscription_payments(workspace_id, created_at desc);
create index if not exists platform_audit_logs_workspace_idx on platform_audit_logs(workspace_id, created_at desc);
create index if not exists business_leads_workspace_idx on business_leads(workspace_id, workspace_business_account_id, chat_id);
create index if not exists reply_templates_workspace_idx on reply_templates(workspace_id, workspace_business_account_id, key);
create index if not exists message_archive_workspace_idx
  on message_archive(workspace_id, workspace_business_account_id, business_connection_id, chat_id);

commit;
