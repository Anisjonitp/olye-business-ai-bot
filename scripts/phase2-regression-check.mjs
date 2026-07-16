import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [indexSource, sqlSource, migrationSource, envSource, packageSource] = await Promise.all([
  readFile(new URL('../index.js', import.meta.url), 'utf8'),
  readFile(new URL('../supabase.sql', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/20260716_phase2_subscriptions.sql', import.meta.url), 'utf8'),
  readFile(new URL('../.env.example', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8')
]);

for (const route of ["app.get('/',", "app.get('/health',", "app.get('/set-webhook',", "app.get('/webhook-info',", "app.post('/webhook',", "app.post('/admin-webhook',"]) {
  assert.ok(indexSource.includes(route), `Missing production route: ${route}`);
}

for (const updateType of ['message', 'callback_query', 'business_message', 'business_connection', 'edited_business_message', 'deleted_business_messages']) {
  assert.ok(indexSource.includes(`'${updateType}'`), `Missing Telegram update type: ${updateType}`);
}

for (const token of [
  'canWorkspaceAutomate',
  'expireSubscriptionIfDue',
  'processSubscriptionLifecycle',
  'sendTrialLifecycleNotification',
  'confirmPlatformProActivation',
  'extendPlatformTrial',
  'expirePlatformSubscription',
  'sendUserTariff'
]) {
  assert.ok(indexSource.includes(token), `Missing Phase 2 runtime helper: ${token}`);
}

for (const action of [
  "action: 'lead_auto_reply'",
  "action: 'business_incoming_auto_reply'",
  "action: 'business_reach_campaign_start'",
  "action: 'scheduled_reach'",
  "action: 'auto_outreach_start'",
  "action: 'manual_campaign_start'",
  "action: 'manual_bulk_reach'",
  "action: 'ai_intent'",
  "action: 'archive_media_restore'"
]) {
  assert.ok(indexSource.includes(action), `Missing subscription guard action: ${action}`);
}

for (const sqlToken of [
  'create table if not exists subscription_trial_grants',
  'create table if not exists interaction_sessions',
  'create or replace function start_workspace_trial',
  'create or replace function extend_workspace_trial',
  'create or replace function activate_workspace_pro',
  'create or replace function expire_workspace_subscription',
  'subscription_trial_grants_connection_unique_idx',
  'grant execute on function activate_workspace_pro',
  "w.is_platform_internal = true"
]) {
  assert.ok(sqlSource.toLowerCase().includes(sqlToken.toLowerCase()), `Missing Phase 2 SQL in supabase.sql: ${sqlToken}`);
  assert.ok(migrationSource.toLowerCase().includes(sqlToken.toLowerCase()), `Missing Phase 2 migration SQL: ${sqlToken}`);
}

assert.match(migrationSource, /^begin;/);
assert.match(migrationSource, /commit;\s*$/);
assert.doesNotMatch(migrationSource, new RegExp(['drop', 'table'].join('\\s+'), 'i'), 'Destructive table removal is forbidden');
assert.doesNotMatch(migrationSource, new RegExp('trun' + 'cate', 'i'), 'Destructive table clearing is forbidden');
assert.doesNotMatch(migrationSource, /\bdelete\s+from\b/i, 'Bulk delete is forbidden in Phase 2 migration');
assert.doesNotMatch(sqlSource, /on conflict\s*\(key\)\s*do update/i, 'Template bodies must not be overwritten');
assert.ok(!(indexSource + sqlSource + migrationSource).toLowerCase().includes(['bot', 'wizard', 'sessions'].join('_')), 'Legacy wizard session table must not be used');

for (const envLine of [
  'SAAS_PLATFORM_ENABLED=false',
  'NEW_USER_ONBOARDING_ENABLED=false',
  'FLOW_BUILDER_ENABLED=false',
  'SUBSCRIPTION_ENFORCEMENT_ENABLED=false',
  'TRIAL_DAYS=3',
  'PLATFORM_SUPPORT_CONTACT='
]) {
  assert.ok(envSource.includes(envLine), `Missing safe env default: ${envLine}`);
}

assert.match(indexSource, /subscriptionIsInternal\(context\) && status === 'pro'/);
assert.ok(indexSource.includes("callback_data: `sub_confirm:${session.workspace_id}`"));
assert.ok(indexSource.includes("p_payment_amount: Number(payload.payment_amount || 0)"));
assert.ok(indexSource.includes("if (await isPlatformSuperAdmin(from.id)) return true;"));
assert.ok(JSON.parse(packageSource).scripts['check:phase2']);

console.log('PHASE 2 regression checks passed');
