import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [indexSource, sqlSource, migrationSource, envSource] = await Promise.all([
  readFile(new URL('../index.js', import.meta.url), 'utf8'),
  readFile(new URL('../supabase.sql', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/20260716_phase1_workspace.sql', import.meta.url), 'utf8'),
  readFile(new URL('../.env.example', import.meta.url), 'utf8')
]);

for (const route of ["app.get('/',", "app.get('/health',", "app.get('/set-webhook',", "app.get('/webhook-info',", "app.post('/webhook',", "app.post('/admin-webhook',"]) {
  assert.ok(indexSource.includes(route), `Missing production route: ${route}`);
}

for (const updateType of ['message', 'callback_query', 'business_message', 'business_connection', 'edited_business_message', 'deleted_business_messages']) {
  assert.ok(indexSource.includes(`'${updateType}'`), `Missing Telegram update type: ${updateType}`);
}

assert.match(indexSource, /key === 'second' \|\| key === 'liderlar' \|\| key === secondKey/);
assert.ok(indexSource.includes('resolveWorkspaceByAccountKey'));
assert.ok(indexSource.includes('resolveLegacyAccountKey'));
assert.ok(indexSource.includes('resolveTenantContext'));

for (const table of ['platform_users', 'workspaces', 'workspace_members', 'workspace_business_accounts', 'subscriptions', 'subscription_payments']) {
  assert.ok(sqlSource.includes(`create table if not exists ${table}`), `Missing Phase 1 table: ${table}`);
  assert.ok(migrationSource.includes(`create table if not exists ${table}`), `Missing table in standalone migration: ${table}`);
}

assert.ok(sqlSource.includes("perform bootstrap_legacy_workspace('uzlye')"));
assert.ok(sqlSource.includes("perform bootstrap_legacy_workspace('second')"));
assert.ok(sqlSource.includes("perform bootstrap_legacy_workspace('liderlar')"));
assert.match(migrationSource, /^begin;/);
assert.match(migrationSource, /commit;\s*$/);
assert.doesNotMatch(sqlSource, /on conflict\s*\(key\)\s*do update/i, 'Template bodies must not be overwritten');
assert.doesNotMatch(sqlSource, new RegExp(['drop', 'table'].join('\\s+'), 'i'), 'Destructive table removal is forbidden');
assert.doesNotMatch(sqlSource, new RegExp('trun' + 'cate', 'i'), 'Destructive table clearing is forbidden');
assert.ok(!(indexSource + sqlSource + migrationSource).toLowerCase().includes(['bot', 'wizard', 'sessions'].join('_')), 'Legacy wizard session table must not be used');

for (const flag of ['SAAS_PLATFORM_ENABLED=false', 'NEW_USER_ONBOARDING_ENABLED=false', 'FLOW_BUILDER_ENABLED=false', 'SUBSCRIPTION_ENFORCEMENT_ENABLED=false']) {
  assert.ok(envSource.includes(flag), `Unsafe or missing default flag: ${flag}`);
}

console.log('PHASE 1 regression checks passed');
