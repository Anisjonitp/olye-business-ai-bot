import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [indexSource, sqlSource, migrationSource, envSource, packageSource] = await Promise.all([
  readFile(new URL('../index.js', import.meta.url), 'utf8'),
  readFile(new URL('../supabase.sql', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/20260716_final_platform.sql', import.meta.url), 'utf8'),
  readFile(new URL('../.env.example', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8')
]);

for (const token of ['provision_workspace_business_connection', 'newUserOnboardingIsEnabled', 'sendWorkspaceLeadPanel', 'sendWorkspaceOperators', 'sendFollowupSettings', 'startCommandCreate', 'canWorkspaceAutomate']) {
  assert.ok(indexSource.includes(token), `Missing final runtime capability: ${token}`);
}

for (const table of ['workspace_onboarding', 'default_template_packs', 'default_flow_packs', 'conversation_flows', 'conversation_flow_steps', 'conversation_flow_transitions', 'followup_policies', 'workspace_limits', 'platform_error_events', 'evidence_exports', 'workspace_daily_metrics', 'lead_contact_time_stats']) {
  assert.ok(migrationSource.includes(`create table if not exists ${table}`), `Missing final table: ${table}`);
  assert.ok(sqlSource.includes(`create table if not exists ${table}`), `Missing final SQL table: ${table}`);
}

assert.match(migrationSource, /^begin;/);
assert.match(migrationSource, /commit;\s*$/);
assert.doesNotMatch(migrationSource, /\bdrop\s+table\b/i);
assert.doesNotMatch(migrationSource, /\btruncate\b/i);
assert.doesNotMatch(migrationSource, /\bdelete\s+from\b/i);
assert.ok(!(indexSource + sqlSource + migrationSource).toLowerCase().includes(['bot', 'wizard', 'sessions'].join('_')));
assert.ok(indexSource.includes("DEFAULT_ACCOUNT_KEY"));
assert.ok(indexSource.includes("'liderlar'"));
for (const envLine of ['CRM_PRO_FEATURES_ENABLED=false', 'ARCHIVE_ENABLED=true', 'NEW_USER_ONBOARDING_ENABLED=false']) {
  assert.ok(envSource.includes(envLine), `Missing final env default: ${envLine}`);
}
assert.ok(JSON.parse(packageSource).scripts['check:final']);
console.log('Final platform regression checks passed');
