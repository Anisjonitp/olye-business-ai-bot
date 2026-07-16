begin;

alter table subscriptions add column if not exists status_reason text;
alter table subscriptions add column if not exists last_status_changed_at timestamptz;
alter table subscriptions add column if not exists suspended_at timestamptz;
alter table subscriptions add column if not exists blocked_at timestamptz;
alter table subscriptions add column if not exists cancelled_at timestamptz;
alter table subscriptions add column if not exists last_expired_at timestamptz;

alter table subscription_payments add column if not exists duration_days integer;
alter table subscription_payments add column if not exists period_started_at timestamptz;
alter table subscription_payments add column if not exists period_ends_at timestamptz;
alter table subscription_payments add column if not exists admin_telegram_user_id text;
alter table subscription_payments add column if not exists metadata jsonb default '{}'::jsonb;

alter table workspace_business_accounts add column if not exists trial_used_at timestamptz;
alter table workspace_business_accounts add column if not exists last_subscription_block_reason text;
alter table workspace_business_accounts add column if not exists last_subscription_blocked_at timestamptz;

create table if not exists subscription_trial_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  workspace_business_account_id uuid not null references workspace_business_accounts(id),
  telegram_user_id text,
  business_connection_id text not null,
  granted_at timestamptz not null default now(),
  granted_by text,
  revoked_at timestamptz,
  override_reason text,
  created_at timestamptz default now()
);

create table if not exists interaction_sessions (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text not null,
  workspace_id uuid references workspaces(id),
  account_id uuid references workspace_business_accounts(id),
  bot_role text not null,
  mode text not null,
  step text not null,
  payload jsonb default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(telegram_user_id, bot_role)
);

create index if not exists subscriptions_workspace_status_idx
  on subscriptions(workspace_id, status, updated_at desc);
create index if not exists subscriptions_trial_due_idx
  on subscriptions(trial_ends_at)
  where status = 'trial' and is_platform_internal = false;
create index if not exists subscriptions_pro_due_idx
  on subscriptions(subscription_ends_at)
  where status = 'pro' and is_platform_internal = false;
create index if not exists subscription_trial_grants_workspace_idx
  on subscription_trial_grants(workspace_id, granted_at desc);
create index if not exists subscription_trial_grants_owner_idx
  on subscription_trial_grants(telegram_user_id, granted_at desc);
create unique index if not exists subscription_trial_grants_connection_unique_idx
  on subscription_trial_grants(business_connection_id)
  where revoked_at is null;
create unique index if not exists subscription_trial_grants_workspace_unique_idx
  on subscription_trial_grants(workspace_id)
  where revoked_at is null;
create index if not exists interaction_sessions_expiry_idx
  on interaction_sessions(expires_at);
create index if not exists interaction_sessions_workspace_idx
  on interaction_sessions(workspace_id, account_id, updated_at desc);

create or replace function start_workspace_trial(
  p_workspace_id uuid,
  p_account_id uuid,
  p_owner_telegram_id text,
  p_trial_days integer default 3,
  p_activated_by text default 'business_connection',
  p_force boolean default false
)
returns subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  account_row workspace_business_accounts%rowtype;
  current_subscription subscriptions%rowtype;
  active_grant subscription_trial_grants%rowtype;
  trial_started timestamptz := now();
begin
  p_force := coalesce(p_force, false);

  if p_trial_days is null or p_trial_days < 1 or p_trial_days > 30 then
    raise exception 'invalid_trial_days';
  end if;

  select * into account_row
  from workspace_business_accounts
  where id = p_account_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'workspace_business_account_not_found';
  end if;

  if account_row.status <> 'connected' or nullif(account_row.business_connection_id, '') is null then
    raise exception 'business_connection_not_connected';
  end if;

  select * into current_subscription
  from subscriptions
  where workspace_id = p_workspace_id
  for update;

  if not found then
    insert into subscriptions (workspace_id, plan_code, status)
    values (p_workspace_id, 'trial', 'pending')
    returning * into current_subscription;
  end if;

  if current_subscription.is_platform_internal then
    return current_subscription;
  end if;

  select * into active_grant
  from subscription_trial_grants
  where business_connection_id = account_row.business_connection_id
    and revoked_at is null
  limit 1;

  if found and not p_force then
    if active_grant.workspace_id = p_workspace_id
       and current_subscription.status = 'trial'
       and current_subscription.trial_ends_at > now() then
      return current_subscription;
    end if;
    raise exception 'business_connection_trial_already_used';
  end if;

  if not p_force and nullif(p_owner_telegram_id, '') is not null and exists (
    select 1
    from subscription_trial_grants
    where telegram_user_id = p_owner_telegram_id
      and workspace_id <> p_workspace_id
      and revoked_at is null
  ) then
    raise exception 'owner_trial_already_used';
  end if;

  if not p_force and (
    current_subscription.trial_started_at is not null
    or current_subscription.status in ('trial', 'pro', 'expired', 'cancelled')
  ) then
    raise exception 'workspace_trial_already_used';
  end if;

  if p_force then
    update subscription_trial_grants
    set revoked_at = now(),
        override_reason = coalesce(override_reason, 'platform_admin_override')
    where business_connection_id = account_row.business_connection_id
      and workspace_id <> p_workspace_id
      and revoked_at is null;
  end if;

  insert into subscription_trial_grants (
    workspace_id,
    workspace_business_account_id,
    telegram_user_id,
    business_connection_id,
    granted_at,
    granted_by,
    override_reason
  ) values (
    p_workspace_id,
    p_account_id,
    nullif(p_owner_telegram_id, ''),
    account_row.business_connection_id,
    trial_started,
    p_activated_by,
    case when p_force then 'platform_admin_override' else null end
  )
  on conflict do nothing;

  update workspace_business_accounts
  set trial_used_at = coalesce(trial_used_at, trial_started),
      last_subscription_block_reason = null,
      last_subscription_blocked_at = null,
      updated_at = now()
  where id = p_account_id;

  update subscriptions
  set plan_code = 'trial',
      status = 'trial',
      trial_started_at = trial_started,
      trial_ends_at = trial_started + make_interval(days => p_trial_days),
      subscription_started_at = null,
      subscription_ends_at = null,
      activated_by = p_activated_by,
      status_reason = 'trial_started',
      last_status_changed_at = trial_started,
      last_expired_at = null,
      trial_24h_notified_at = null,
      trial_6h_notified_at = null,
      trial_expired_notified_at = null,
      updated_at = trial_started
  where workspace_id = p_workspace_id
  returning * into current_subscription;

  return current_subscription;
end;
$$;

create or replace function extend_workspace_trial(
  p_workspace_id uuid,
  p_days integer,
  p_activated_by text
)
returns subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_subscription subscriptions%rowtype;
  extension_base timestamptz;
begin
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'invalid_trial_extension_days';
  end if;

  select * into current_subscription
  from subscriptions
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'subscription_not_found';
  end if;

  if current_subscription.is_platform_internal then
    raise exception 'internal_subscription_does_not_need_trial';
  end if;

  if current_subscription.status = 'pro'
     and (current_subscription.subscription_ends_at is null or current_subscription.subscription_ends_at > now()) then
    raise exception 'active_pro_subscription';
  end if;

  extension_base := greatest(now(), coalesce(current_subscription.trial_ends_at, now()));

  update subscriptions
  set plan_code = 'trial',
      status = 'trial',
      trial_started_at = coalesce(trial_started_at, now()),
      trial_ends_at = extension_base + make_interval(days => p_days),
      activated_by = p_activated_by,
      status_reason = 'trial_extended_by_admin',
      last_status_changed_at = now(),
      last_expired_at = null,
      trial_24h_notified_at = null,
      trial_6h_notified_at = null,
      trial_expired_notified_at = null,
      updated_at = now()
  where workspace_id = p_workspace_id
  returning * into current_subscription;

  return current_subscription;
end;
$$;

create or replace function activate_workspace_pro(
  p_workspace_id uuid,
  p_duration_days integer,
  p_admin_telegram_user_id text,
  p_payment_amount numeric default 0,
  p_payment_currency text default 'UZS',
  p_payment_note text default null,
  p_payment_reference text default null,
  p_internal_access boolean default false
)
returns subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_subscription subscriptions%rowtype;
  period_start timestamptz;
  period_end timestamptz;
begin
  p_internal_access := coalesce(p_internal_access, false);

  if not p_internal_access and (p_duration_days is null or p_duration_days not in (30, 90, 180, 365)) then
    raise exception 'invalid_pro_duration_days';
  end if;

  if coalesce(p_payment_amount, 0) < 0 then
    raise exception 'invalid_payment_amount';
  end if;

  select * into current_subscription
  from subscriptions
  where workspace_id = p_workspace_id
  for update;

  if not found then
    insert into subscriptions (workspace_id, plan_code, status)
    values (p_workspace_id, 'pro', 'pending')
    returning * into current_subscription;
  end if;

  if p_internal_access then
    period_start := now();
    period_end := null;
  elsif current_subscription.status = 'pro'
        and current_subscription.subscription_ends_at is not null
        and current_subscription.subscription_ends_at > now() then
    period_start := current_subscription.subscription_ends_at;
    period_end := current_subscription.subscription_ends_at + make_interval(days => p_duration_days);
  else
    period_start := now();
    period_end := now() + make_interval(days => p_duration_days);
  end if;

  update subscriptions
  set plan_code = 'pro',
      status = 'pro',
      subscription_started_at = case
        when current_subscription.status = 'pro'
          and current_subscription.subscription_ends_at is not null
          and current_subscription.subscription_ends_at > now()
        then coalesce(current_subscription.subscription_started_at, now())
        else now()
      end,
      subscription_ends_at = period_end,
      is_platform_internal = p_internal_access,
      activated_by = p_admin_telegram_user_id,
      status_reason = case when p_internal_access then 'internal_access_activated' else 'pro_activated' end,
      last_status_changed_at = now(),
      suspended_at = null,
      blocked_at = null,
      cancelled_at = null,
      last_expired_at = null,
      updated_at = now()
  where workspace_id = p_workspace_id
  returning * into current_subscription;

  insert into subscription_payments (
    workspace_id,
    subscription_id,
    payment_amount,
    payment_currency,
    payment_note,
    payment_reference,
    activated_by,
    duration_days,
    period_started_at,
    period_ends_at,
    admin_telegram_user_id,
    metadata
  ) values (
    p_workspace_id,
    current_subscription.id,
    coalesce(p_payment_amount, 0),
    coalesce(nullif(p_payment_currency, ''), 'UZS'),
    nullif(p_payment_note, ''),
    nullif(p_payment_reference, ''),
    p_admin_telegram_user_id,
    case when p_internal_access then null else p_duration_days end,
    period_start,
    period_end,
    p_admin_telegram_user_id,
    jsonb_build_object('internal_access', p_internal_access)
  );

  return current_subscription;
end;
$$;

create or replace function expire_workspace_subscription(
  p_workspace_id uuid,
  p_activated_by text,
  p_reason text default 'admin_expired'
)
returns subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_subscription subscriptions%rowtype;
begin
  update subscriptions
  set status = 'expired',
      status_reason = coalesce(nullif(p_reason, ''), 'admin_expired'),
      activated_by = p_activated_by,
      last_status_changed_at = now(),
      last_expired_at = now(),
      updated_at = now()
  where workspace_id = p_workspace_id
  returning * into current_subscription;

  if not found then
    raise exception 'subscription_not_found';
  end if;

  return current_subscription;
end;
$$;

revoke execute on function start_workspace_trial(uuid, uuid, text, integer, text, boolean) from public, anon, authenticated;
revoke execute on function extend_workspace_trial(uuid, integer, text) from public, anon, authenticated;
revoke execute on function activate_workspace_pro(uuid, integer, text, numeric, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function expire_workspace_subscription(uuid, text, text) from public, anon, authenticated;
grant execute on function start_workspace_trial(uuid, uuid, text, integer, text, boolean) to service_role;
grant execute on function extend_workspace_trial(uuid, integer, text) to service_role;
grant execute on function activate_workspace_pro(uuid, integer, text, numeric, text, text, text, boolean) to service_role;
grant execute on function expire_workspace_subscription(uuid, text, text) to service_role;

update subscriptions s
set plan_code = 'pro',
    status = 'pro',
    subscription_ends_at = null,
    is_platform_internal = true,
    status_reason = coalesce(status_reason, 'legacy_internal_access'),
    last_status_changed_at = coalesce(last_status_changed_at, now()),
    updated_at = now()
from workspaces w
where s.workspace_id = w.id
  and w.is_platform_internal = true
  and coalesce(s.activated_by, 'legacy_bootstrap') = 'legacy_bootstrap'
  and (
    s.plan_code is distinct from 'pro'
    or s.status is distinct from 'pro'
    or s.subscription_ends_at is not null
    or s.is_platform_internal is distinct from true
  );

commit;
