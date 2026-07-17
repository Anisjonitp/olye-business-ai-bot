import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [indexSource, sqlSource, migrationSource, envSource, readmeSource, packageSource] = await Promise.all([
  readFile(new URL('../index.js', import.meta.url), 'utf8'),
  readFile(new URL('../supabase.sql', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/20260716_phase3_onboarding.sql', import.meta.url), 'utf8'),
  readFile(new URL('../.env.example', import.meta.url), 'utf8'),
  readFile(new URL('../README.md', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8')
]);

for (const route of ["app.get('/',", "app.get('/health',", "app.get('/set-webhook',", "app.get('/webhook-info',", "app.post('/webhook',", "app.post('/admin-webhook',"]) {
  assert.ok(indexSource.includes(route), `Missing production route: ${route}`);
}

for (const token of [
  'newUserOnboardingIsEnabled',
  'provisionNewWorkspaceBusinessConnection',
  'sendUserOnboardingMenu',
  'handleUserOnboardingMessage',
  'handleUserOnboardingCallback',
  'isInternalLegacyBusinessAccount',
  'markWorkspaceBusinessConnectionStatus',
  "provision_workspace_business_connection",
  "connection.is_enabled === false"
]) {
  assert.ok(indexSource.includes(token), `Missing Phase 3 runtime helper: ${token}`);
}

for (const sqlToken of [
  'create table if not exists workspace_onboarding',
  'create table if not exists default_template_packs',
  'create table if not exists default_flow_packs',
  'create or replace function provision_workspace_business_connection',
  'from start_workspace_trial(',
  'business_connection_already_bound',
  'on conflict (key) do nothing',
  'on conflict (account_key, flow_key, step_key) do nothing'
]) {
  assert.ok(sqlSource.toLowerCase().includes(sqlToken.toLowerCase()), `Missing Phase 3 SQL in supabase.sql: ${sqlToken}`);
  assert.ok(migrationSource.toLowerCase().includes(sqlToken.toLowerCase()), `Missing Phase 3 migration SQL: ${sqlToken}`);
}

assert.ok(sqlSource.includes('subscription_trial_grants'), 'Phase 3 must continue to rely on Phase 2 trial grants');

assert.match(migrationSource, /^begin;/);
assert.match(migrationSource, /commit;\s*$/);
assert.doesNotMatch(migrationSource, new RegExp(['drop', 'table'].join('\\s+'), 'i'), 'Destructive table removal is forbidden');
assert.doesNotMatch(migrationSource, new RegExp('trun' + 'cate', 'i'), 'Destructive table clearing is forbidden');
assert.doesNotMatch(migrationSource, /\bdelete\s+from\b/i, 'Bulk delete is forbidden in Phase 3 migration');
assert.ok(!migrationSource.includes("perform bootstrap_legacy_workspace('uzlye')"), 'Phase 3 must not bootstrap or rewrite UZLYE');
assert.ok(!migrationSource.includes("perform bootstrap_legacy_workspace('second')"), 'Phase 3 must not bootstrap or rewrite second');
assert.ok(!(indexSource + sqlSource + migrationSource).toLowerCase().includes(['bot', 'wizard', 'sessions'].join('_')), 'Legacy wizard session table must not be used');

for (const envLine of [
  'SAAS_PLATFORM_ENABLED=false',
  'NEW_USER_ONBOARDING_ENABLED=false',
  'NEW_WORKSPACE_TEMPLATE_PACK=info_only_v1',
  'NEW_WORKSPACE_FLOW_PACK=info_only_v1',
  'TRIAL_DAYS=3'
]) {
  assert.ok(envSource.includes(envLine), `Missing safe Phase 3 environment default: ${envLine}`);
}

assert.ok(readmeSource.includes('PHASE 3: yangi user onboarding'), 'README must document Phase 3 rollout');
assert.ok(JSON.parse(packageSource).scripts['check:phase3'], 'Missing Phase 3 regression command');

console.log('PHASE 3 regression checks passed');
