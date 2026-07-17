begin;

alter table workspace_business_accounts add column if not exists connection_owner_telegram_id text;
alter table workspace_business_accounts add column if not exists template_pack_key text;
alter table workspace_business_accounts add column if not exists flow_pack_key text;
alter table workspace_business_accounts add column if not exists defaults_copied_at timestamptz;
alter table workspace_business_accounts add column if not exists onboarding_completed_at timestamptz;

create table if not exists workspace_onboarding (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references workspaces(id),
  owner_telegram_user_id text not null,
  status text not null default 'awaiting_business_connection',
  business_connection_id text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists default_template_packs (
  pack_key text not null,
  template_key text not null,
  title text,
  body text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (pack_key, template_key)
);

create table if not exists default_flow_packs (
  pack_key text not null,
  flow_key text not null,
  step_key text not null,
  display_name text,
  template_key text not null,
  wait_for_reply boolean not null default true,
  next_step_yes text,
  next_step_no text,
  next_step_partial text,
  next_step_unknown text,
  next_step_on_confirm text,
  next_step_on_reject text,
  next_step_on_needs_info text,
  next_step_on_unclear text,
  human_needed_on_unclear boolean not null default true,
  stop_after_send boolean not null default false,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (pack_key, flow_key, step_key)
);

create index if not exists workspace_onboarding_owner_idx
  on workspace_onboarding(owner_telegram_user_id, updated_at desc);
create index if not exists workspace_onboarding_connection_idx
  on workspace_onboarding(business_connection_id)
  where business_connection_id is not null;
create index if not exists workspace_business_accounts_owner_connection_idx
  on workspace_business_accounts(connection_owner_telegram_id, business_connection_id);
create index if not exists default_template_packs_active_idx
  on default_template_packs(pack_key, is_active, sort_order);
create index if not exists default_flow_packs_active_idx
  on default_flow_packs(pack_key, flow_key, is_active, sort_order);

insert into default_template_packs (pack_key, template_key, title, body, sort_order) values
  ('info_only_v1', 'reach_greeting', 'Birinchi salom', 'Assalomu alaykum, yaxshimisiz?', 10),
  ('info_only_v1', 'ask_application', 'Ariza qoldirganini so''rash', 'Assalomu alaykum. Siz bizning loyihaga kirish uchun ariza qoldirgansiz. Shunaqami?', 20),
  ('info_only_v1', 'ask_info', 'Ma''lumot bor-yo''qligini so''rash', 'Ajoyib. Loyihamizga kirishning foydali jihatlari haqida batafsil ma''lumotga egamisiz?', 30),
  ('info_only_v1', 'known_info_preface', 'Ma''lumot bor desa kirish', 'Keling, unda yana bir bor qisqacha tanishtirib o''taman.', 40),
  ('info_only_v1', 'unknown_info_preface', 'Ma''lumot yo''q desa kirish', 'Keling, unda batafsil tushuntirib beraman.', 50),
  ('info_only_v1', 'full_intro', 'Batafsil ma''lumot', 'Loyihamiz ishtirokchilariga internetda ko''rinish, shaxsiy portfolio va rasmiy havola sifatida foydalanish imkonini beradi.', 60),
  ('info_only_v1', 'offer_end', 'Oferta oxiri', 'Oferta va xabar bilan tanishib chiqing va ayting.', 70),
  ('info_only_v1', 'application_link_reply', 'Ariza havolasi', 'Keling, avval ushbu havola orqali ariza qoldiring va qayta yozing.\n\n{APPLICATION_LINK}', 80),
  ('info_only_v1', 'media_text_request', 'Matn so''rash', 'Iltimos, javobingizni qisqa matn ko''rinishida yuboring.', 90)
on conflict (pack_key, template_key) do nothing;

insert into default_flow_packs (
  pack_key, flow_key, step_key, display_name, template_key, wait_for_reply,
  next_step_yes, next_step_no, next_step_partial, next_step_unknown,
  next_step_on_confirm, next_step_on_reject, next_step_on_needs_info,
  next_step_on_unclear, human_needed_on_unclear, stop_after_send, sort_order
) values
  ('info_only_v1', 'info_only', 'ask_application', 'Ariza tasdig''i', 'ask_application', true,
    'ask_info', 'application_link', 'ask_info', 'human_needed',
    'ask_info', 'application_link', 'ask_info', 'human_needed', true, false, 10),
  ('info_only_v1', 'info_only', 'ask_info', 'Ma''lumot holati', 'ask_info', true,
    'has_info', 'no_info', 'has_info', 'human_needed',
    'has_info', 'no_info', 'has_info', 'human_needed', true, false, 20),
  ('info_only_v1', 'info_only', 'has_info', 'Qisqa tanishtiruv', 'known_info_preface,full_intro,offer_end', false,
    null, null, null, null, null, null, null, null, true, true, 30),
  ('info_only_v1', 'info_only', 'no_info', 'Batafsil tanishtiruv', 'unknown_info_preface,full_intro,offer_end', false,
    null, null, null, null, null, null, null, null, true, true, 40),
  ('info_only_v1', 'info_only', 'application_link', 'Ariza havolasi', 'application_link_reply', false,
    null, null, null, null, null, null, null, null, true, true, 50)
on conflict (pack_key, flow_key, step_key) do nothing;

create or replace function provision_workspace_business_connection(
  p_owner_telegram_id text,
  p_owner_username text,
  p_owner_first_name text,
  p_workspace_name text,
  p_business_connection_id text,
  p_account_key text,
  p_template_pack_key text default 'info_only_v1',
  p_flow_pack_key text default 'info_only_v1',
  p_trial_days integer default 3
)
returns table (
  workspace_id uuid,
  workspace_business_account_id uuid,
  account_key text,
  already_connected boolean,
  subscription_status text,
  trial_ends_at timestamptz,
  trial_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_row platform_users%rowtype;
  workspace_row workspaces%rowtype;
  account_row workspace_business_accounts%rowtype;
  subscription_row subscriptions%rowtype;
  existing_workspace_id uuid;
  trial_error text := null;
  normalized_account_key text;
  normalized_workspace_name text;
begin
  if nullif(btrim(p_owner_telegram_id), '') is null then
    raise exception 'owner_telegram_id_required';
  end if;
  if nullif(btrim(p_business_connection_id), '') is null then
    raise exception 'business_connection_id_required';
  end if;
  if p_trial_days is null or p_trial_days < 1 or p_trial_days > 30 then
    raise exception 'invalid_trial_days';
  end if;

  normalized_account_key := lower(regexp_replace(coalesce(p_account_key, ''), '[^a-zA-Z0-9_]', '_', 'g'));
  if normalized_account_key = '' then
    normalized_account_key := 'ws_' || left(md5(p_business_connection_id), 24);
  end if;
  normalized_workspace_name := coalesce(nullif(btrim(p_workspace_name), ''), 'Yangi workspace');

  select wba.workspace_id into existing_workspace_id
  from workspace_business_accounts wba
  where wba.business_connection_id = p_business_connection_id
  for update;

  if found then
    select * into account_row from workspace_business_accounts where workspace_id = existing_workspace_id and business_connection_id = p_business_connection_id;
    select * into subscription_row from subscriptions where subscriptions.workspace_id = existing_workspace_id;
    return query select
      existing_workspace_id,
      account_row.id,
      account_row.existing_account_key,
      true,
      coalesce(subscription_row.status, 'pending'),
      subscription_row.trial_ends_at,
      coalesce(subscription_row.status_reason, 'business_connection_already_bound');
    return;
  end if;

  insert into platform_users (telegram_user_id, username, first_name, status, updated_at)
  values (p_owner_telegram_id, nullif(p_owner_username, ''), nullif(p_owner_first_name, ''), 'active', now())
  on conflict (telegram_user_id) do update
  set username = coalesce(excluded.username, platform_users.username),
      first_name = coalesce(excluded.first_name, platform_users.first_name),
      status = 'active',
      updated_at = now()
  returning * into owner_row;

  insert into workspaces (workspace_key, name, owner_user_id, status, is_platform_internal, created_at, updated_at)
  values ('workspace:' || normalized_account_key, normalized_workspace_name, owner_row.id, 'active', false, now(), now())
  returning * into workspace_row;

  insert into workspace_members (workspace_id, user_id, role, is_active, created_at, updated_at)
  values (workspace_row.id, owner_row.id, 'owner', true, now(), now())
  on conflict (workspace_id, user_id) do nothing;

  insert into workspace_business_accounts (
    workspace_id, existing_account_key, business_connection_id, display_name,
    bot_enabled, reach_enabled, followup_enabled, archive_enabled, status,
    connection_owner_telegram_id, template_pack_key, flow_pack_key, created_at, updated_at
  ) values (
    workspace_row.id, normalized_account_key, p_business_connection_id, normalized_workspace_name,
    true, true, true, true, 'connected', p_owner_telegram_id,
    p_template_pack_key, p_flow_pack_key, now(), now()
  ) returning * into account_row;

  insert into subscriptions (workspace_id, plan_code, status, is_platform_internal, activated_by, created_at, updated_at)
  values (workspace_row.id, 'trial', 'pending', false, 'business_connection', now(), now())
  on conflict (workspace_id) do nothing;

  insert into bot_accounts (
    account_key, label, project_name, owner_user_id, owner_username, owner_first_name,
    business_owner_id, admin_chat_id, business_connection_id, bot_enabled,
    auto_reply_enabled, reach_enabled, followup_enabled, archive_enabled,
    reports_enabled, custom_commands_enabled, ai_rules_enabled, flow_key,
    timezone, workspace_id, workspace_business_account_id, created_at, updated_at
  ) values (
    normalized_account_key, normalized_workspace_name, normalized_workspace_name,
    p_owner_telegram_id, nullif(p_owner_username, ''), nullif(p_owner_first_name, ''),
    p_owner_telegram_id, p_owner_telegram_id, p_business_connection_id, true,
    true, true, true, true, true, true, true, 'info_only',
    'Asia/Tashkent', workspace_row.id, account_row.id, now(), now()
  ) on conflict (account_key) do nothing;

  insert into business_accounts (
    account_key, label, project_name, owner_user_id, owner_username, admin_chat_id,
    business_connection_id, bot_enabled, auto_reply_enabled, reach_enabled,
    followup_enabled, archive_enabled, reports_enabled, custom_commands_enabled,
    ai_rules_enabled, flow_key, timezone, workspace_id, workspace_business_account_id,
    created_at, updated_at
  ) values (
    normalized_account_key, normalized_workspace_name, normalized_workspace_name,
    p_owner_telegram_id, nullif(p_owner_username, ''), p_owner_telegram_id,
    p_business_connection_id, true, true, true, true, true, true, true,
    true, 'info_only', 'Asia/Tashkent', workspace_row.id, account_row.id, now(), now()
  ) on conflict (account_key) do nothing;

  insert into business_connection_accounts (
    business_connection_id, account_key, user_id, username, first_name,
    workspace_id, workspace_business_account_id, created_at, updated_at
  ) values (
    p_business_connection_id, normalized_account_key, p_owner_telegram_id,
    nullif(p_owner_username, ''), nullif(p_owner_first_name, ''),
    workspace_row.id, account_row.id, now(), now()
  ) on conflict (business_connection_id) do nothing;

  insert into account_admins (
    account_key, telegram_user_id, username, role, is_active, workspace_id, created_at, updated_at
  ) values (
    normalized_account_key, p_owner_telegram_id, nullif(p_owner_username, ''), 'owner', true,
    workspace_row.id, now(), now()
  ) on conflict (account_key, telegram_user_id) do nothing;

  insert into reply_templates (
    key, account_key, title, body, workspace_id, workspace_business_account_id, updated_at
  )
  select
    normalized_account_key || ':' || p.template_key,
    normalized_account_key,
    p.title,
    p.body,
    workspace_row.id,
    account_row.id,
    now()
  from default_template_packs p
  where p.pack_key = p_template_pack_key and p.is_active = true
  on conflict (key) do nothing;

  insert into account_flow_steps (
    account_key, flow_key, step_key, display_name, template_key, wait_for_reply,
    next_step_yes, next_step_no, next_step_partial, next_step_unknown,
    next_step_on_confirm, next_step_on_reject, next_step_on_needs_info,
    next_step_on_unclear, human_needed_on_unclear, stop_after_send,
    sort_order, is_active, workspace_id, workspace_business_account_id, created_at, updated_at
  )
  select
    normalized_account_key, p.flow_key, p.step_key, p.display_name, p.template_key, p.wait_for_reply,
    p.next_step_yes, p.next_step_no, p.next_step_partial, p.next_step_unknown,
    p.next_step_on_confirm, p.next_step_on_reject, p.next_step_on_needs_info,
    p.next_step_on_unclear, p.human_needed_on_unclear, p.stop_after_send,
    p.sort_order, p.is_active, workspace_row.id, account_row.id, now(), now()
  from default_flow_packs p
  where p.pack_key = p_flow_pack_key and p.is_active = true
  on conflict (account_key, flow_key, step_key) do nothing;

  update workspace_business_accounts
  set defaults_copied_at = now(), onboarding_completed_at = now(), updated_at = now()
  where id = account_row.id;

  insert into workspace_onboarding (
    workspace_id, owner_telegram_user_id, status, business_connection_id, started_at, completed_at, updated_at
  ) values (
    workspace_row.id, p_owner_telegram_id, 'business_connected', p_business_connection_id, now(), now(), now()
  ) on conflict (workspace_id) do nothing;

  begin
    select * into subscription_row
    from start_workspace_trial(
      workspace_row.id,
      account_row.id,
      p_owner_telegram_id,
      p_trial_days,
      'business_connection',
      false
    );
  exception when others then
    get stacked diagnostics trial_error = message_text;
    update subscriptions
    set status = 'pending',
        status_reason = 'trial_not_granted',
        activated_by = 'business_connection',
        last_status_changed_at = now(),
        updated_at = now()
    where workspace_id = workspace_row.id;
    select * into subscription_row from subscriptions where workspace_id = workspace_row.id;
  end;

  if trial_error is not null then
    update workspace_onboarding
    set status = 'trial_review_required', last_error = trial_error, updated_at = now()
    where workspace_id = workspace_row.id;
  else
    update workspace_onboarding
    set status = 'ready', last_error = null, updated_at = now()
    where workspace_id = workspace_row.id;
  end if;

  return query select
    workspace_row.id,
    account_row.id,
    normalized_account_key,
    false,
    coalesce(subscription_row.status, 'pending'),
    subscription_row.trial_ends_at,
    trial_error;
end;
$$;

revoke execute on function provision_workspace_business_connection(text, text, text, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function provision_workspace_business_connection(text, text, text, text, text, text, text, text, integer) to service_role;

commit;
