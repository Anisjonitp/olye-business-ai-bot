-- Account flow-step tenant-scope backfill.
-- Run this file in sections, in the order documented below. It makes no UZLYE/default fallback.
-- The update targets only active rows whose workspace_id or workspace_business_account_id is NULL.

-- 0. Schema guard: every required column must exist before proceeding.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'account_flow_steps' and column_name in (
      'account_key', 'flow_key', 'template_key', 'workspace_id',
      'workspace_business_account_id', 'is_active'
    ))
    or
    (table_name = 'workspace_business_accounts' and column_name in (
      'existing_account_key', 'id', 'workspace_id', 'status'
    ))
  )
order by table_name, column_name;

do $$
declare
  required_columns integer := 10;
  found_columns integer;
begin
  select count(*) into found_columns
  from information_schema.columns
  where table_schema = 'public'
    and (
      (table_name = 'account_flow_steps' and column_name in (
        'account_key', 'flow_key', 'template_key', 'workspace_id',
        'workspace_business_account_id', 'is_active'
      ))
      or
      (table_name = 'workspace_business_accounts' and column_name in (
        'existing_account_key', 'id', 'workspace_id', 'status'
      ))
    );
  if found_columns <> required_columns then
    raise exception 'required flow-scope columns missing: expected %, found %', required_columns, found_columns;
  end if;
end $$;

-- A. PREVIEW ONLY. Review every row before executing section C.
with active_mappings as (
  select
    wba.existing_account_key,
    wba.workspace_id,
    wba.id as workspace_business_account_id
  from workspace_business_accounts wba
  where wba.status in ('active', 'connected')
), mapping_counts as (
  select existing_account_key, count(*) as mapping_count
  from active_mappings
  group by existing_account_key
), candidates as (
  select
    f.id as flow_step_identifier,
    f.account_key,
    f.flow_key,
    f.step_key,
    f.template_key,
    f.workspace_id as old_workspace_id,
    f.workspace_business_account_id as old_workspace_business_account_id,
    m.workspace_id as proposed_workspace_id,
    m.workspace_business_account_id as proposed_workspace_business_account_id,
    coalesce(mc.mapping_count, 0) as mapping_count
  from account_flow_steps f
  left join mapping_counts mc on mc.existing_account_key = f.account_key
  left join active_mappings m
    on m.existing_account_key = f.account_key
   and coalesce(mc.mapping_count, 0) = 1
  where f.is_active is true
    and (f.workspace_id is null or f.workspace_business_account_id is null)
)
select *
from candidates
order by account_key, flow_key, step_key, flow_step_identifier;

with active_mappings as (
  select wba.existing_account_key
  from workspace_business_accounts wba
  where wba.status in ('active', 'connected')
), mapping_counts as (
  select existing_account_key, count(*) as mapping_count
  from active_mappings
  group by existing_account_key
)
select count(*) as preview_eligible_row_count
from account_flow_steps f
join mapping_counts mc
  on mc.existing_account_key = f.account_key
 and mc.mapping_count = 1
where f.is_active is true
  and (f.workspace_id is null or f.workspace_business_account_id is null);

-- B. AMBIGUOUS OR UNMAPPED ROWS. These must be manually reviewed; section C skips them.
with active_mappings as (
  select wba.existing_account_key
  from workspace_business_accounts wba
  where wba.status in ('active', 'connected')
), mapping_counts as (
  select existing_account_key, count(*) as mapping_count
  from active_mappings
  group by existing_account_key
)
select
  f.id as flow_step_identifier,
  f.account_key,
  f.flow_key,
  f.step_key,
  f.template_key,
  f.workspace_id,
  f.workspace_business_account_id,
  coalesce(mc.mapping_count, 0) as mapping_count,
  case when coalesce(mc.mapping_count, 0) = 0 then 'unmapped' else 'ambiguous' end as review_reason
from account_flow_steps f
left join mapping_counts mc on mc.existing_account_key = f.account_key
where f.is_active is true
  and (f.workspace_id is null or f.workspace_business_account_id is null)
  and coalesce(mc.mapping_count, 0) <> 1
order by f.account_key, f.flow_key, f.step_key, f.id;

-- C. UPDATE. Run only after section B returns zero rows.
-- The unique mapping condition prevents cross-tenant writes and makes re-runs idempotent.
with active_mappings as (
  select
    wba.existing_account_key,
    wba.workspace_id,
    wba.id as workspace_business_account_id
  from workspace_business_accounts wba
  where wba.status in ('active', 'connected')
), mapping_counts as (
  select existing_account_key, count(*) as mapping_count
  from active_mappings
  group by existing_account_key
), updated as (
  update account_flow_steps f
  set workspace_id = m.workspace_id,
      workspace_business_account_id = m.workspace_business_account_id,
      updated_at = now()
  from active_mappings m
  join mapping_counts mc
    on mc.existing_account_key = m.existing_account_key
   and mc.mapping_count = 1
  where f.account_key = m.existing_account_key
    and f.is_active is true
    and (f.workspace_id is null or f.workspace_business_account_id is null)
  returning f.id, f.account_key, f.flow_key, f.step_key, f.template_key,
            f.workspace_id, f.workspace_business_account_id
)
select count(*) as affected_row_count, coalesce(jsonb_agg(updated), '[]'::jsonb) as affected_rows
from updated;

-- D. POST-MIGRATION VERIFICATION.
-- Remaining null-scoped active rows should be zero unless section B intentionally reported manual-review rows.
select count(*) as null_tenant_scope_active_flow_rows
from account_flow_steps
where is_active is true
  and (workspace_id is null or workspace_business_account_id is null);

select
  workspace_id,
  workspace_business_account_id,
  account_key,
  flow_key,
  step_key,
  count(*) as duplicate_canonical_flow_rows
from account_flow_steps
where is_active is true
group by workspace_id, workspace_business_account_id, account_key, flow_key, step_key
having count(*) > 1
order by workspace_id, workspace_business_account_id, account_key, flow_key, step_key;

select
  workspace_id,
  workspace_business_account_id,
  account_key,
  flow_key,
  step_key,
  template_key,
  is_active,
  case
    when step_key = 'ask_info' then 'ask_info'
    when step_key = 'asked_info' then 'asked_info_alias'
    when step_key = 'info' then 'info_alias'
    when step_key = 'info_question' then 'info_question_alias'
  end as canonical_resolution
from account_flow_steps
where step_key in ('ask_info', 'asked_info', 'info', 'info_question')
order by workspace_id, workspace_business_account_id, account_key,
  case step_key when 'ask_info' then 1 when 'asked_info' then 2 when 'info' then 3 else 4 end;
