import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const OWNER_TELEGRAM_ID = process.env.OWNER_TELEGRAM_ID || '';
const BUSINESS_OWNER_ID = process.env.BUSINESS_OWNER_ID || OWNER_TELEGRAM_ID || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const APPLICATION_LINK = process.env.APPLICATION_LINK || 'https://liderlar.uz/ariza_qoldirish';
const DEFAULT_ACCOUNT_KEY = 'uzlye';
const LEGACY_DEFAULT_ACCOUNT_KEY = 'default';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

const MESSAGE_BUFFER_MS = Number(process.env.MESSAGE_BUFFER_MS || 5000);
const AUTO_START_REQUIRE_OUTREACH = String(process.env.AUTO_START_REQUIRE_OUTREACH || 'true') === 'true';
const AUTO_OUTREACH_DEFAULT_HOURS = Number(process.env.AUTO_OUTREACH_DEFAULT_HOURS || 2);
const OUTREACH_GREETING_REQUIRED = String(process.env.OUTREACH_GREETING_REQUIRED || 'true') === 'true';
// Agar Telegram scheduled/outgoing xabarni outreach sifatida ko‘rmasa ham,
// bot mijoz javobidan yoki adminning oxirgi xabaridan vaziyatni aniqlab davom ettiradi.
const CONTEXT_RESUME_ENABLED = String(process.env.CONTEXT_RESUME_ENABLED || 'true') === 'true';
const CONTEXT_RESUME_FROM_USER_CONFIRM = String(process.env.CONTEXT_RESUME_FROM_USER_CONFIRM || 'true') === 'true';
const DAILY_DEFAULT_START = process.env.DAILY_AUTO_START || '07:00';
const DAILY_DEFAULT_DURATION_HOURS = Number(process.env.DAILY_AUTO_DURATION_HOURS || 2);
const LOCAL_UTC_OFFSET_HOURS = Number(process.env.LOCAL_UTC_OFFSET_HOURS || 5);
const DAILY_NO_OUTREACH_WARN_MIN = Number(process.env.DAILY_NO_OUTREACH_WARN_MIN || 15);
const REMINDER_AFTER_MS = Number(process.env.REMINDER_AFTER_MS || 3600000);
const SCHEDULER_TICK_MS = Number(process.env.SCHEDULER_TICK_MS || 60000);
const MEDIA_ARCHIVE_ENABLED = String(process.env.MEDIA_ARCHIVE_ENABLED || 'true') === 'true';
const MEDIA_ARCHIVE_DOWNLOAD = String(process.env.MEDIA_ARCHIVE_DOWNLOAD || 'false') === 'true';
const MEDIA_ARCHIVE_MAX_BYTES = Number(process.env.MEDIA_ARCHIVE_MAX_BYTES || 20000000);
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'business-media-archive';
const AI_INTENT_ENABLED = String(process.env.AI_INTENT_ENABLED || 'true') === 'true';
const AI_TEMPLATE_EDITOR_ENABLED = String(process.env.AI_TEMPLATE_EDITOR_ENABLED || 'true') === 'true';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const UNKNOWN_ACCOUNT_KEY = 'unknown';

if (!BOT_TOKEN) throw new Error('BOT_TOKEN missing');
if (!SUPABASE_URL) throw new Error('SUPABASE_URL missing');
if (!SUPABASE_KEY) throw new Error('SUPABASE key missing');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const STAGE = {
  NEW: 'new',
  PENDING_APPROVAL: 'pending_approval',
  OUTREACH_SENT: 'outreach_sent',
  ASKED_APPLICATION: 'asked_application',
  ASKED_INFO: 'asked_info',
  INFO_SENT_FINISHED: 'info_sent_finished',
  PAUSED: 'paused',
  DISABLED: 'disabled'
};

const STOP_REPLY_STAGES = new Set([STAGE.INFO_SENT_FINISHED, STAGE.PAUSED, STAGE.DISABLED]);
const IGNORE_REASONS = [
  'auto_reply_off',
  'no_outreach_session',
  'old_finished_chat',
  'blocked_stage',
  'duplicate_message',
  'context_resume_not_detected'
];
const buffers = new Map();
let schedulerBusy = false;

function parseAccountsFromEnv() {
  const fallback = [{
    account_key: DEFAULT_ACCOUNT_KEY,
    label: 'UZLYE',
    business_owner_id: BUSINESS_OWNER_ID || OWNER_TELEGRAM_ID || '',
    admin_chat_id: ADMIN_CHAT_ID || '',
    business_connection_id: '',
    project_name: 'O‘zbekiston Lider Yoshlari Ensiklopediyasi',
    flow_key: 'uzlye_info_only',
    archive_enabled: true,
    archive_notify_enabled: true
  }];

  if (!process.env.BUSINESS_ACCOUNTS_JSON) {
    if (String(process.env.SECOND_ACCOUNT_ENABLED || 'false') === 'true') {
      fallback.push({
        account_key: process.env.SECOND_ACCOUNT_KEY || 'second',
        label: process.env.SECOND_ACCOUNT_LABEL || 'Ikkinchi akkaunt',
        business_owner_id: process.env.SECOND_ACCOUNT_BUSINESS_OWNER_ID || '',
        admin_chat_id: process.env.SECOND_ACCOUNT_ADMIN_CHAT_ID || '',
        business_connection_id: process.env.SECOND_ACCOUNT_BUSINESS_CONNECTION_ID || '',
        project_name: process.env.SECOND_ACCOUNT_PROJECT_NAME || 'Millat Iftixorlari ensiklopediyasi',
        flow_key: process.env.SECOND_ACCOUNT_FLOW_KEY || 'second_info_only',
        archive_enabled: true,
        archive_notify_enabled: true
      });
    }
    return fallback;
  }
  try {
    const parsed = JSON.parse(process.env.BUSINESS_ACCOUNTS_JSON);
    if (!Array.isArray(parsed) || !parsed.length) return fallback;
    return parsed.map((a, i) => ({
      account_key: String(a.account_key || a.key || `account_${i + 1}`),
      label: String(a.label || a.account_key || `Account ${i + 1}`),
      business_owner_id: String(a.business_owner_id || ''),
      admin_chat_id: String(a.admin_chat_id || ADMIN_CHAT_ID || ''),
      business_connection_id: String(a.business_connection_id || ''),
      project_name: String(a.project_name || a.label || a.account_key || `Account ${i + 1}`),
      flow_key: String(a.flow_key || 'info_only'),
      archive_enabled: a.archive_enabled !== false,
      archive_notify_enabled: a.archive_notify_enabled !== false
    }));
  } catch (err) {
    console.error('BUSINESS_ACCOUNTS_JSON parse error:', err.message);
    return fallback;
  }
}

const ENV_ACCOUNTS = parseAccountsFromEnv();
const DEFAULT_ACCOUNT = ENV_ACCOUNTS[0] || {
  account_key: DEFAULT_ACCOUNT_KEY,
  label: 'UZLYE',
  business_owner_id: BUSINESS_OWNER_ID || OWNER_TELEGRAM_ID || '',
  admin_chat_id: ADMIN_CHAT_ID || '',
  business_connection_id: '',
  project_name: 'O‘zbekiston Lider Yoshlari Ensiklopediyasi',
  flow_key: 'uzlye_info_only',
  archive_enabled: true,
  archive_notify_enabled: true
};

function normalizeAccount(account = {}) {
  const ownerUserId = String(account.owner_user_id || account.business_owner_id || '');
  const adminChatId = String(account.admin_chat_id || '');
  return {
    ...account,
    account_key: String(account.account_key || DEFAULT_ACCOUNT_KEY),
    label: account.label || account.account_key || DEFAULT_ACCOUNT_KEY,
    project_name: account.project_name || account.label || account.account_key || 'Telegram Business',
    owner_user_id: ownerUserId,
    business_owner_id: String(account.business_owner_id || ownerUserId || ''),
    owner_username: account.owner_username || account.username || '',
    owner_first_name: account.owner_first_name || account.first_name || '',
    admin_chat_id: adminChatId,
    business_connection_id: String(account.business_connection_id || ''),
    bot_enabled: account.bot_enabled !== false,
    auto_reply_enabled: account.auto_reply_enabled !== false,
    archive_enabled: account.archive_enabled !== false,
    archive_notify_enabled: account.archive_notify_enabled !== false,
    reports_enabled: account.reports_enabled !== false,
    media_archive_enabled: account.media_archive_enabled !== false,
    media_archive_download: account.media_archive_download ?? MEDIA_ARCHIVE_DOWNLOAD,
    media_archive_max_bytes: Number(account.media_archive_max_bytes || MEDIA_ARCHIVE_MAX_BYTES),
    storage_bucket: account.storage_bucket || SUPABASE_STORAGE_BUCKET,
    flow_key: account.flow_key || 'info_only',
    daily_report_time: account.daily_report_time || '18:00',
    timezone: account.timezone || process.env.TZ || 'Asia/Tashkent'
  };
}

function unknownAccount(businessConnectionId = '') {
  return normalizeAccount({
    account_key: UNKNOWN_ACCOUNT_KEY,
    label: 'Unknown business connection',
    project_name: 'Unknown Telegram Business',
    business_connection_id: businessConnectionId || '',
    admin_chat_id: '',
    bot_enabled: false,
    auto_reply_enabled: false,
    archive_enabled: true,
    archive_notify_enabled: false,
    reports_enabled: false
  });
}

function accountDisplayLabel(accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const ak = accountKey(accountOrKey);
  if (ak === 'second') return process.env.SECOND_ACCOUNT_LABEL || 'Ikkinchi akkaunt';
  if (ak === DEFAULT_ACCOUNT_KEY || ak === LEGACY_DEFAULT_ACCOUNT_KEY) return 'UZLYE';
  return ak;
}

function accountKey(accountOrKey = DEFAULT_ACCOUNT_KEY) {
  if (typeof accountOrKey === 'string') return accountOrKey || DEFAULT_ACCOUNT_KEY;
  return accountOrKey?.account_key || DEFAULT_ACCOUNT_KEY;
}

function settingKey(key, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const ak = accountKey(accountOrKey);
  return ak === DEFAULT_ACCOUNT_KEY ? key : `${ak}:${key}`;
}

// -------------------- Telegram helpers --------------------
async function tg(method, payload = {}) {
  const res = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    console.error('Telegram API error:', method, data);
    const err = new Error(data?.description || `Telegram API error: ${method}`);
    err.telegram = data || { ok: false, error_code: res.status, description: res.statusText };
    throw err;
  }
  return data.result;
}

async function getAccounts() {
  const byKey = new Map(ENV_ACCOUNTS.map(a => [a.account_key, normalizeAccount(a)]));
  const { data, error } = await supabase.from('bot_accounts').select('*');
  if (!error && Array.isArray(data)) {
    for (const row of data) {
      if (!row?.account_key) continue;
      byKey.set(row.account_key, normalizeAccount({ ...byKey.get(row.account_key), ...row }));
    }
  } else if (error && !String(error.message || '').includes('does not exist')) {
    console.error('getAccounts:', error.message);
  }
  if (!byKey.size) byKey.set(DEFAULT_ACCOUNT.account_key, normalizeAccount(DEFAULT_ACCOUNT));
  return [...byKey.values()];
}

async function getAccount(accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const key = accountKey(accountOrKey);
  const accounts = await getAccounts();
  const found = accounts.find(a => a.account_key === key);
  if (found) return found;
  if (accountOrKey && typeof accountOrKey === 'object' && accountOrKey.account_key) return accountOrKey;
  if (key === (process.env.SECOND_ACCOUNT_KEY || 'second')) {
    return {
      account_key: process.env.SECOND_ACCOUNT_KEY || 'second',
      label: process.env.SECOND_ACCOUNT_LABEL || 'Ikkinchi akkaunt',
      owner_user_id: process.env.SECOND_ACCOUNT_BUSINESS_OWNER_ID || '8304283149',
      business_owner_id: process.env.SECOND_ACCOUNT_BUSINESS_OWNER_ID || '8304283149',
      admin_chat_id: process.env.SECOND_ACCOUNT_ADMIN_CHAT_ID || '8304283149',
      business_connection_id: process.env.SECOND_ACCOUNT_BUSINESS_CONNECTION_ID || '',
      project_name: process.env.SECOND_ACCOUNT_PROJECT_NAME || 'Millat Iftixorlari ensiklopediyasi',
      flow_key: process.env.SECOND_ACCOUNT_FLOW_KEY || 'second_info_only',
      archive_enabled: true,
      archive_notify_enabled: true
    };
  }
  if (key === UNKNOWN_ACCOUNT_KEY) return unknownAccount();
  return accounts[0] || normalizeAccount(DEFAULT_ACCOUNT);
}

async function getAdminChatIdForAccount(accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const account = await getAccount(accountOrKey);
  return account.admin_chat_id || (isDefaultAccountKey(account.account_key) ? ADMIN_CHAT_ID : '');
}

async function sendAdminForAccount(accountOrKey, text, extra = {}) {
  const adminChatId = await getAdminChatIdForAccount(accountOrKey);
  if (!adminChatId) return false;
  await tg('sendMessage', { chat_id: adminChatId, text, parse_mode: 'HTML', ...extra });
  return true;
}

async function findBusinessConnectionMapping(businessConnectionId) {
  if (!businessConnectionId) return null;
  const { data, error } = await supabase.from('business_connection_accounts')
    .select('*')
    .eq('business_connection_id', String(businessConnectionId))
    .maybeSingle();
  if (error) {
    if (!String(error.message || '').includes('does not exist')) console.error('findBusinessConnectionMapping:', error.message);
    return null;
  }
  return data || null;
}

function findAccountByUserId(accounts, userId) {
  const uid = String(userId || '');
  if (!uid) return null;
  const found = accounts.find(a => (
    (a.owner_user_id && String(a.owner_user_id) === uid) ||
    (a.business_owner_id && String(a.business_owner_id) === uid) ||
    (a.admin_chat_id && String(a.admin_chat_id) === uid)
  ));
  if (found) return found;
  if (uid === '8304283149') {
    return accounts.find(a => a.account_key === 'second') || {
      account_key: process.env.SECOND_ACCOUNT_KEY || 'second',
      label: process.env.SECOND_ACCOUNT_LABEL || 'Ikkinchi akkaunt',
      business_owner_id: process.env.SECOND_ACCOUNT_BUSINESS_OWNER_ID || '8304283149',
      owner_user_id: process.env.SECOND_ACCOUNT_BUSINESS_OWNER_ID || '8304283149',
      admin_chat_id: process.env.SECOND_ACCOUNT_ADMIN_CHAT_ID || '8304283149',
      business_connection_id: process.env.SECOND_ACCOUNT_BUSINESS_CONNECTION_ID || '',
      project_name: process.env.SECOND_ACCOUNT_PROJECT_NAME || 'Millat Iftixorlari ensiklopediyasi',
      flow_key: process.env.SECOND_ACCOUNT_FLOW_KEY || 'second_info_only',
      archive_enabled: true,
      archive_notify_enabled: true
    };
  }
  return null;
}

async function bindBusinessConnectionToAccount(accountOrKey, businessConnectionId, user = {}) {
  if (!businessConnectionId) return null;
  const account = normalizeAccount(await getAccount(accountOrKey));
  const ownerUserId = user.id ? String(user.id) : (account.owner_user_id || account.business_owner_id || account.admin_chat_id || null);
  const { error: mapError } = await supabase.from('business_connection_accounts').upsert({
    business_connection_id: String(businessConnectionId),
    account_key: account.account_key,
    user_id: ownerUserId,
    username: user.username || null,
    first_name: user.first_name || null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'business_connection_id' });
  if (mapError) {
    if (!String(mapError.message || '').includes('does not exist')) console.error('bindBusinessConnectionToAccount mapping:', mapError.message);
    return account;
  }
  const { error } = await supabase.from('bot_accounts').upsert({
    account_key: account.account_key,
    label: account.label || account.account_key,
    project_name: account.project_name || account.label || account.account_key,
    owner_user_id: account.owner_user_id || ownerUserId,
    owner_username: user.username || account.owner_username || null,
    owner_first_name: user.first_name || account.owner_first_name || null,
    business_owner_id: account.business_owner_id || ownerUserId,
    admin_chat_id: account.admin_chat_id || null,
    business_connection_id: String(businessConnectionId),
    bot_enabled: account.bot_enabled !== false,
    auto_reply_enabled: account.auto_reply_enabled !== false,
    flow_key: account.flow_key || 'info_only',
    archive_enabled: account.archive_enabled !== false,
    archive_notify_enabled: account.archive_notify_enabled !== false,
    reports_enabled: account.reports_enabled !== false,
    media_archive_enabled: account.media_archive_enabled !== false,
    media_archive_download: account.media_archive_download,
    media_archive_max_bytes: account.media_archive_max_bytes,
    storage_bucket: account.storage_bucket || SUPABASE_STORAGE_BUCKET,
    timezone: account.timezone || 'Asia/Tashkent',
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'account_key' });
  if (error) console.error('bindBusinessConnectionToAccount bot_accounts:', error.message);
  return { ...account, business_connection_id: String(businessConnectionId) };
}

const ACCOUNT_MUTABLE_FIELDS = new Set([
  'label',
  'project_name',
  'owner_user_id',
  'owner_username',
  'owner_first_name',
  'admin_chat_id',
  'business_connection_id',
  'flow_key',
  'timezone',
  'daily_report_time',
  'storage_bucket'
]);

const ACCOUNT_BOOLEAN_FIELDS = new Set([
  'bot_enabled',
  'auto_reply_enabled',
  'archive_enabled',
  'archive_notify_enabled',
  'reports_enabled',
  'media_archive_enabled',
  'media_archive_download'
]);

const ACCOUNT_NUMBER_FIELDS = new Set(['media_archive_max_bytes']);

function parseSettingValue(value = '') {
  const raw = String(value).trim();
  const low = raw.toLowerCase();
  if (['true', 'on', '1', 'yes', 'ha'].includes(low)) return true;
  if (['false', 'off', '0', 'no', 'yoq', 'yo‘q'].includes(low)) return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

async function upsertAccountPatch(accountOrKey, patch = {}) {
  const requestedKey = accountKey(accountOrKey);
  const existing = await getAccount(requestedKey);
  const account = normalizeAccount(existing?.account_key === requestedKey ? existing : { account_key: requestedKey, label: requestedKey });
  const payload = {
    account_key: account.account_key,
    label: account.label || account.account_key,
    project_name: account.project_name || account.label || account.account_key,
    business_owner_id: account.business_owner_id || account.owner_user_id || null,
    ...patch,
    updated_at: new Date().toISOString()
  };
  if (payload.owner_user_id && !payload.business_owner_id) payload.business_owner_id = payload.owner_user_id;
  const { data, error } = await supabase.from('bot_accounts').upsert(payload, { onConflict: 'account_key' }).select().maybeSingle();
  if (error) throw error;
  return normalizeAccount(data || { ...account, ...patch });
}

async function setAccountField(accountOrKey, field, rawValue) {
  if (!ACCOUNT_MUTABLE_FIELDS.has(field) && !ACCOUNT_BOOLEAN_FIELDS.has(field) && !ACCOUNT_NUMBER_FIELDS.has(field)) {
    throw new Error(`Ruxsat etilmagan field: ${field}`);
  }
  let value = rawValue;
  if (ACCOUNT_BOOLEAN_FIELDS.has(field)) value = Boolean(parseSettingValue(rawValue));
  if (ACCOUNT_NUMBER_FIELDS.has(field)) value = Number(rawValue);
  return upsertAccountPatch(accountOrKey, { [field]: value });
}

async function handleBusinessConnectionUpdate(connection = {}) {
  const businessConnectionId = connection.id || connection.business_connection_id || '';
  const user = connection.user || {};
  const userId = user.id || connection.user_chat_id || connection.user_id || '';
  if (!businessConnectionId) return;
  const accounts = await getAccounts();
  let account = findAccountByUserId(accounts, userId);
  if (!account) {
    const label = user.username || user.first_name || String(userId || businessConnectionId);
    account = normalizeAccount({
      account_key: userId ? `tg_${userId}` : `tg_${String(businessConnectionId).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40)}`,
      label,
      project_name: label,
      owner_user_id: userId ? String(userId) : '',
      business_owner_id: userId ? String(userId) : '',
      owner_username: user.username || '',
      owner_first_name: user.first_name || '',
      admin_chat_id: userId ? String(userId) : '',
      business_connection_id: businessConnectionId,
      flow_key: 'info_only',
      bot_enabled: true,
      auto_reply_enabled: true,
      archive_enabled: true,
      archive_notify_enabled: true,
      reports_enabled: true
    });
  }
  await bindBusinessConnectionToAccount(account, businessConnectionId, {
    id: userId,
    username: user.username,
    first_name: user.first_name
  });
  if (userId) {
    await tg('sendMessage', {
      chat_id: userId,
      text:
        '✅ Bot akkauntingizga ulandi.\n\n' +
        'Sozlash menyusi:\n' +
        '• Auto javob\n' +
        '• Arxiv\n' +
        '• Hisobotlar\n' +
        '• Shablonlar\n' +
        '• Diagnostika'
    }).catch(err => console.error('business_connection notify:', err.message));
  }
  await logEvent('business_connection', 'business_connection_account_bound', JSON.stringify({
    business_connection_id: businessConnectionId,
    account_key: account.account_key,
    user_id: userId || null
  }), account.account_key);
}

async function findAccountForBusinessMessage(msg) {
  const fromId = String(msg?.from?.id || '');
  const businessConnectionId = String(msg?.business_connection_id || msg?.business_connection?.id || '');
  const chatId = String(msg?.chat?.id || '');
  const accounts = await getAccounts();
  if (businessConnectionId) {
    const mapped = await findBusinessConnectionMapping(businessConnectionId);
    if (mapped?.account_key) {
      const account = accounts.find(a => a.account_key === mapped.account_key);
      if (account) return account;
    }
    const directConnection = accounts.find(a => a.business_connection_id && String(a.business_connection_id) === businessConnectionId);
    if (directConnection) return directConnection;
  }
  const directSender = accounts.find(a => (
    (a.business_owner_id && String(a.business_owner_id) === fromId) ||
    (a.admin_chat_id && String(a.admin_chat_id) === fromId)
  ));
  if (directSender) return directSender;
  if (businessConnectionId) {
    let archiveQ = supabase.from('message_archive')
      .select('account_key')
      .eq('business_connection_id', businessConnectionId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (chatId) archiveQ = archiveQ.eq('chat_id', chatId);
    const { data: archiveRows } = await archiveQ;
    const archiveKey = archiveRows?.[0]?.account_key;
    if (archiveKey) return accounts.find(a => a.account_key === archiveKey) || { ...DEFAULT_ACCOUNT, account_key: archiveKey };

    let q = supabase.from('business_leads')
      .select('account_key')
      .eq('business_connection_id', businessConnectionId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (chatId) q = q.eq('chat_id', chatId);
    const { data } = await q;
    const learnedKey = data?.[0]?.account_key;
    if (learnedKey) return accounts.find(a => a.account_key === learnedKey) || { ...DEFAULT_ACCOUNT, account_key: learnedKey };
    await logEvent(chatId || 'unknown', 'UNMAPPED_BUSINESS_CONNECTION', JSON.stringify({
      business_connection_id: businessConnectionId,
      chat_id: chatId || null,
      from_id: fromId || null
    }).slice(0, 1200), UNKNOWN_ACCOUNT_KEY);
    return unknownAccount(businessConnectionId);
  }
  return normalizeAccount(DEFAULT_ACCOUNT);
}

async function findAccountByBusinessConnectionId(businessConnectionId) {
  if (!businessConnectionId) return null;
  const accounts = await getAccounts();
  const mapped = await findBusinessConnectionMapping(businessConnectionId);
  if (mapped?.account_key) {
    const account = accounts.find(a => a.account_key === mapped.account_key);
    if (account) return account;
  }
  return accounts.find(a => a.business_connection_id && String(a.business_connection_id) === String(businessConnectionId)) || null;
}

async function findArchivedMessage({ businessConnectionId = '', chatId = '', messageId = null, accountKey: ak = null }) {
  if (!chatId || !messageId) return null;
  let q = supabase.from('message_archive')
    .select('*')
    .eq('chat_id', String(chatId))
    .eq('message_id', messageId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (businessConnectionId) q = q.eq('business_connection_id', String(businessConnectionId));
  if (ak) q = q.eq('account_key', ak);
  const { data, error } = await q;
  if (error) {
    console.error('findArchivedMessage:', error.message);
    return null;
  }
  return data?.[0] || null;
}

async function resolveArchiveAccount(update = {}, messageId = null, mode = 'deleted') {
  const businessConnectionId = update.business_connection_id || update.business_connection?.id || '';
  const chatId = String(update.chat?.id || update.chat_id || '');
  const accounts = await getAccounts();

  if (businessConnectionId && chatId && messageId) {
    const archived = await findArchivedMessage({ businessConnectionId, chatId, messageId });
    if (archived?.account_key) {
      const account = accounts.find(a => a.account_key === archived.account_key) || { ...DEFAULT_ACCOUNT, account_key: archived.account_key };
      return { account, archived, reason: 'message_archive_business_connection_chat_message' };
    }
  }

  if (mode === 'edited' && chatId && messageId) {
    const archived = await findArchivedMessage({ chatId, messageId });
    if (archived?.account_key) {
      const account = accounts.find(a => a.account_key === archived.account_key) || { ...DEFAULT_ACCOUNT, account_key: archived.account_key };
      return { account, archived, reason: 'message_archive_chat_message' };
    }
  }

  const direct = await findAccountByBusinessConnectionId(businessConnectionId);
  if (direct) return { account: direct, reason: 'business_connection_id_account_late' };

  if (mode === 'edited') {
    const bySender = accounts.find(a => (
      (a.business_owner_id && update.from?.id && String(a.business_owner_id) === String(update.from.id)) ||
      (a.admin_chat_id && update.from?.id && String(a.admin_chat_id) === String(update.from.id))
    ));
    if (bySender) return { account: bySender, reason: 'from_id_account' };
  }

  await logEvent(chatId || 'unknown', 'archive_account_resolution_failed', JSON.stringify({
    mode,
    business_connection_id: businessConnectionId || null,
    chat_id: chatId || null,
    message_id: messageId || null
  }).slice(0, 1200));
  if (businessConnectionId) {
    await logEvent(chatId || 'unknown', 'UNMAPPED_BUSINESS_CONNECTION', JSON.stringify({
      mode,
      business_connection_id: businessConnectionId,
      chat_id: chatId || null,
      message_id: messageId || null
    }).slice(0, 1200), UNKNOWN_ACCOUNT_KEY);
    return { account: unknownAccount(businessConnectionId), archived: null, reason: 'unknown_business_connection' };
  }
  return { account: normalizeAccount(DEFAULT_ACCOUNT), archived: null, reason: 'fallback_default' };
}

async function rememberAccountBusinessConnection(account, businessConnectionId) {
  if (!businessConnectionId || !account?.account_key) return;
  const { error: mapError } = await supabase.from('business_connection_accounts').upsert({
    business_connection_id: String(businessConnectionId),
    account_key: account.account_key,
    user_id: account.business_owner_id || account.admin_chat_id || null,
    username: null,
    first_name: null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'business_connection_id' });
  if (mapError && !String(mapError.message || '').includes('does not exist')) {
    console.error('rememberAccountBusinessConnection mapping:', mapError.message);
  }
  if (account.business_connection_id && String(account.business_connection_id) === String(businessConnectionId)) return;
  const { error } = await supabase.from('bot_accounts').upsert({
    account_key: account.account_key,
    label: account.label || account.account_key,
    project_name: account.project_name || account.label || account.account_key,
    business_owner_id: account.business_owner_id || null,
    admin_chat_id: account.admin_chat_id || null,
    business_connection_id: String(businessConnectionId),
    flow_key: account.flow_key || 'info_only',
    archive_enabled: account.archive_enabled !== false,
    archive_notify_enabled: account.archive_notify_enabled !== false,
    updated_at: new Date().toISOString()
  }, { onConflict: 'account_key' });
  if (error) console.error('rememberAccountBusinessConnection:', error.message);
}

function isDefaultAccountKey(ak) {
  return !ak || ak === DEFAULT_ACCOUNT_KEY || ak === LEGACY_DEFAULT_ACCOUNT_KEY;
}

function accountLeadFilter(q, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const ak = accountKey(accountOrKey);
  if (isDefaultAccountKey(ak)) return q.or(`account_key.is.null,account_key.eq.${DEFAULT_ACCOUNT_KEY},account_key.eq.${LEGACY_DEFAULT_ACCOUNT_KEY}`);
  return q.eq('account_key', ak);
}

async function sendAdmin(text, extra = {}, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const account = await getAccount(accountOrKey);
  const adminChatId = account.admin_chat_id || ADMIN_CHAT_ID;
  if (!adminChatId) return;
  try {
    await tg('sendMessage', { chat_id: adminChatId, text, parse_mode: 'HTML', ...extra });
  } catch (err) {
    console.error('sendAdmin error:', err.message);
  }
}

async function sendBusinessMessage(lead, text) {
  if (!lead?.business_connection_id) {
    await logEvent(lead?.chat_id || 'unknown', 'send_skipped_no_business_connection', String(text || '').slice(0, 300), lead?.account_key);
    return null;
  }
  await tg('sendMessage', {
    chat_id: lead.chat_id,
    business_connection_id: lead.business_connection_id,
    text
  });
  await updateLead(lead.chat_id, { last_bot_message: text, last_message_at: new Date().toISOString() }, lead.account_key);
  return true;
}

async function answerCallback(callbackQueryId, text = '') {
  try { await tg('answerCallbackQuery', { callback_query_id: callbackQueryId, text }); } catch {}
}

// -------------------- DB helpers --------------------
async function logEvent(chatId, eventType, message = '', accountOrKey = null) {
  const { error } = await supabase.from('lead_events').insert({
    chat_id: String(chatId),
    account_key: accountOrKey ? accountKey(accountOrKey) : null,
    event_type: eventType,
    message: String(message || '').slice(0, 1500)
  });
  if (error) console.error('logEvent:', error.message);
}

async function logIgnore(chatId, reason, message = '', accountOrKey = null) {
  await logEvent(chatId, reason, String(message || '').slice(0, 500), accountOrKey);
}

async function getLastIgnoreReason(chatId = null, accountOrKey = null) {
  let q = supabase.from('lead_events')
    .select('chat_id,event_type,message,created_at')
    .in('event_type', IGNORE_REASONS)
    .order('created_at', { ascending: false })
    .limit(1);
  if (chatId) q = q.eq('chat_id', String(chatId));
  if (accountOrKey) q = accountLeadFilter(q, accountOrKey);
  const { data, error } = await q;
  if (error) {
    console.error('getLastIgnoreReason:', error.message);
    return null;
  }
  return data?.[0] || null;
}

async function getLead(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  let q = supabase.from('business_leads').select('*').eq('chat_id', String(chatId));
  q = accountLeadFilter(q, accountOrKey);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error('getLead:', error.message);
    return null;
  }
  return data || null;
}

async function createLead({ chatId, businessConnectionId, from, text, stage = STAGE.NEW, status = 'active', botEnabled = true, accountKey = DEFAULT_ACCOUNT_KEY }) {
  const payload = {
    chat_id: String(chatId),
    account_key: accountKey,
    business_connection_id: businessConnectionId || null,
    first_name: from?.first_name || null,
    username: from?.username || null,
    status,
    stage,
    bot_enabled: botEnabled,
    last_user_message: text || '',
    last_message_at: new Date().toISOString(),
    stage_started_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase.from('business_leads').insert(payload).select().single();
  if (error) {
    console.error('createLead:', error.message);
    return null;
  }
  await logEvent(chatId, `lead_created_${stage}`, text || '', accountKey);
  return data;
}

async function updateLead(chatId, patch, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const changedStage = Object.prototype.hasOwnProperty.call(patch, 'stage');
  const payload = { ...patch, updated_at: new Date().toISOString() };
  if (changedStage) payload.stage_started_at = new Date().toISOString();
  let q = supabase.from('business_leads').update(payload).eq('chat_id', String(chatId));
  q = accountLeadFilter(q, accountOrKey);
  const { data, error } = await q.select().maybeSingle();
  if (error) console.error('updateLead:', error.message);
  return data;
}

async function upsertLeadBase({ chatId, businessConnectionId, from, text, accountKey = DEFAULT_ACCOUNT_KEY }) {
  const existing = await getLead(chatId, accountKey);
  if (existing) {
    return updateLead(chatId, {
      account_key: existing.account_key || accountKey,
      business_connection_id: businessConnectionId || existing.business_connection_id,
      first_name: from?.first_name || existing.first_name,
      username: from?.username || existing.username,
      last_user_message: text || existing.last_user_message,
      last_message_at: new Date().toISOString()
    }, accountKey);
  }
  return createLead({ chatId, businessConnectionId, from, text, stage: STAGE.NEW, accountKey });
}

async function markProcessed(messageKey, chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const { error } = await supabase.from('processed_messages').insert({
    message_key: messageKey,
    chat_id: String(chatId),
    account_key: accountKey(accountOrKey)
  });
  if (!error) return true;
  if (error.code === '23505') return false;
  console.error('markProcessed:', error.message);
  return true;
}

async function reserveAction(chatId, stage, actionName, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const ak = accountKey(accountOrKey);
  const actionKey = `${ak}:${chatId}:${stage}:${actionName}`;
  const { error } = await supabase.from('sent_actions').insert({
    action_key: actionKey,
    chat_id: String(chatId),
    account_key: ak,
    action_name: actionName,
    stage
  });
  if (!error) return true;
  if (error.code === '23505') return false;
  console.error('reserveAction:', error.message);
  return true;
}

function accountTemplateKey(accountOrKey, key) {
  const ak = accountKey(accountOrKey);
  return `${ak}:${key}`;
}

async function getTemplate(key, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const ak = accountKey(accountOrKey);
  const scoped = await supabase.from('reply_templates')
    .select('body')
    .eq('key', accountTemplateKey(ak, key))
    .eq('account_key', ak)
    .maybeSingle();
  if (!scoped.error && scoped.data?.body) return scoped.data.body;
  if (scoped.error) console.error('getTemplate scoped:', key, scoped.error.message);

  const { data, error } = await supabase.from('reply_templates').select('body').eq('key', key).maybeSingle();
  if (error) {
    console.error('getTemplate:', key, error.message);
    return null;
  }
  return data?.body || null;
}

async function setTemplate(key, body, accountOrKey = null) {
  const ak = accountOrKey ? accountKey(accountOrKey) : null;
  const storageKey = ak ? accountTemplateKey(ak, key) : key;
  const { error } = await supabase.from('reply_templates').upsert({
    key: storageKey,
    account_key: ak,
    title: key,
    body,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

async function getFlowSteps(accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const account = await getAccount(accountOrKey);
  let q = supabase.from('account_flow_steps')
    .select('*')
    .eq('account_key', account.account_key)
    .eq('flow_key', account.flow_key || 'info_only')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  const { data, error } = await q;
  if (error) {
    console.error('getFlowSteps:', error.message);
    return [];
  }
  return data || [];
}

async function getFlowStep(accountOrKey, stepKey) {
  const steps = await getFlowSteps(accountOrKey);
  return steps.find(s => s.step_key === stepKey) || null;
}

async function flowTemplateKeys(accountOrKey, stepKey, fallbackKeys) {
  const step = await getFlowStep(accountOrKey, stepKey);
  if (!step?.template_key) return fallbackKeys;
  return String(step.template_key).split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
}

async function upsertFlowStep({ accountKey: ak, stepKey, templateKey, nextYes, nextNo, nextPartial, nextUnknown, stopAfterSend }) {
  const account = await getAccount(ak);
  const { error } = await supabase.from('account_flow_steps').upsert({
    account_key: account.account_key,
    flow_key: account.flow_key || 'info_only',
    step_key: stepKey,
    template_key: templateKey,
    next_step_yes: nextYes || null,
    next_step_no: nextNo || null,
    next_step_partial: nextPartial || null,
    next_step_unknown: nextUnknown || null,
    stop_after_send: String(stopAfterSend) === 'true',
    is_active: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'account_key,flow_key,step_key' });
  if (error) throw error;
}

async function getAccountAiEnabled(accountOrKey = DEFAULT_ACCOUNT_KEY) {
  if (!AI_INTENT_ENABLED || !OPENAI_API_KEY) return false;
  const value = await getSetting(settingKey('ai_intent_enabled', accountOrKey), null);
  return value === null ? true : Boolean(value?.enabled ?? value);
}

async function setAccountAiEnabled(accountOrKey = DEFAULT_ACCOUNT_KEY, enabled = true) {
  await setSetting(settingKey('ai_intent_enabled', accountOrKey), { enabled: Boolean(enabled), updated_at: Date.now() });
}

async function callOpenAIJson(messages, temperature = 0.1) {
  if (!OPENAI_API_KEY) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature,
        response_format: { type: 'json_object' },
        messages
      })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
    const content = data?.choices?.[0]?.message?.content || '{}';
    return JSON.parse(content);
  } catch (err) {
    console.error('callOpenAIJson:', err.message);
    return null;
  }
}

async function improveTemplateWithAI({ accountKey: ak, templateKey, roughText }) {
  if (!AI_TEMPLATE_EDITOR_ENABLED || !OPENAI_API_KEY) return null;
  return callOpenAIJson([
    {
      role: 'system',
      content: 'You edit Uzbek Telegram business bot templates. Return strict JSON: {"text":"..."}. Preserve meaning. Fix spelling, punctuation, natural Uzbek style, and clarity. Do not invent false claims. Do not change price unless user explicitly wrote a new price. Do not add aggressive spammy wording.'
    },
    {
      role: 'user',
      content: JSON.stringify({ account_key: ak, template_key: templateKey, rough_text: roughText })
    }
  ], 0.2);
}

async function saveAiDecision({ accountKey: ak, chatId, stage, userText, decision }) {
  const payload = {
    account_key: ak,
    chat_id: String(chatId),
    stage,
    step_key: stage,
    user_text: userText,
    intent: decision?.intent || 'unclear',
    confidence: Number(decision?.confidence || 0),
    next_step: decision?.next_step || null,
    template_key: decision?.template_key || null,
    should_stop: Boolean(decision?.should_stop),
    reason: decision?.reason || '',
    raw_json: decision || {},
    created_at: new Date().toISOString()
  };
  const { error } = await supabase.from('ai_decisions').insert(payload);
  if (error) console.error('saveAiDecision:', error.message);
}

async function classifyWithAI(lead, userText, ruleIntent) {
  if (!(await getAccountAiEnabled(lead.account_key))) return null;
  const steps = await getFlowSteps(lead.account_key);
  const decision = await callOpenAIJson([
    {
      role: 'system',
      content: 'Classify Telegram customer replies for an info-only business bot. Never write a reply to the customer. Return strict JSON only with keys: intent, confidence, next_step, template_key, should_stop, reason. Allowed intents: confirm,reject,has_info,needs_info,thanks,interested,price_question,info_request,unclear,stop,complaint,payment_ready,other.'
    },
    {
      role: 'user',
      content: JSON.stringify({
        account_key: lead.account_key,
        stage: lead.stage,
        last_bot_message: lead.last_bot_message || '',
        last_admin_message: lead.last_admin_message || '',
        customer_message: userText,
        rule_intent: ruleIntent,
        flow_steps: steps.map(s => ({
          step_key: s.step_key,
          template_key: s.template_key,
          next_step_yes: s.next_step_yes,
          next_step_no: s.next_step_no,
          next_step_partial: s.next_step_partial,
          next_step_unknown: s.next_step_unknown,
          stop_after_send: s.stop_after_send
        }))
      })
    }
  ], 0);
  if (!decision) return null;
  await saveAiDecision({ accountKey: lead.account_key, chatId: lead.chat_id, stage: lead.stage, userText, decision });
  return decision;
}

function mapAiIntentToRuleIntent(decision, stage, fallbackIntent) {
  if (!decision || Number(decision.confidence || 0) < 0.65) return fallbackIntent;
  const intent = String(decision.intent || '');
  if (['stop', 'reject', 'complaint'].includes(intent)) return 'hard_reject';
  if (intent === 'price_question' || intent === 'payment_ready') return 'payment_near';
  if (stage === STAGE.ASKED_APPLICATION) {
    if (['confirm', 'thanks', 'interested'].includes(intent)) return 'application_confirmed';
    if (intent === 'info_request') return 'application_not_submitted';
  }
  if (stage === STAGE.ASKED_INFO) {
    if (['confirm', 'has_info', 'thanks', 'interested'].includes(intent)) return 'has_info';
    if (['needs_info', 'info_request'].includes(intent)) return 'no_info';
  }
  if (intent === 'thanks' || intent === 'interested') return 'read_offer';
  return fallbackIntent;
}

function renderTemplate(body = '') {
  return String(body || '').replaceAll('{APPLICATION_LINK}', APPLICATION_LINK);
}

async function sendTemplate(lead, templateKey) {
  const body = await getTemplate(templateKey, lead.account_key);
  if (!body) {
    await sendAdmin(`⚠️ Template topilmadi: <b>${templateKey}</b>`, {}, lead.account_key);
    await logEvent(lead.chat_id, 'missing_template', templateKey, lead.account_key);
    return false;
  }
  const text = renderTemplate(body);
  await sendBusinessMessage(lead, text);
  await logEvent(lead.chat_id, `sent_${templateKey}`, text.slice(0, 300), lead.account_key);
  return true;
}

async function sendPackage(lead, actionName, templateKeys, nextPatch = {}) {
  const reserved = await reserveAction(lead.chat_id, lead.stage, actionName, lead.account_key);
  if (!reserved) {
    await logEvent(lead.chat_id, `duplicate_action_skipped_${actionName}`, '', lead.account_key);
    return lead;
  }
  let currentLead = lead;
  for (const key of templateKeys) {
    await sendTemplate(currentLead, key);
    await sleep(350);
  }
  if (Object.keys(nextPatch).length) {
    currentLead = await updateLead(lead.chat_id, nextPatch, lead.account_key) || currentLead;
  }
  return currentLead;
}

async function finishAfterInfo(lead) {
  const updated = await updateLead(lead.chat_id, {
    stage: STAGE.INFO_SENT_FINISHED,
    status: 'info_sent',
    bot_enabled: false,
    finished_at: new Date().toISOString()
  }, lead.account_key);
  await sendAdmin(
    `✅ <b>Info-only yakunlandi</b>\n\n` +
    `Ism: ${html(lead.first_name || '-')}\n` +
    `Username: ${lead.username ? '@' + html(lead.username) : '-'}\n` +
    `Chat ID: <code>${lead.chat_id}</code>\n\n` +
    `Bot ma’lumot va oferta xabarini yubordi. Endi chatni qo‘lda davom ettiring.`,
    {},
    lead.account_key
  );
  return updated || lead;
}


async function resetMeChat({ chatId, businessConnectionId = null, from = null, accountKey = DEFAULT_ACCOUNT_KEY }) {
  const id = String(chatId);

  // Faqat shu chatning test holatini tozalaydi. Boshqa lidlarga tegmaydi.
  // business_leads yozuvini o‘chirmaymiz, chunki business_connection_id kerak bo‘lib qoladi.
  await accountLeadFilter(supabase.from('sent_actions').delete().eq('chat_id', id), accountKey);
  await accountLeadFilter(supabase.from('processed_messages').delete().eq('chat_id', id), accountKey);
  await accountLeadFilter(supabase.from('lead_events').delete().eq('chat_id', id), accountKey);

  const existing = await getLead(id, accountKey);
  const patch = {
    account_key: accountKey,
    business_connection_id: businessConnectionId || existing?.business_connection_id || null,
    first_name: from?.first_name || existing?.first_name || null,
    username: from?.username || existing?.username || null,
    status: 'active',
    stage: STAGE.OUTREACH_SENT,
    bot_enabled: true,
    outreach_sent: true,
    outreach_session_id: `resetme_${Date.now()}`,
    outreach_message: '/resetme test reset',
    outreach_at: new Date().toISOString(),
    last_user_message: '',
    last_bot_message: '',
    last_admin_message: existing?.last_admin_message || '',
    last_message_at: new Date().toISOString(),
    finished_at: null
  };

  if (existing) {
    await updateLead(id, patch, accountKey);
  } else {
    await createLead({ chatId: id, businessConnectionId, from, text: '', stage: STAGE.OUTREACH_SENT, status: 'active', botEnabled: true, accountKey });
    await updateLead(id, patch, accountKey);
  }

  await logEvent(id, 'resetme', 'Test profil reset qilindi', accountKey);
}

async function stopLead(lead, reason = 'stopped') {
  await updateLead(lead.chat_id, {
    stage: STAGE.DISABLED,
    status: reason,
    bot_enabled: false,
    finished_at: new Date().toISOString()
  }, lead.account_key);
  await logEvent(lead.chat_id, reason, 'bot stopped', lead.account_key);
}

// -------------------- Settings / outreach --------------------
async function getSetting(key, fallback = null) {
  const { data, error } = await supabase.from('bot_settings').select('value').eq('key', key).maybeSingle();
  if (error) {
    console.error('getSetting:', error.message);
    return fallback;
  }
  return data?.value ?? fallback;
}

async function setSetting(key, value) {
  const { error } = await supabase.from('bot_settings').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) console.error('setSetting:', error.message);
}

async function getAutoOutreach(accountOrKey = DEFAULT_ACCOUNT_KEY) {
  return getSetting(settingKey('auto_outreach', accountOrKey), { enabled: false });
}

async function enableAutoOutreach(hours, source = 'manual', accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const ak = accountKey(accountOrKey);
  const now = Date.now();
  const until = now + hours * 60 * 60 * 1000;
  const sessionId = `outreach_${ak}_${localDateKey()}_${now}`;
  const value = {
    enabled: true,
    account_key: ak,
    until,
    session_id: sessionId,
    started_at: now,
    hours,
    source,
    report_sent: false,
    no_outreach_warn_sent: false
  };
  await setSetting(settingKey('auto_outreach', ak), value);
  await logEvent('system', 'auto_outreach_enabled', JSON.stringify(value), ak);
  return value;
}

async function disableAutoOutreach(reportSent = false, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const ak = accountKey(accountOrKey);
  await setSetting(settingKey('auto_outreach', ak), { enabled: false, account_key: ak, disabled_at: Date.now(), report_sent: reportSent });
}

function isAutoActive(auto) {
  return Boolean(auto?.enabled && Number(auto.until || 0) > Date.now());
}

function hasActiveOutreachSession(lead, auto) {
  return Boolean(isAutoActive(auto) && lead?.outreach_sent && lead?.outreach_session_id && lead.outreach_session_id === auto.session_id);
}

function looksLikeOutreachGreeting(text = '') {
  const t = normalize(text);
  if (!t) return false;
  if (!t.includes('assalomu') && !t.includes('assalom') && !t.includes('salom')) return false;
  if (t.includes('maqola tayyor') || t.includes('chek') || t.includes('karta') || t.includes('tolov') || t.includes('to‘lov')) return false;
  return t.includes('yaxshimisiz') || t.includes('qalaysiz') || t.includes('yaxshilarmi') || t.length < 110;
}

async function markOutreach({ chatId, businessConnectionId, from, text, accountKey = DEFAULT_ACCOUNT_KEY }) {
  const auto = await getAutoOutreach(accountKey);
  if (!isAutoActive(auto)) return;
  if (OUTREACH_GREETING_REQUIRED && !looksLikeOutreachGreeting(text)) return;

  const existing = await getLead(chatId, accountKey);
  const patch = {
    account_key: accountKey,
    business_connection_id: businessConnectionId || existing?.business_connection_id || null,
    first_name: existing?.first_name || from?.first_name || null,
    username: existing?.username || from?.username || null,
    status: 'active',
    stage: STAGE.OUTREACH_SENT,
    bot_enabled: true,
    outreach_sent: true,
    outreach_session_id: auto.session_id,
    outreach_message: text,
    outreach_at: new Date().toISOString(),
    last_admin_message: text,
    last_message_at: new Date().toISOString()
  };

  if (existing) {
    if (STOP_REPLY_STAGES.has(existing.stage) || existing.status === 'disabled') return;
    await updateLead(chatId, patch, accountKey);
  } else {
    await createLead({ chatId, businessConnectionId, from, text, stage: STAGE.OUTREACH_SENT, status: 'active', botEnabled: true, accountKey });
    await updateLead(chatId, patch, accountKey);
  }
  await logEvent(chatId, 'outreach_sent_detected', text, accountKey);
}

function detectAdminPromptStage(text = '') {
  const t = normalize(text);
  const plain = t.replace(/'/g, '');
  if (!t) return null;

  // Admin mijozga o‘zi shu savolni yuborgan bo‘lsa, keyingi mijoz javobini shu bosqichdan davom ettiramiz.
  const asksApplication =
    (t.includes('ariza') && (t.includes('qoldirgansiz') || t.includes('qoldirgan') || t.includes('qoldirdingiz')) && (t.includes('shunaqami') || t.includes('shundaymi') || t.includes('togri') || t.includes("to'g'ri") || t.includes('to‘g‘ri')))
    || (plain.includes('ozbekiston lider yoshlari ensiklopediyasi') && t.includes('ariza'));
  if (asksApplication) return STAGE.ASKED_APPLICATION;

  const asksInfo =
    (t.includes('foydali jihat') && (t.includes('malumot') || t.includes("ma'lumot") || t.includes('ma’lumot')) && (t.includes('egamisiz') || t.includes('xabardormisiz') || t.includes('bilasizmi')))
    || ((t.includes('ensiklopediyamiz') || t.includes('ensiklopediya')) && (t.includes('foydali') || t.includes('batafsil')) && (t.includes('egamisiz') || t.includes('bilasizmi')));
  if (asksInfo) return STAGE.ASKED_INFO;

  // Agar admin oferta/matnni o‘zi yuborgan bo‘lsa, bot bu chatda yana avtomatik aralashmaydi.
  const looksLikeOffer = t.includes('men yakuniy shartlarga roziman') || (t.includes('oferta') && t.includes('tanish'));
  if (looksLikeOffer) return STAGE.INFO_SENT_FINISHED;

  return null;
}

async function syncAdminContext({ chatId, businessConnectionId, from, text, accountKey = DEFAULT_ACCOUNT_KEY }) {
  const existing = await getLead(chatId, accountKey);
  const detectedStage = detectAdminPromptStage(text);
  const basePatch = {
    account_key: accountKey,
    business_connection_id: businessConnectionId || existing?.business_connection_id || null,
    first_name: existing?.first_name || from?.first_name || null,
    username: existing?.username || from?.username || null,
    last_admin_message: text || '[media]',
    last_message_at: new Date().toISOString()
  };

  if (!detectedStage) {
    if (existing) await updateLead(chatId, basePatch, accountKey);
    else await createLead({ chatId, businessConnectionId, from, text, stage: STAGE.NEW, status: 'active', botEnabled: false, accountKey });
    await logEvent(chatId, 'admin_context_saved', text || '[media]', accountKey);
    return;
  }

  const patch = {
    ...basePatch,
    stage: detectedStage,
    status: detectedStage === STAGE.INFO_SENT_FINISHED ? 'info_sent' : 'active',
    bot_enabled: detectedStage !== STAGE.INFO_SENT_FINISHED,
    outreach_sent: true,
    outreach_session_id: existing?.outreach_session_id || `admin_context_${localDateKey()}_${Date.now()}`,
    outreach_message: text || '[admin prompt]',
    outreach_at: existing?.outreach_at || new Date().toISOString(),
    finished_at: detectedStage === STAGE.INFO_SENT_FINISHED ? (existing?.finished_at || new Date().toISOString()) : null
  };

  if (existing) await updateLead(chatId, patch, accountKey);
  else {
    await createLead({ chatId, businessConnectionId, from, text, stage: detectedStage, status: patch.status, botEnabled: patch.bot_enabled, accountKey });
    await updateLead(chatId, patch, accountKey);
  }
  await logEvent(chatId, `admin_context_stage_${detectedStage}`, text || '[media]', accountKey);
}

function strongUserApplicationAnswer(text = '') {
  const t = normalize(text);
  if (!t) return null;
  if (includesAny(t, ['ha', 'xa', 'ha shunday', 'xa shunday', 'shunday', 'togri', "to'g'ri", 'to‘g‘ri', 'ariza qoldirdim', 'qoldirdim', 'qoldirgandim', 'ha qoldirgandim', 'instagramda', 'instagramda qoldirgandim', 'yozgandim', 'dostim aytdi', "do'stim aytdi", 'do‘stim aytdi'])) {
    return 'application_confirmed';
  }
  if (includesAny(t, ['ariza qoldirmadim', 'qoldirmadim', 'qoldirmaganman', 'hali qoldirmadim', 'qanday qoshil', "qanday qo'shil", 'qanday qo‘shil', 'qoshilsam', "qo'shilsam", 'qo‘shilsam', 'link yubor', 'havola yubor', 'ariza qayer'])) {
    return 'application_not_submitted';
  }
  return null;
}

async function tryResumeFromContext(lead, text) {
  if (!CONTEXT_RESUME_ENABLED || !lead) return { handled: false, lead };
  const lastAdminStage = detectAdminPromptStage(lead.last_admin_message || '');
  let assumedStage = lastAdminStage;
  let reason = lastAdminStage ? 'last_admin_message' : '';
  let forcedIntent = null;

  if (assumedStage === STAGE.ASKED_APPLICATION && CONTEXT_RESUME_FROM_USER_CONFIRM) {
    forcedIntent = strongUserApplicationAnswer(text);
  }

  if (!assumedStage) return { handled: false, lead };

  let current = await updateLead(lead.chat_id, {
    stage: assumedStage,
    status: assumedStage === STAGE.INFO_SENT_FINISHED ? 'info_sent' : 'active',
    bot_enabled: assumedStage !== STAGE.INFO_SENT_FINISHED,
    outreach_sent: true,
    outreach_session_id: lead.outreach_session_id || `context_resume_${localDateKey()}_${Date.now()}`,
    outreach_message: lead.last_admin_message || '[context resume]',
    outreach_at: lead.outreach_at || new Date().toISOString(),
    finished_at: assumedStage === STAGE.INFO_SENT_FINISHED ? (lead.finished_at || new Date().toISOString()) : null
  }, lead.account_key) || lead;

  await logEvent(lead.chat_id, `context_resume_${assumedStage}_${reason}`, text || '', lead.account_key);

  if (assumedStage === STAGE.INFO_SENT_FINISHED) {
    await handlePostFinishSignal(current, {}, text);
    return { handled: true, lead: current };
  }

  if (assumedStage === STAGE.ASKED_APPLICATION) {
    const intent = forcedIntent || classify(text, STAGE.ASKED_APPLICATION);
    if (intent === 'application_confirmed' || intent === 'application_submitted') {
      const keys = await flowTemplateKeys(current.account_key, 'ask_info', ['ask_info']);
      current = await sendPackage(current, 'ask_info_context_resume', keys, { stage: STAGE.ASKED_INFO, status: 'active', bot_enabled: true }) || current;
      return { handled: true, lead: current };
    }
    if (intent === 'application_not_submitted') {
      const keys = await flowTemplateKeys(current.account_key, 'application_link', ['application_link_reply']);
      current = await sendPackage(current, 'application_link_context_resume', keys, {
        stage: STAGE.INFO_SENT_FINISHED,
        status: 'application_link_sent',
        bot_enabled: false,
        finished_at: new Date().toISOString()
      }) || current;
      await sendAdmin(`🔗 <b>Ariza havolasi yuborildi</b>
Chat ID: <code>${current.chat_id}</code>
Context resume orqali.`, {}, current.account_key);
      return { handled: true, lead: current };
    }
    return { handled: false, lead: current };
  }

  if (assumedStage === STAGE.ASKED_INFO) {
    const intent = classify(text, STAGE.ASKED_INFO);
    if (intent === 'has_info') {
      const keys = await flowTemplateKeys(current.account_key, 'has_info', ['known_info_preface', 'short_intro', 'offer_end']);
      const after = await sendPackage(current, 'known_info_context_resume', keys, {});
      await finishAfterInfo(after || current);
      return { handled: true, lead: after || current };
    }
    if (intent === 'no_info' || intent === 'payment_near' || intent === 'read_offer') {
      const keys = await flowTemplateKeys(current.account_key, 'no_info', ['unknown_info_preface', 'full_intro', 'offer_end']);
      const after = await sendPackage(current, 'unknown_info_context_resume', keys, {});
      await finishAfterInfo(after || current);
      return { handled: true, lead: after || current };
    }
    await updateLead(current.chat_id, { status: 'needs_admin', bot_enabled: false }, current.account_key);
    await logEvent(current.chat_id, 'context_resume_info_unclear_human_needed', text, current.account_key);
    return { handled: true, lead: current };
  }

  return { handled: false, lead: current };
}

// -------------------- Daily scheduler --------------------
function localNow() {
  return new Date(Date.now() + LOCAL_UTC_OFFSET_HOURS * 3600000);
}

function localDateKey(d = localNow()) {
  return d.toISOString().slice(0, 10);
}

function localHHMM(d = localNow()) {
  return d.toISOString().slice(11, 16);
}

function minutesOf(hhmm = '07:00') {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function localMinuteNow() {
  const d = localNow();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

async function getDailyAuto(accountOrKey = DEFAULT_ACCOUNT_KEY) {
  return getSetting(settingKey('daily_auto', accountOrKey), {
    enabled: false,
    start_time: DAILY_DEFAULT_START,
    duration_hours: DAILY_DEFAULT_DURATION_HOURS,
    skip_date: null,
    last_started_date: null
  });
}

async function setDailyAuto(value, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const ak = accountKey(accountOrKey);
  const current = await getDailyAuto(ak);
  const next = { ...current, ...value, updated_at: Date.now() };
  await setSetting(settingKey('daily_auto', ak), { ...next, account_key: ak });
  return next;
}

async function runSchedulerTick(source = 'interval') {
  if (schedulerBusy) return;
  schedulerBusy = true;
  try {
    const accounts = await getAccounts();
    for (const account of accounts) {
      await maybeStartDailyAuto(account.account_key);
      await maybeWarnNoOutreach(account.account_key);
      await maybeFinishAutoReport(account.account_key);
      await maybeSendScheduledDailyReport(account);
    }
  } catch (err) {
    console.error('scheduler tick error:', err);
    await logEvent('system', 'scheduler_error', err.message || String(err));
  } finally {
    schedulerBusy = false;
  }
}

async function maybeSendScheduledDailyReport(account) {
  const normalized = normalizeAccount(account);
  if (normalized.account_key === UNKNOWN_ACCOUNT_KEY || normalized.reports_enabled === false) return;
  const adminChatId = await getAdminChatIdForAccount(normalized.account_key);
  if (!adminChatId) return;
  const reportTime = normalized.daily_report_time || '18:00';
  const nowMin = localMinuteNow();
  const reportMin = minutesOf(reportTime);
  if (nowMin < reportMin || nowMin > reportMin + 10) return;
  const today = localDateKey();
  const stateKey = settingKey('daily_report_state', normalized.account_key);
  const state = await getSetting(stateKey, {});
  if (state?.last_sent_date === today) return;
  await sendArchiveReport(adminChatId, normalized.account_key, '📊 Kunlik hisobot');
  await setSetting(stateKey, { last_sent_date: today, sent_at: Date.now(), account_key: normalized.account_key });
}

async function maybeStartDailyAuto(accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const ak = accountKey(accountOrKey);
  const daily = await getDailyAuto(ak);
  if (!daily?.enabled) return;
  const today = localDateKey();
  if (daily.skip_date === today) return;
  if (daily.last_started_date === today) return;

  const nowMin = localMinuteNow();
  const startMin = minutesOf(daily.start_time || DAILY_DEFAULT_START);
  if (nowMin < startMin || nowMin > startMin + 10) return;

  const hours = Number(daily.duration_hours || DAILY_DEFAULT_DURATION_HOURS);
  const auto = await enableAutoOutreach(hours, 'daily', ak);
  await setDailyAuto({ last_started_date: today }, ak);
  await sendAdmin(
    `📣 <b>Kunlik Auto Outreach yoqildi</b>\n\n` +
    `Start: ${html(daily.start_time || DAILY_DEFAULT_START)}\n` +
    `Davomiylik: ${hours} soat\n` +
    `Tugash: ${new Date(auto.until).toLocaleString('uz-UZ')}\n\n` +
    `Telegram scheduled xabarlaringiz yuborilsa, bot faqat o‘sha outreach chatlarga javob beradi.`,
    {},
    ak
  );
}

async function maybeWarnNoOutreach(accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const ak = accountKey(accountOrKey);
  const auto = await getAutoOutreach(ak);
  if (!isAutoActive(auto) || auto.no_outreach_warn_sent) return;
  const startedAt = Number(auto.started_at || 0);
  if (!startedAt || Date.now() - startedAt < DAILY_NO_OUTREACH_WARN_MIN * 60000) return;
  const count = await countLeads(q => q.eq('outreach_session_id', auto.session_id), ak);
  if (count > 0) return;
  await sendAdmin(
    `⚠️ <b>Outreach aniqlanmadi</b>\n\n` +
    `${DAILY_NO_OUTREACH_WARN_MIN} daqiqa bo‘ldi, lekin bugungi outreach xabarlari ko‘rinmadi. ` +
    `Telegram scheduled xabarlar yuborilganini tekshiring.`,
    {},
    ak
  );
  await setSetting(settingKey('auto_outreach', ak), { ...auto, no_outreach_warn_sent: true });
}

async function maybeFinishAutoReport(accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const ak = accountKey(accountOrKey);
  const auto = await getAutoOutreach(ak);
  if (!auto?.enabled) return;
  if (Number(auto.until || 0) > Date.now()) return;
  if (auto.report_sent) return;
  const account = await getAccount(ak);
  await sendAutoSessionReport(account.admin_chat_id || ADMIN_CHAT_ID, auto, true, ak);
  await setSetting(settingKey('auto_outreach', ak), { ...auto, enabled: false, report_sent: true, disabled_at: Date.now() });
}

// -------------------- Classifier --------------------
function normalize(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[ў]/g, "o'")
    .replace(/[ғ]/g, 'g')
    .replace(/[қ]/g, 'q')
    .replace(/[ҳ]/g, 'h')
    .replace(/[.,!?！？:;()\[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(t, arr) {
  return arr.some(x => t.includes(x));
}

function classify(text = '', stage = STAGE.NEW) {
  const t = normalize(text);
  const hardReject = ['kerak emas', 'kerakmas', 'qiziq emas', 'yozmang', 'bezovta qilmang', 'stop', 'rad qilaman', 'xohlamayman'];
  if (includesAny(t, hardReject)) return 'hard_reject';

  const later = ['keyinroq', 'hozir band', 'bandman', 'birozdan keyin', 'keyin yozaman', 'vaqtim yoq', "vaqtim yo'q"];
  if (includesAny(t, later)) return 'later';

  const readWords = ['tanishdim', 'oqidim', "o'qidim", 'o‘qidim', 'korib chiqdim', "ko'rib chiqdim", 'ko‘rib chiqdim', 'maqul', "ma'qul", 'ma’qul'];
  if (includesAny(t, readWords)) return 'read_offer';

  const paymentWords = ['karta', 'tolov', 'to‘lov', "to'lov", 'pul', 'qayerga tolay', 'qayerga to‘lay', 'to‘layman', "to'layman", 'kartaga'];
  if (includesAny(t, paymentWords)) return 'payment_near';

  const applicationLink = [
    'yoq', "yo'q", 'qoldirmagan', 'qoldirmadim', 'ariza qoldirmadim', 'hali qoldirmadim',
    'qanday qoshil', "qanday qo'shil", 'qanday qo‘shil', 'qoshilsam', "qo'shilsam", 'qo‘shilsam',
    'qanday ariza', 'ariza qayer', 'link yubor', 'havola yubor', 'qayerdan qoldir'
  ];
  if (stage === STAGE.ASKED_APPLICATION && includesAny(t, applicationLink)) return 'application_not_submitted';

  const submitted = ['ariza qoldirdim', 'qoldirdim', 'yubordim', 'toldirdim', "to'ldirdim", 'to‘ldirdim'];
  if (includesAny(t, submitted)) return 'application_submitted';

  const yes = ['ha', 'xa', 'haa', 'ha shunday', 'shunday', 'albatta', 'togri', "to'g'ri", 'to‘g‘ri', 'instagramda', 'yozgandim', 'dostim aytdi', "do'stim aytdi", 'do‘stim aytdi', 'qoldirgandim'];
  if (stage === STAGE.ASKED_APPLICATION && includesAny(t, yes)) return 'application_confirmed';

  const noInfo = ['yoq', "yo'q", 'bilmayman', 'malumotga ega emas', "ma'lumotga ega emas", 'ma’lumotga ega emas', 'xabardor emas', 'tushuntiring', 'malumot bering', "ma'lumot bering", 'ma’lumot bering', 'qanaqa loyiha', 'batafsil ayting'];
  if (stage === STAGE.ASKED_INFO && includesAny(t, noInfo)) return 'no_info';

  const partial = ['biroz', 'ozgina', 'sal pal', 'sal-pal', 'qisman', 'uncha emas', 'korganman', "ko'rganman", 'ko‘rganman', 'oqiganman', "o'qiganman", 'o‘qiganman'];
  if (stage === STAGE.ASKED_INFO && includesAny(t, partial)) return 'has_info';

  const hasInfo = ['egaman', 'bilaman', 'xabardorman', 'malumotim bor', "ma'lumotim bor", 'ma’lumotim bor', 'tanishman', 'ha', 'xa', 'albatta'];
  if (stage === STAGE.ASKED_INFO && includesAny(t, hasInfo)) return 'has_info';

  const greeting = ['assalomu', 'assalom', 'salom', 'va alaykum', 'valaykum', 'yaxshi', 'yaxshiman'];
  if ((stage === STAGE.NEW || stage === STAGE.OUTREACH_SENT) && includesAny(t, greeting)) return 'greeting';

  return 'unclear';
}

// -------------------- Message handling --------------------
function getMessageText(msg) {
  return msg?.text || msg?.caption || '';
}

function isMediaOnly(msg) {
  if (msg?.text || msg?.caption) return false;
  return Boolean(msg?.voice || msg?.audio || msg?.photo || msg?.video || msg?.document || msg?.sticker || msg?.animation || msg?.video_note);
}

function pickPhoto(photo = []) {
  if (!Array.isArray(photo) || !photo.length) return null;
  return [...photo].sort((a, b) => Number(b.file_size || 0) - Number(a.file_size || 0))[0];
}

function messageArchiveMeta(msg = {}) {
  if (msg.text) return { messageType: 'text' };
  const media =
    msg.photo ? { messageType: 'photo', file: pickPhoto(msg.photo) } :
    msg.voice ? { messageType: 'voice', file: msg.voice } :
    msg.video_note ? { messageType: 'video_note', file: msg.video_note } :
    msg.video ? { messageType: 'video', file: msg.video } :
    msg.document ? { messageType: 'document', file: msg.document } :
    msg.audio ? { messageType: 'audio', file: msg.audio } :
    msg.sticker ? { messageType: 'sticker', file: msg.sticker } :
    null;
  if (!media) return { messageType: msg.caption ? 'text' : 'other' };
  return {
    messageType: media.messageType,
    fileId: media.file?.file_id || null,
    fileUniqueId: media.file?.file_unique_id || null,
    fileName: media.file?.file_name || null,
    mimeType: media.file?.mime_type || null,
    fileSize: media.file?.file_size || null
  };
}

function messageArchivePayload(msg, account, direction, eventType = 'created') {
  const meta = messageArchiveMeta(msg);
  return {
    account_key: account?.account_key || DEFAULT_ACCOUNT_KEY,
    business_connection_id: msg.business_connection_id || msg.business_connection?.id || account?.business_connection_id || null,
    chat_id: String(msg.chat?.id || ''),
    message_id: msg.message_id || null,
    from_id: msg.from?.id ? String(msg.from.id) : null,
    from_username: msg.from?.username || null,
    from_first_name: msg.from?.first_name || null,
    direction,
    message_type: meta.messageType,
    text: msg.text || null,
    caption: msg.caption || null,
    file_id: meta.fileId || null,
    file_unique_id: meta.fileUniqueId || null,
    file_name: meta.fileName || null,
    mime_type: meta.mimeType || null,
    file_size: meta.fileSize || null,
    raw_json: msg,
    last_event_type: eventType
  };
}

function archiveStoragePath(payload, filePath = '') {
  const ext = filePath.includes('.') ? filePath.split('.').pop() : 'bin';
  return `${payload.account_key}/${payload.chat_id}/${payload.message_id}_${payload.file_unique_id || payload.file_id}.${ext}`;
}

async function maybeArchiveMediaFile(payload) {
  const downloadEnabled = payload.media_archive_download ?? MEDIA_ARCHIVE_DOWNLOAD;
  const bucket = payload.storage_bucket || SUPABASE_STORAGE_BUCKET;
  const maxBytes = Number(payload.media_archive_max_bytes || MEDIA_ARCHIVE_MAX_BYTES);
  if (!downloadEnabled || !bucket || !payload.file_id) return {};
  if (payload.file_size && Number(payload.file_size) > maxBytes) {
    await logEvent(payload.chat_id, 'media_archive_download_skipped_large', `${payload.message_id}:${payload.file_size}`, payload.account_key);
    return {};
  }
  try {
    const file = await tg('getFile', { file_id: payload.file_id });
    if (!file?.file_path) return {};
    const fileRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`);
    if (!fileRes.ok) throw new Error(`download failed ${fileRes.status}`);
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      await logEvent(payload.chat_id, 'media_archive_download_skipped_large', `${payload.message_id}:${bytes.byteLength}`, payload.account_key);
      return {};
    }
    const storagePath = archiveStoragePath(payload, file.file_path);
    const { error } = await supabase.storage.from(bucket).upload(storagePath, bytes, {
      contentType: payload.mime_type || 'application/octet-stream',
      upsert: true
    });
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    return { storage_path: storagePath, public_url: data?.publicUrl || null, storage_url: data?.publicUrl || null };
  } catch (err) {
    console.error('maybeArchiveMediaFile:', err.message);
    await logEvent(payload.chat_id, 'media_archive_download_skipped', err.message || String(err), payload.account_key);
    return {};
  }
}

async function archiveBusinessMessage(msg, account, direction = 'unknown') {
  if (!MEDIA_ARCHIVE_ENABLED || account?.archive_enabled === false || account?.media_archive_enabled === false) return null;
  const payload = messageArchivePayload(msg, account, direction, 'created');
  if (!payload.chat_id || !payload.message_id) return null;
  const storage = await maybeArchiveMediaFile({
    ...payload,
    media_archive_download: account?.media_archive_download,
    media_archive_max_bytes: account?.media_archive_max_bytes,
    storage_bucket: account?.storage_bucket
  });
  const { data, error } = await supabase.from('message_archive').upsert({
    ...payload,
    ...storage,
    delete_detected: false,
    last_event_type: 'created'
  }, { onConflict: 'account_key,chat_id,message_id' }).select().maybeSingle();
  if (error) {
    console.error('archiveBusinessMessage:', error.message);
    await logEvent(payload.chat_id, 'message_archive_error', error.message, payload.account_key);
  }
  return data || null;
}

async function archiveEditedBusinessMessage(msg) {
  const resolved = await resolveArchiveAccount(msg, msg.message_id, 'edited');
  const account = resolved.account;
  if (!MEDIA_ARCHIVE_ENABLED || account?.archive_enabled === false || account?.media_archive_enabled === false) return;
  const direction = isOwnerMessage(msg) ? 'outgoing' : 'incoming';
  const payload = messageArchivePayload(msg, account, direction, 'edited');
  if (!payload.chat_id || !payload.message_id) return;

  const oldRow = resolved.archived || await findArchivedMessage({
    businessConnectionId: payload.business_connection_id,
    chatId: payload.chat_id,
    messageId: payload.message_id,
    accountKey: payload.account_key
  });
  const storage = oldRow?.storage_path ? {} : await maybeArchiveMediaFile(payload);

  await supabase.from('message_edit_history').insert({
    archive_id: oldRow?.id || null,
    account_key: payload.account_key,
    chat_id: payload.chat_id,
    message_id: payload.message_id,
    old_text: oldRow?.text || null,
    new_text: payload.text || null,
    old_caption: oldRow?.caption || null,
    new_caption: payload.caption || null,
    old_raw_json: oldRow?.raw_json || null,
    new_raw_json: msg
  });

  const nextEditCount = Number(oldRow?.edit_count || 0) + 1;
  const { data: savedRow, error } = await supabase.from('message_archive').upsert({
    ...(oldRow || {}),
    ...payload,
    ...storage,
    id: oldRow?.id,
    edited_at: new Date().toISOString(),
    edit_count: nextEditCount,
    last_event_type: 'edited'
  }, { onConflict: 'account_key,chat_id,message_id' }).select().maybeSingle();
  if (error) console.error('archiveEditedBusinessMessage:', error.message);

  if (account.archive_notify_enabled !== false) await notifyEditedMessage(account, oldRow, savedRow || payload, resolved.reason);
}

function deletedMessageIds(update = {}) {
  const ids = update.message_ids || update.deleted_message_ids || update.message_id || [];
  return Array.isArray(ids) ? ids : [ids];
}

async function handleDeletedBusinessMessages(update = {}) {
  const businessConnectionId = update.business_connection_id || update.business_connection?.id || null;
  const chatId = String(update.chat?.id || update.chat_id || '');
  if (!chatId) return;
  for (const messageId of deletedMessageIds(update)) {
    if (!messageId) continue;
    const resolved = await resolveArchiveAccount(update, messageId, 'deleted');
    const account = resolved.account;
    if (!MEDIA_ARCHIVE_ENABLED || account?.archive_enabled === false || account?.media_archive_enabled === false) continue;
    const ak = account.account_key;
    let oldRow = resolved.archived || await findArchivedMessage({
      businessConnectionId,
      chatId,
      messageId,
      accountKey: ak
    });
    if (!oldRow) {
      oldRow = await findArchivedMessage({ businessConnectionId, chatId, messageId });
    }
    const patch = {
      account_key: ak,
      business_connection_id: businessConnectionId || oldRow?.business_connection_id || account.business_connection_id || null,
      chat_id: chatId,
      message_id: messageId,
      deleted_at: new Date().toISOString(),
      delete_detected: true,
      last_event_type: 'deleted'
    };
    const storedRow = oldRow?.account_key === ak ? oldRow : null;
    const carry = oldRow ? {
      from_id: oldRow.from_id || null,
      from_username: oldRow.from_username || null,
      from_first_name: oldRow.from_first_name || null,
      direction: oldRow.direction || 'unknown',
      message_type: oldRow.message_type || 'other',
      text: oldRow.text || null,
      caption: oldRow.caption || null,
      file_id: oldRow.file_id || null,
      file_unique_id: oldRow.file_unique_id || null,
      file_name: oldRow.file_name || null,
      mime_type: oldRow.mime_type || null,
      file_size: oldRow.file_size || null,
      storage_path: oldRow.storage_path || null,
      storage_url: oldRow.storage_url || null,
      public_url: oldRow.public_url || null,
      raw_json: oldRow.raw_json || {}
    } : {};
    const { data: savedRow, error } = await supabase.from('message_archive').upsert({
      ...(storedRow || {}),
      ...carry,
      ...patch,
      id: storedRow?.id
    }, { onConflict: 'account_key,chat_id,message_id' }).select().maybeSingle();
    if (error) console.error('handleDeletedBusinessMessages:', error.message);
    if (account.archive_notify_enabled !== false) await notifyDeletedMessage(account, savedRow || (oldRow ? { ...oldRow, ...patch } : patch), resolved.reason);
  }
}

function archiveActor(row = {}) {
  return row.from_username ? `@${row.from_username}` : (row.from_first_name || 'Foydalanuvchi');
}

function deletedItemLabel(messageType = 'text', full = false) {
  const shortLabels = {
    photo: 'rasmni',
    voice: 'ovozli xabarni',
    video_note: 'dumaloq videoni',
    video: 'videoni',
    document: 'faylni',
    audio: 'audio faylni',
    sticker: 'stikerni'
  };
  if (full) return shortLabels[messageType] || 'xabarni';
  return shortLabels[messageType] || 'xabarni';
}

async function notifyDeletedMessage(account, row, resolutionReason = '') {
  const actor = archiveActor(row);
  const item = deletedItemLabel(row?.message_type);
  const targetAdminChatId = await getAdminChatIdForAccount(account.account_key);
  if (!targetAdminChatId) {
    await logEvent(row?.chat_id || 'unknown', 'archive_deleted_notification_admin_missing', JSON.stringify({
      resolved_account_key: account.account_key,
      business_connection_id: row?.business_connection_id || null,
      chat_id: row?.chat_id || null,
      message_ids: [row?.message_id].filter(Boolean),
      resolution_reason: resolutionReason
    }), account.account_key);
    return;
  }
  await sendAdminForAccount(account.account_key, `🗑 <b>${html(actor)} ${html(item)} o‘chirdi</b>`, {
    reply_markup: row?.id ? { inline_keyboard: [[{ text: '👁 Ko‘rish', callback_data: `archv:${account.account_key}:${row.id}` }]] } : undefined
  });
  await logEvent(row?.chat_id || 'unknown', 'archive_deleted_notification_sent', JSON.stringify({
    event_type: 'deleted',
    resolved_account_key: account.account_key,
    target_admin_chat_id: targetAdminChatId || null,
    business_connection_id: row?.business_connection_id || null,
    chat_id: row?.chat_id || null,
    message_ids: [row?.message_id].filter(Boolean),
    resolution_reason: resolutionReason
  }), account.account_key);
}

async function notifyEditedMessage(account, oldRow, payload, resolutionReason = '') {
  const actor = archiveActor(payload);
  const targetAdminChatId = await getAdminChatIdForAccount(account.account_key);
  if (!targetAdminChatId) {
    await logEvent(payload.chat_id || 'unknown', 'archive_edited_notification_admin_missing', JSON.stringify({
      resolved_account_key: account.account_key,
      business_connection_id: payload.business_connection_id || null,
      chat_id: payload.chat_id || null,
      message_ids: [payload.message_id].filter(Boolean),
      resolution_reason: resolutionReason
    }), account.account_key);
    return;
  }
  await sendAdminForAccount(account.account_key, `✏️ <b>${html(actor)} xabarni tahrirladi</b>`, {
    reply_markup: payload?.id ? { inline_keyboard: [[{ text: '👁 Ko‘rish', callback_data: `archv:${account.account_key}:${payload.id}` }]] } : undefined
  });
  await logEvent(payload.chat_id || 'unknown', 'archive_edited_notification_sent', JSON.stringify({
    event_type: 'edited',
    resolved_account_key: account.account_key,
    target_admin_chat_id: targetAdminChatId || null,
    business_connection_id: payload.business_connection_id || null,
    chat_id: payload.chat_id || null,
    message_ids: [payload.message_id].filter(Boolean),
    resolution_reason: resolutionReason
  }), account.account_key);
}

async function sendArchivedMediaToAdmin(account, row, caption = 'Media arxiv') {
  if (!row?.file_id) return;
  const adminChatId = await getAdminChatIdForAccount(account.account_key);
  if (!adminChatId) return;
  const payload = { chat_id: adminChatId, caption };
  try {
    if (row.message_type === 'photo') return await tg('sendPhoto', { ...payload, photo: row.file_id });
    if (row.message_type === 'voice') return await tg('sendVoice', { ...payload, voice: row.file_id });
    if (row.message_type === 'video_note') return await tg('sendVideoNote', { chat_id: adminChatId, video_note: row.file_id });
    if (row.message_type === 'video') return await tg('sendVideo', { ...payload, video: row.file_id });
    if (row.message_type === 'document') return await tg('sendDocument', { ...payload, document: row.file_id });
    if (row.message_type === 'audio') return await tg('sendAudio', { ...payload, audio: row.file_id });
    if (row.message_type === 'sticker') return await tg('sendSticker', { chat_id: adminChatId, sticker: row.file_id });
  } catch (err) {
    console.error('sendArchivedMediaToAdmin:', err.message);
    await logEvent(row.chat_id || 'unknown', 'send_archived_media_failed', err.message || String(err), account.account_key);
  }
}

async function getArchiveRowById(accountOrKey, id) {
  let q = supabase.from('message_archive').select('*').eq('id', Number(id)).limit(1);
  q = archiveAccountFilter(q, accountOrKey);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error('getArchiveRowById:', error.message);
    return null;
  }
  return data || null;
}

async function latestEditHistory(accountOrKey, row) {
  if (!row) return null;
  let q = supabase.from('message_edit_history')
    .select('*')
    .eq('chat_id', String(row.chat_id))
    .eq('message_id', row.message_id)
    .order('edited_at', { ascending: false })
    .limit(1);
  q = accountLeadFilter(q, accountOrKey);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error('latestEditHistory:', error.message);
    return null;
  }
  return data || null;
}

async function sendArchiveFullDetail(chatId, accountOrKey, archiveId) {
  const account = await getAccount(accountOrKey);
  const row = await getArchiveRowById(account.account_key, archiveId);
  if (!row) return tg('sendMessage', { chat_id: chatId, text: 'Arxiv yozuvi topilmadi.' });
  const actor = archiveActor(row);
  if (row.last_event_type === 'edited' || Number(row.edit_count || 0) > 0) {
    const hist = await latestEditHistory(account.account_key, row);
    await tg('sendMessage', {
      chat_id: chatId,
      parse_mode: 'HTML',
      text:
        `✏️ <b>${html(actor)} ushbu xabarni tahrirladi</b>\n\n` +
        `Akkaunt: ${html(account.label || accountDisplayLabel(account.account_key))}\n\n` +
        `Eski xabar:\n${html(short(hist?.old_text || hist?.old_caption || '-', 1200))}\n\n` +
        `Yangi xabar:\n${html(short(hist?.new_text || hist?.new_caption || row.text || row.caption || '-', 1200))}\n\n` +
        `Vaqt: ${row.edited_at || hist?.edited_at || '-'}`
    });
    return;
  }
  const item = deletedItemLabel(row.message_type, true);
  const deletedText = row.text || row.caption || '';
  await tg('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text:
      `🗑 <b>${html(actor)} ushbu ${html(item)} o‘chirdi</b>\n\n` +
      `Akkaunt: ${html(account.label || accountDisplayLabel(account.account_key))}` +
      (deletedText ? `\n\nO‘chirilgan xabar:\n${html(short(deletedText, 1200))}` : '') +
      `\n\nVaqt: ${row.deleted_at || '-'}`
  });
  await sendArchivedMediaToAdmin(account, row, `O‘chirilgan ${row.message_type === 'photo' ? 'rasm' : 'media'} arxivi`);
}

function isOwnerMessage(msg) {
  const fromId = String(msg?.from?.id || '');
  if (!fromId) return false;
  return ENV_ACCOUNTS.some(a => String(a.business_owner_id || '') === fromId) || fromId === String(BUSINESS_OWNER_ID) || fromId === String(OWNER_TELEGRAM_ID);
}

function isAccountOwnerMessage(msg, account = {}) {
  const fromId = String(msg?.from?.id || '');
  if (!fromId) return false;
  return Boolean(
    isOwnerMessage(msg) ||
    (account.owner_user_id && String(account.owner_user_id) === fromId) ||
    (account.business_owner_id && String(account.business_owner_id) === fromId) ||
    (account.admin_chat_id && String(account.admin_chat_id) === fromId)
  );
}

function isBotMessage(msg) {
  return Boolean(msg?.from?.is_bot);
}

async function isKnownAdminMessage(msg) {
  const chatId = String(msg?.chat?.id || '');
  const fromId = String(msg?.from?.id || '');
  if (fromId === String(OWNER_TELEGRAM_ID) || fromId === String(ADMIN_CHAT_ID) || chatId === String(ADMIN_CHAT_ID)) return true;
  const accounts = await getAccounts();
  return accounts.some(a => (
    (a.admin_chat_id && (String(a.admin_chat_id) === chatId || String(a.admin_chat_id) === fromId)) ||
    (a.owner_user_id && String(a.owner_user_id) === fromId) ||
    (a.business_owner_id && String(a.business_owner_id) === fromId)
  ));
}

async function whoamiText(msg, messageType = 'message') {
  const chatId = String(msg?.chat?.id || '');
  const fromId = String(msg?.from?.id || '');
  const businessConnectionId = msg?.business_connection_id || msg?.business_connection?.id || '';
  const accounts = await getAccounts();
  const account = messageType === 'business_message'
    ? await findAccountForBusinessMessage(msg)
    : accounts.find(a => (
      (a.admin_chat_id && (String(a.admin_chat_id) === chatId || String(a.admin_chat_id) === fromId)) ||
      (a.owner_user_id && String(a.owner_user_id) === fromId) ||
      (a.business_owner_id && String(a.business_owner_id) === fromId)
    ));
  const isAdmin = await isKnownAdminMessage(msg);
  const accountMatches = accounts
    .filter(a => (
      (a.admin_chat_id && (String(a.admin_chat_id) === chatId || String(a.admin_chat_id) === fromId)) ||
      (a.owner_user_id && String(a.owner_user_id) === fromId) ||
      (a.business_owner_id && String(a.business_owner_id) === fromId) ||
      (a.business_connection_id && businessConnectionId && String(a.business_connection_id) === String(businessConnectionId))
    ))
    .map(a => `${a.account_key}:admin=${a.admin_chat_id && (String(a.admin_chat_id) === chatId || String(a.admin_chat_id) === fromId) ? 'true' : 'false'},owner=${a.business_owner_id && String(a.business_owner_id) === fromId ? 'true' : 'false'},connection=${a.business_connection_id && businessConnectionId && String(a.business_connection_id) === String(businessConnectionId) ? 'true' : 'false'}`)
    .join('\n');
  return (
    `🪪 whoami\n\n` +
    `message_type: ${messageType}\n` +
    `chat.id: ${chatId || '-'}\n` +
    `from.id: ${fromId || '-'}\n` +
    `from.username: ${msg?.from?.username || '-'}\n` +
    `from.first_name: ${msg?.from?.first_name || '-'}\n` +
    `business_connection_id: ${businessConnectionId || '-'}\n` +
    `detected account_key: ${account?.account_key || '-'}\n` +
    `is_admin: ${isAdmin ? 'true' : 'false'}\n` +
    `ADMIN_CHAT_ID match: ${chatId === String(ADMIN_CHAT_ID) || fromId === String(ADMIN_CHAT_ID) ? 'true' : 'false'}\n` +
    `OWNER_TELEGRAM_ID match: ${fromId === String(OWNER_TELEGRAM_ID) ? 'true' : 'false'}\n` +
    `BUSINESS_OWNER_ID match: ${fromId === String(BUSINESS_OWNER_ID) ? 'true' : 'false'}\n` +
    `account matches:\n${accountMatches || '-'}`
  );
}

async function replyWhoami(msg, messageType = 'message') {
  const chatId = String(msg?.chat?.id || '');
  const businessConnectionId = msg?.business_connection_id || msg?.business_connection?.id || null;
  if (!chatId) {
    console.error('whoami cannot reply: missing chat.id', JSON.stringify(msg || {}).slice(0, 500));
    return;
  }
  try {
    const payload = { chat_id: chatId, text: await whoamiText(msg, messageType) };
    if (messageType === 'business_message' && businessConnectionId) payload.business_connection_id = businessConnectionId;
    await tg('sendMessage', payload);
  } catch (err) {
    console.error('whoami reply failed:', err.message);
    try {
      const account = messageType === 'business_message' ? await findAccountForBusinessMessage(msg) : DEFAULT_ACCOUNT;
      await logEvent(chatId || 'unknown', 'whoami_reply_failed', err.message || String(err), account?.account_key);
    } catch {}
  }
}

async function handleBusinessMessage(msg) {
  const chatId = String(msg.chat?.id || '');
  if (!chatId) return;
  const businessConnectionId = msg.business_connection_id || msg.business_connection?.id || null;
  const account = await findAccountForBusinessMessage(msg);
  const ak = account.account_key;
  const text = getMessageText(msg).trim();
  if (normalizeCommandWord(text.split(/\s+/)[0]) === '/whoami') {
    await replyWhoami(msg, 'business_message');
    return;
  }
  const key = `business:${ak}:${chatId}:${msg.message_id || msg.date || Date.now()}`;
  const direction = isAccountOwnerMessage(msg, account) ? 'outgoing' : 'incoming';
  if (direction === 'outgoing') await rememberAccountBusinessConnection(account, businessConnectionId);
  await archiveBusinessMessage(msg, account, direction);

  if (ak === UNKNOWN_ACCOUNT_KEY) {
    await logIgnore(chatId, 'unmapped_business_connection_no_flow', businessConnectionId || '', ak);
    return;
  }
  if (account.bot_enabled === false || account.auto_reply_enabled === false) {
    await logIgnore(chatId, 'auto_reply_off', businessConnectionId || '', ak);
    return;
  }

  const firstTime = await markProcessed(key, chatId, ak);
  if (!firstTime) {
    await logIgnore(chatId, 'duplicate_message', key, ak);
    return;
  }
  if (isBotMessage(msg)) return;

  if (normalizeCommandWord(text.trim().split(/\s+/)[0]) === '/resetme') {
    await resetMeChat({ chatId, businessConnectionId, from: msg.from, accountKey: ak });
    await tg('sendMessage', {
      chat_id: chatId,
      business_connection_id: businessConnectionId || undefined,
      text: '✅ Test profilingiz tozalandi. Endi qayta test qilishingiz mumkin. Keyingi oddiy xabaringizda bot boshidan boshlaydi.'
    });
    return;
  }

  // Owner/admin outgoing message: remember outreach/context. Do not respond to the admin message itself.
  if (isAccountOwnerMessage(msg, account)) {
    if (text) await markOutreach({ chatId, businessConnectionId, from: msg.from, text, accountKey: ak });
    await syncAdminContext({ chatId, businessConnectionId, from: msg.from, text: text || '[media]', accountKey: ak });
    return;
  }

  const rawText = text || (isMediaOnly(msg) ? '[media]' : '');
  const lead = await upsertLeadBase({ chatId, businessConnectionId, from: msg.from, text: rawText, accountKey: ak });
  if (!lead) return;

  if (lead.stage === STAGE.INFO_SENT_FINISHED) {
    await logIgnore(chatId, 'old_finished_chat', rawText, ak);
    await handlePostFinishSignal(lead, msg, rawText);
    return;
  }
  if (lead.stage === STAGE.PAUSED || lead.stage === STAGE.DISABLED) {
    await logIgnore(chatId, 'blocked_stage', `${lead.stage}: ${rawText}`, ak);
    return;
  }

  // Default safety: if this was not an outreach chat, try to continue from admin context first.
  // Masalan scheduled xabar yoki admin qo‘lda “ariza qoldirgansizmi?” deb yozgan,
  // mijoz “ha shunday” deb javob bergan bo‘lsa, bot to‘g‘ri bosqichdan davom etadi.
  let activeLead = lead;
  const auto = await getAutoOutreach(ak);
  const inActiveSession = hasActiveOutreachSession(lead, auto);
  if (AUTO_START_REQUIRE_OUTREACH && !inActiveSession) {
    const resumed = await tryResumeFromContext(lead, rawText);
    if (resumed.handled) return;
    activeLead = resumed.lead || lead;
    await logIgnore(chatId, 'context_resume_not_detected', rawText, ak);

    if (!isAutoActive(auto)) {
      await logIgnore(chatId, 'auto_reply_off', rawText, ak);
      return;
    }

    await updateLead(chatId, { stage: STAGE.PENDING_APPROVAL, status: 'pending_approval', bot_enabled: false }, ak);
    await logIgnore(chatId, 'no_outreach_session', rawText, ak);
    return;
  }

  if (!activeLead.bot_enabled) {
    await logIgnore(chatId, 'blocked_stage', `bot_disabled:${activeLead.stage}`, ak);
    return;
  }

  if (isMediaOnly(msg)) {
    await sendPackage(activeLead, 'media_text_request', ['media_text_request'], {});
    await logEvent(chatId, 'media_received', JSON.stringify(Object.keys(msg).slice(0, 10)), ak);
    return;
  }

  enqueueLeadMessage(activeLead, text);
}

async function handlePostFinishSignal(lead, msg, rawText) {
  const text = rawText || '';
  const intent = isMediaOnly(msg) ? 'media_after_info' : classify(text, lead.stage);
  const patch = { last_user_message: text || '[media]', last_message_at: new Date().toISOString() };

  if (intent === 'read_offer') patch.status = 'tanishdim';
  else if (intent === 'payment_near') patch.status = 'payment_near';
  else if (intent === 'hard_reject') {
    patch.status = 'disabled';
    patch.stage = STAGE.DISABLED;
    patch.bot_enabled = false;
  }
  await updateLead(lead.chat_id, patch, lead.account_key);
  await logEvent(lead.chat_id, `post_finish_${intent}`, text || '[media]', lead.account_key);
}

function enqueueLeadMessage(lead, text) {
  const chatId = String(lead.chat_id);
  const existing = buffers.get(chatId) || { lead, texts: [], timer: null };
  existing.lead = lead;
  existing.texts.push(text);
  if (existing.timer) clearTimeout(existing.timer);
  existing.timer = setTimeout(() => {
    buffers.delete(chatId);
    processLeadBatch(existing.lead, existing.texts).catch(async err => {
      console.error('processLeadBatch:', err);
      await logEvent(chatId, 'process_error', err.message || String(err));
    });
  }, MESSAGE_BUFFER_MS);
  buffers.set(chatId, existing);
}

async function processLeadBatch(initialLead, texts) {
  let lead = await getLead(initialLead.chat_id, initialLead.account_key) || initialLead;
  if (!lead.bot_enabled) {
    await logIgnore(lead.chat_id, 'blocked_stage', `bot_disabled:${lead.stage}`, lead.account_key);
    return;
  }
  if (STOP_REPLY_STAGES.has(lead.stage)) {
    await logIgnore(lead.chat_id, lead.stage === STAGE.INFO_SENT_FINISHED ? 'old_finished_chat' : 'blocked_stage', lead.stage, lead.account_key);
    return;
  }
  const text = texts.join('\n').trim();
  const ruleIntent = classify(text, lead.stage);
  const aiDecision = ruleIntent === 'unclear' || ['rahmat', 'raxmat', 'qiziqdim', 'tushunarli', 'mayli', 'boladi', 'bo‘ladi', 'ok', 'ho‘p', "ho'p"].some(x => normalize(text).includes(x))
    ? await classifyWithAI(lead, text, ruleIntent)
    : null;
  const intent = mapAiIntentToRuleIntent(aiDecision, lead.stage, ruleIntent);
  await updateLead(lead.chat_id, { last_user_message: text, last_message_at: new Date().toISOString() }, lead.account_key);
  await logEvent(lead.chat_id, `intent_${intent}_${lead.stage}`, text, lead.account_key);

  if (intent === 'hard_reject') {
    await stopLead(lead, 'hard_reject');
    return;
  }
  if (intent === 'later') {
    await updateLead(lead.chat_id, { stage: STAGE.PAUSED, status: 'paused', bot_enabled: false }, lead.account_key);
    await logEvent(lead.chat_id, 'paused_by_later', text, lead.account_key);
    return;
  }

  // Main info-only flow.
  if (lead.stage === STAGE.OUTREACH_SENT || lead.stage === STAGE.NEW || lead.stage === STAGE.PENDING_APPROVAL) {
    const keys = await flowTemplateKeys(lead.account_key, 'ask_application', ['ask_application']);
    await sendPackage(lead, 'ask_application', keys, { stage: STAGE.ASKED_APPLICATION, status: 'active', bot_enabled: true });
    return;
  }

  if (lead.stage === STAGE.ASKED_APPLICATION) {
    if (intent === 'application_confirmed' || intent === 'application_submitted') {
      const keys = await flowTemplateKeys(lead.account_key, 'ask_info', ['ask_info']);
      await sendPackage(lead, 'ask_info', keys, { stage: STAGE.ASKED_INFO });
      return;
    }
    if (intent === 'application_not_submitted') {
      const keys = await flowTemplateKeys(lead.account_key, 'application_link', ['application_link_reply']);
      const after = await sendPackage(lead, 'application_link_reply', keys, {
        stage: STAGE.INFO_SENT_FINISHED,
        status: 'application_link_sent',
        bot_enabled: false,
        finished_at: new Date().toISOString()
      });
      await sendAdmin(`🔗 <b>Ariza havolasi yuborildi</b>\nChat ID: <code>${lead.chat_id}</code>\nEndi chatni qo‘lda davom ettiring.`, {}, lead.account_key);
      return after;
    }
    const clarified = await reserveAction(lead.chat_id, lead.stage, 'clarify_application_once');
    if (clarified) {
      await sendTemplate(lead, 'clarify_application');
      return;
    }
    await updateLead(lead.chat_id, { stage: STAGE.PAUSED, status: 'needs_admin', bot_enabled: false }, lead.account_key);
    await sendAdmin(`⚠️ <b>Noaniq lid</b>\nChat ID: <code>${lead.chat_id}</code>\nXabar: ${html(text)}\nBot to‘xtadi, qo‘lda davom ettiring.`, {}, lead.account_key);
    return;
  }

  if (lead.stage === STAGE.ASKED_INFO) {
    if (intent === 'has_info') {
      const keys = await flowTemplateKeys(lead.account_key, 'has_info', ['known_info_preface', 'short_intro', 'offer_end']);
      const after = await sendPackage(lead, 'known_info_package', keys, {});
      await finishAfterInfo(after || lead);
      return;
    }
    if (intent === 'unclear') {
      await updateLead(lead.chat_id, { status: 'needs_admin', bot_enabled: false }, lead.account_key);
      await logEvent(lead.chat_id, 'asked_info_unclear_human_needed', text, lead.account_key);
      return;
    }
    const keys = await flowTemplateKeys(lead.account_key, 'no_info', ['unknown_info_preface', 'full_intro', 'offer_end']);
    const after = await sendPackage(lead, 'unknown_info_package', keys, {});
    await finishAfterInfo(after || lead);
    return;
  }

  await updateLead(lead.chat_id, { stage: STAGE.PAUSED, status: 'needs_admin', bot_enabled: false }, lead.account_key);
  await logEvent(lead.chat_id, 'unexpected_stage_stopped', `${lead.stage}: ${text}`, lead.account_key);
}

// -------------------- Reports / lists --------------------
async function countLeads(apply, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  let q = supabase.from('business_leads').select('*', { count: 'exact', head: true });
  q = accountLeadFilter(q, accountOrKey);
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) {
    console.error('countLeads:', error.message);
    return 0;
  }
  return count || 0;
}

async function getLeads(apply, limit = 20, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  let q = supabase.from('business_leads').select('*').order('updated_at', { ascending: false }).limit(limit);
  q = accountLeadFilter(q, accountOrKey);
  if (apply) q = apply(q);
  const { data, error } = await q;
  if (error) {
    console.error('getLeads:', error.message);
    return [];
  }
  return data || [];
}

async function sessionStats(sessionId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const sessionFilter = q => q.eq('outreach_session_id', sessionId);
  return {
    outreach: await countLeads(sessionFilter, accountOrKey),
    replied: await countLeads(q => sessionFilter(q).not('last_user_message', 'is', null), accountOrKey),
    infoSent: await countLeads(q => sessionFilter(q).eq('stage', STAGE.INFO_SENT_FINISHED).in('status', ['info_sent', 'tanishdim', 'payment_near', 'reminder_sent']), accountOrKey),
    appLink: await countLeads(q => sessionFilter(q).eq('status', 'application_link_sent'), accountOrKey),
    read: await countLeads(q => sessionFilter(q).eq('status', 'tanishdim'), accountOrKey),
    payment: await countLeads(q => sessionFilter(q).eq('status', 'payment_near'), accountOrKey),
    rejected: await countLeads(q => sessionFilter(q).in('status', ['hard_reject', 'disabled']), accountOrKey)
  };
}

async function sendAutoSessionReport(chatId, auto = null, final = false, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const current = auto || await getAutoOutreach(accountOrKey);
  if (!current?.session_id) return tg('sendMessage', { chat_id: chatId, text: 'Hozircha outreach session yo‘q.' });
  const s = await sessionStats(current.session_id, accountOrKey);
  const title = final ? '📣 Bugungi Auto Outreach tugadi' : '📊 Outreach hisoboti';
  return tg('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text:
      `<b>${title}</b>\n\n` +
      `Outreach aniqlanganlar: ${s.outreach} ta\n` +
      `Javob berganlar: ${s.replied} ta\n` +
      `Ma’lumot yuborilganlar: ${s.infoSent} ta\n` +
      `Ariza link yuborilganlar: ${s.appLink} ta\n` +
      `Tanishdim yozganlar: ${s.read} ta\n` +
      `To‘lovga yaqinlar: ${s.payment} ta\n` +
      `Rad etganlar: ${s.rejected} ta`
  });
}

function dueReminderFilter(q) {
  const cutoff = new Date(Date.now() - REMINDER_AFTER_MS).toISOString();
  return q.eq('stage', STAGE.INFO_SENT_FINISHED).in('status', ['info_sent']).not('finished_at', 'is', null).lte('finished_at', cutoff);
}

async function getReminderDue(limit = 50, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  return getLeads(q => dueReminderFilter(q), limit, accountOrKey);
}

function listText(title, rows) {
  if (!rows.length) return `${title}\n\nHozircha ro‘yxat bo‘sh.`;
  return `${title}\n\n` + rows.map((l, i) => `${i + 1}. ${l.first_name || '-'} ${l.username ? '@' + l.username : ''}\n   Chat ID: ${l.chat_id}\n   Status: ${l.status}\n   Oxirgi: ${short(l.last_user_message || '-')}`).join('\n\n');
}

function archiveAccountFilter(q, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  return accountLeadFilter(q, accountOrKey);
}

async function getArchiveRows(type, accountOrKey = DEFAULT_ACCOUNT_KEY, chatId = null, limit = 10) {
  let q = supabase.from('message_archive')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  q = archiveAccountFilter(q, accountOrKey);
  if (chatId) q = q.eq('chat_id', String(chatId));
  if (type === 'deleted') q = q.eq('delete_detected', true).order('deleted_at', { ascending: false, nullsFirst: false });
  if (type === 'edited') q = q.gt('edit_count', 0).order('edited_at', { ascending: false, nullsFirst: false });
  if (type === 'media') q = q.not('file_id', 'is', null);
  const { data, error } = await q;
  if (error) {
    console.error('getArchiveRows:', error.message);
    return [];
  }
  return data || [];
}

async function getArchivePeople(accountOrKey = DEFAULT_ACCOUNT_KEY, limit = 20) {
  let q = supabase.from('message_archive')
    .select('chat_id,from_username,from_first_name,created_at,deleted_at,edited_at')
    .order('created_at', { ascending: false })
    .limit(100);
  q = archiveAccountFilter(q, accountOrKey);
  const { data, error } = await q;
  if (error) {
    console.error('getArchivePeople:', error.message);
    return [];
  }
  const seen = new Map();
  for (const row of data || []) {
    if (!seen.has(row.chat_id)) seen.set(row.chat_id, row);
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

async function sendArchivePeopleMenu(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const account = await getAccount(accountOrKey);
  const people = await getArchivePeople(account.account_key);
  const rows = people.map(p => ([{
    text: p.from_username ? `@${p.from_username}` : (p.from_first_name || String(p.chat_id)),
    callback_data: `archp:${account.account_key}:${p.chat_id}`
  }]));
  if (!rows.length) rows.push([{ text: 'Hozircha arxiv yo‘q', callback_data: 'noop' }]);
  rows.push([{ text: '⬅️ Menyu', callback_data: 'menu' }]);
  return tg('sendMessage', {
    chat_id: chatId,
    text: `Joriy akkaunt: ${account.label || accountDisplayLabel(account.account_key)}\n\n🕵️ Arxiv`,
    reply_markup: { inline_keyboard: rows }
  });
}

function archiveEventLabel(row = {}) {
  const type = row.last_event_type === 'edited' || Number(row.edit_count || 0) > 0 ? 'tahrirlandi' : 'o‘chirildi';
  const item = row.message_type === 'photo' ? 'rasm' :
    row.message_type === 'voice' ? 'ovozli xabar' :
    row.message_type === 'video_note' ? 'dumaloq video' :
    row.message_type === 'document' ? 'fayl' :
    row.message_type === 'video' ? 'video' : 'xabar';
  return `${item} ${type}`;
}

async function sendArchivePersonEvents(chatId, accountOrKey, targetChatId) {
  const account = await getAccount(accountOrKey);
  const rows = await getArchiveRows('recent', account.account_key, targetChatId, 20);
  const buttons = rows.map(r => {
    const d = new Date(r.deleted_at || r.edited_at || r.created_at || Date.now());
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return [{ text: `${time} — ${archiveEventLabel(r)}`, callback_data: `archv:${account.account_key}:${r.id}` }];
  });
  if (!buttons.length) buttons.push([{ text: 'Bu chatda arxiv topilmadi', callback_data: 'noop' }]);
  buttons.push([{ text: '⬅️ Arxiv', callback_data: `archa:${account.account_key}` }]);
  const person = rows[0]?.from_username ? `@${rows[0].from_username}` : (rows[0]?.from_first_name || String(targetChatId));
  return tg('sendMessage', {
    chat_id: chatId,
    text: `Joriy akkaunt: ${account.label || accountDisplayLabel(account.account_key)}\n\n${person}`,
    reply_markup: { inline_keyboard: buttons }
  });
}

async function archiveRowsText(title, rows) {
  if (!rows.length) return `${title}\n\nHozircha ro‘yxat bo‘sh.`;
  const lines = [];
  for (const [i, r] of rows.entries()) {
    const d = new Date(r.deleted_at || r.edited_at || r.created_at || Date.now());
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    lines.push(
      `${i + 1}. ${r.from_username ? '@' + r.from_username : (r.from_first_name || '-') } — ${time} — ${archiveEventLabel(r)}\n` +
      `   ${short(r.text || r.caption || '-', 90)}`
    );
  }
  return `${title}\n\n${lines.join('\n\n')}`;
}

function archiveMenuKeyboard() {
  return { inline_keyboard: [[{ text: 'UZLYE', callback_data: 'archa:uzlye' }], [{ text: 'Ikkinchi akkaunt', callback_data: 'archa:second' }], [{ text: '⬅️ Menyu', callback_data: 'menu' }]] };
}

async function sendArchiveMenu(chatId) {
  const accounts = (await getAccounts()).filter(a => a.account_key !== UNKNOWN_ACCOUNT_KEY);
  const rows = accounts.map(a => ([{ text: a.label || a.account_key, callback_data: `archa:${a.account_key}` }]));
  rows.push([{ text: '⬅️ Menyu', callback_data: 'menu' }]);
  return tg('sendMessage', {
    chat_id: chatId,
    text: '🕵️ Arxiv\n\nAkkauntni tanlang.',
    reply_markup: { inline_keyboard: rows }
  });
}

async function sendArchiveList(chatId, type = 'recent', accountOrKey = DEFAULT_ACCOUNT_KEY, targetChatId = null) {
  const titles = {
    recent: '🕵️ Oxirgi arxiv xabarlari',
    deleted: '🗑 O‘chirilgan xabarlar',
    edited: '✏️ Tahrirlangan xabarlar',
    media: '🖼 Media arxiv',
    chat: `🔎 Chat arxivi: ${targetChatId}`
  };
  const rows = await getArchiveRows(type === 'chat' ? 'recent' : type, accountOrKey, targetChatId, 10);
  return tg('sendMessage', { chat_id: chatId, text: await archiveRowsText(titles[type] || titles.recent, rows) });
}

async function getBusinessConnectionRows(accountOrKey = null) {
  let q = supabase.from('business_connection_accounts')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(20);
  if (accountOrKey) q = q.eq('account_key', accountKey(accountOrKey));
  const { data, error } = await q;
  if (error) {
    if (!String(error.message || '').includes('does not exist')) console.error('getBusinessConnectionRows:', error.message);
    return [];
  }
  return data || [];
}

async function sendConnections(chatId) {
  const rows = await getBusinessConnectionRows();
  const body = rows.length
    ? rows.map((r, i) => `${i + 1}. ${r.business_connection_id} → ${r.account_key}\n   user_id: ${r.user_id || '-'} ${r.username ? '@' + r.username : ''}\n   updated_at: ${r.updated_at || '-'}`).join('\n\n')
    : 'Hozircha business connection mapping yo‘q.';
  return tg('sendMessage', { chat_id: chatId, text: `🔗 Business connection mappings\n\n${body}` });
}

async function sendArchiveDebug(chatId, parts, selectedAccountKey) {
  const accounts = await getAccounts();
  const maybeAccount = accounts.find(a => a.account_key === parts[1]);
  const accountKeyForQuery = maybeAccount ? parts[1] : selectedAccountKey;
  const targetChatId = maybeAccount ? parts[2] : parts[1];
  if (maybeAccount && !targetChatId) {
    const account = await getAccount(accountKeyForQuery);
    const adminChatId = await getAdminChatIdForAccount(accountKeyForQuery);
    const connections = await getBusinessConnectionRows(accountKeyForQuery);
    const rows = await getArchiveRows('recent', accountKeyForQuery, null, 10);
    const connectionText = connections.length
      ? connections.map(r => `${r.business_connection_id} → ${r.account_key} (${r.user_id || '-'})`).join('\n')
      : '-';
    const archiveText = rows.length
      ? rows.map((r, i) => `${i + 1}. ${r.account_key || '-'} | ${r.business_connection_id || '-'} | chat:${r.chat_id} | msg:${r.message_id} | ${r.from_username ? '@' + r.from_username : '-'} | ${r.message_type || '-'} | ${r.last_event_type || '-'}`).join('\n')
      : '-';
    return tg('sendMessage', {
      chat_id: chatId,
      text:
        `🕵️ Archive debug\n\n` +
        `account_key: ${account.account_key}\n` +
        `admin_chat_id: ${adminChatId || '-'}\n\n` +
        `business_connection_ids:\n${connectionText}\n\n` +
        `last_archive_rows:\n${archiveText}`
    });
  }
  return sendArchiveList(chatId, 'chat', accountKeyForQuery, targetChatId);
}

async function parseOptionalAccountArg(parts, selectedAccountKey, startIndex = 1) {
  const accounts = await getAccounts();
  const maybe = parts[startIndex];
  const account = accounts.find(a => a.account_key === maybe);
  return {
    accountKey: account?.account_key || selectedAccountKey,
    nextIndex: account ? startIndex + 1 : startIndex
  };
}

async function sendList(chatId, type, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  let rows = [];
  let title = '';
  if (type === 'info_sent') {
    title = '📄 Ma’lumot yuborilganlar';
    rows = await getLeads(q => q.eq('stage', STAGE.INFO_SENT_FINISHED).in('status', ['info_sent', 'reminder_sent']), 20, accountOrKey);
  } else if (type === 'read') {
    title = '✅ Tanishdim yozganlar';
    rows = await getLeads(q => q.eq('status', 'tanishdim'), 20, accountOrKey);
  } else if (type === 'payment') {
    title = '💳 To‘lovga yaqinlar';
    rows = await getLeads(q => q.eq('status', 'payment_near'), 20, accountOrKey);
  } else if (type === 'reminders') {
    title = '⏰ Eslatma keraklar';
    rows = await getReminderDue(20, accountOrKey);
  } else if (type === 'pending') {
    title = '🆕 Pending';
    rows = await getLeads(q => q.in('stage', [STAGE.PENDING_APPROVAL, STAGE.OUTREACH_SENT, STAGE.PAUSED]), 20, accountOrKey);
  }
  const keyboard = type === 'reminders' && rows.length
    ? { inline_keyboard: [[{ text: '👁 Eslatma preview', callback_data: 'reminder_preview' }], [{ text: '⬅️ Menyu', callback_data: 'menu' }]] }
    : { inline_keyboard: [[{ text: '⬅️ Menyu', callback_data: 'menu' }]] };
  return tg('sendMessage', { chat_id: chatId, text: listText(title, rows), reply_markup: keyboard });
}

async function sendReminderPreview(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const rows = await getReminderDue(50, accountOrKey);
  if (!rows.length) return tg('sendMessage', { chat_id: chatId, text: '⏰ Eslatma kerak bo‘lgan lidlar yo‘q.' });
  const body = await getTemplate('offer_followup', accountOrKey) || 'Tanishib chiqdingizmi? Biz sizni kutyapmiz.';
  const text =
    `⏰ <b>Ommaviy eslatma preview</b>\n\n` +
    `Quyidagi xabar <b>${rows.length}</b> ta lidga yuboriladi:\n\n` +
    `<i>${html(renderTemplate(body))}</i>\n\n` +
    `Ro‘yxat:\n` + rows.slice(0, 20).map((l, i) => `${i + 1}. ${html(l.first_name || '-')} ${l.username ? '@' + html(l.username) : ''} — <code>${l.chat_id}</code>`).join('\n') +
    (rows.length > 20 ? `\n... yana ${rows.length - 20} ta` : '') +
    `\n\nTasdiqlaysizmi?`;
  return tg('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text,
    reply_markup: { inline_keyboard: [[{ text: '✅ Ha, yuborish', callback_data: 'reminder_confirm' }, { text: '❌ Bekor qilish', callback_data: 'menu' }]] }
  });
}

async function sendReminderConfirm(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const rows = await getReminderDue(100, accountOrKey);
  if (!rows.length) return tg('sendMessage', { chat_id: chatId, text: '⏰ Yuboriladigan lidlar qolmadi.' });
  let sent = 0;
  for (const lead of rows) {
    const reserved = await reserveAction(lead.chat_id, lead.stage, 'manual_offer_followup', lead.account_key);
    if (!reserved) continue;
    const ok = await sendTemplate(lead, 'offer_followup');
    if (ok) {
      sent += 1;
      await updateLead(lead.chat_id, { status: 'reminder_sent' }, lead.account_key);
      await sleep(400);
    }
  }
  return tg('sendMessage', { chat_id: chatId, text: `✅ ${sent} ta lidga eslatma yuborildi.` });
}

async function getSelectedAccountKey(adminChatId) {
  const { data, error } = await supabase.from('admin_sessions').select('payload').eq('chat_id', String(adminChatId)).maybeSingle();
  if (!error && data?.payload?.selected_account_key) return data.payload.selected_account_key;
  const accounts = await getAccounts();
  const direct = accounts.find(a => String(a.admin_chat_id || '') === String(adminChatId));
  return direct?.account_key || DEFAULT_ACCOUNT.account_key;
}

async function setSelectedAccountKey(adminChatId, selectedAccountKey) {
  const { error } = await supabase.from('admin_sessions').upsert({
    chat_id: String(adminChatId),
    mode: 'account_selected',
    account_key: selectedAccountKey,
    template_key: null,
    payload: { selected_account_key: selectedAccountKey },
    updated_at: new Date().toISOString()
  });
  if (error) console.error('setSelectedAccountKey:', error.message);
}

async function getAdminSession(chatId) {
  const { data, error } = await supabase.from('admin_sessions').select('*').eq('chat_id', String(chatId)).maybeSingle();
  if (error) {
    console.error('getAdminSession:', error.message);
    return null;
  }
  return data || null;
}

async function setAdminSession(chatId, mode, payload = {}) {
  const { error } = await supabase.from('admin_sessions').upsert({
    chat_id: String(chatId),
    mode,
    account_key: payload.selected_account_key || payload.account_key || null,
    template_key: payload.template_key || null,
    payload,
    updated_at: new Date().toISOString()
  });
  if (error) console.error('setAdminSession:', error.message);
}

async function sendAccountsMenu(chatId) {
  const accounts = await getAccounts();
  const selected = await getSelectedAccountKey(chatId);
  const rows = accounts.map(a => ([{
    text: `${a.account_key === selected ? '✅ ' : ''}${a.label || a.account_key}`,
    callback_data: `account:${a.account_key}`
  }]));
  rows.push([{ text: '⬅️ Menyu', callback_data: 'menu' }]);
  return tg('sendMessage', {
    chat_id: chatId,
    text: `Joriy akkaunt: ${accountDisplayLabel(selected)}\n\n👤 Akkaunt tanlash`,
    reply_markup: { inline_keyboard: rows }
  });
}

async function sendAccountStatus(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const account = await getAccount(accountOrKey);
  const auto = await getAutoOutreach(account.account_key);
  const daily = await getDailyAuto(account.account_key);
  return tg('sendMessage', {
    chat_id: chatId,
    text:
      `👤 Akkaunt\n\n` +
      `Key: ${account.account_key}\n` +
      `Label: ${account.label || '-'}\n` +
      `Project: ${account.project_name || '-'}\n` +
      `Flow: ${account.flow_key || 'info_only'}\n` +
      `Admin chat: ${account.admin_chat_id || '-'}\n` +
      `Business owner: ${account.business_owner_id || '-'}\n` +
      `Business connection: ${account.business_connection_id || '-'}\n` +
      `Auto Reply: ${isAutoActive(auto) ? 'ON' : 'OFF'}\n` +
      `Archive: ${account.archive_enabled === false ? 'OFF' : 'ON'}\n` +
      `Archive notify: ${account.archive_notify_enabled === false ? 'OFF' : 'ON'}\n` +
      `Active session: ${auto?.session_id || '-'}\n` +
      `Daily auto: ${daily.enabled ? `${daily.start_time}, ${daily.duration_hours}h` : 'OFF'}`
  });
}

const TEMPLATE_MENU_KEYS = ['ask_application', 'ask_info', 'known_info_preface', 'unknown_info_preface', 'short_intro', 'full_intro', 'offer_end', 'application_link_reply', 'offer_followup'];

async function sendTemplatesMenu(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const rows = TEMPLATE_MENU_KEYS.map(k => ([{ text: k, callback_data: `tpl:${k}` }]));
  rows.push([{ text: '⬅️ Menyu', callback_data: 'menu' }]);
  return tg('sendMessage', {
    chat_id: chatId,
    text: `Joriy akkaunt: ${accountDisplayLabel(accountOrKey)}\n\n✏️ Shablonlar`,
    reply_markup: { inline_keyboard: rows }
  });
}

async function sendTemplateActions(chatId, templateKey, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  return tg('sendMessage', {
    chat_id: chatId,
    text: `Joriy akkaunt: ${accountDisplayLabel(accountOrKey)}\n\nShablon: ${templateKey}`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '👁 Ko‘rish', callback_data: `tpl_view:${templateKey}` }],
        [{ text: '✏️ Oddiy tahrirlash', callback_data: `tpl_edit:${templateKey}` }],
        [{ text: '🤖 AI bilan tahrirlash', callback_data: `tpl_ai:${templateKey}` }],
        [{ text: '🧪 Test yuborish', callback_data: `tpl_test:${templateKey}` }],
        [{ text: '⬅️ Orqaga', callback_data: 'templates' }]
      ]
    }
  });
}

async function showAiTemplatePreview(chatId, accountOrKey, templateKey, roughText) {
  const result = await improveTemplateWithAI({ accountKey: accountKey(accountOrKey), templateKey, roughText });
  const edited = result?.text;
  if (!edited) return tg('sendMessage', { chat_id: chatId, text: 'AI hozircha sozlanmagan. OPENAI_API_KEY kerak.' });
  await setAdminSession(chatId, 'ai_template_preview', {
    selected_account_key: accountKey(accountOrKey),
    template_key: templateKey,
    rough_text: roughText,
    edited_text: edited
  });
  return tg('sendMessage', {
    chat_id: chatId,
    text: `Joriy akkaunt: ${accountDisplayLabel(accountOrKey)}\n\nAI tahrirlangan matn:\n\n${edited}\n\nSaqlaysizmi?`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Saqlash', callback_data: 'tpl_ai_save' }, { text: '✏️ Qayta tahrirlash', callback_data: 'tpl_ai_retry' }],
        [{ text: '❌ Bekor qilish', callback_data: 'tpl_ai_cancel' }]
      ]
    }
  });
}

async function startTemplateEdit(chatId, accountOrKey, templateKey) {
  await setAdminSession(chatId, 'template_edit_input', {
    selected_account_key: accountKey(accountOrKey),
    template_key: templateKey
  });
  return tg('sendMessage', {
    chat_id: chatId,
    text: `Joriy akkaunt: ${accountDisplayLabel(accountOrKey)}\n\nYangi matnni yuboring. Bu faqat ${accountDisplayLabel(accountOrKey)} akkaunti uchun saqlanadi.`,
    reply_markup: { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'tpl_edit_cancel' }]] }
  });
}

async function showTemplateEditPreview(chatId, accountOrKey, templateKey, text) {
  await setAdminSession(chatId, 'template_edit_preview', {
    selected_account_key: accountKey(accountOrKey),
    template_key: templateKey,
    edited_text: text
  });
  return tg('sendMessage', {
    chat_id: chatId,
    text: `Joriy akkaunt: ${accountDisplayLabel(accountOrKey)}\n\nYangi shablon preview:\n${text}\n\nSaqlaysizmi?`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Saqlash', callback_data: 'tpl_edit_save' }, { text: '❌ Bekor qilish', callback_data: 'tpl_edit_cancel' }],
        [{ text: '✏️ Qayta yozish', callback_data: 'tpl_edit_retry' }]
      ]
    }
  });
}

async function sendFlow(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const account = await getAccount(accountOrKey);
  const steps = await getFlowSteps(account.account_key);
  if (!steps.length) {
    return tg('sendMessage', { chat_id: chatId, text: `Flow: ${account.account_key}/${account.flow_key || 'info_only'}\n\nDB flow steps yo‘q. Bot UZLYE fallback ketma-ketligidan foydalanadi.` });
  }
  const text = `Flow: ${account.account_key}/${account.flow_key || 'info_only'}\n\n` + steps.map((s, i) => (
    `${i + 1}. ${s.step_key} -> ${s.template_key}\n` +
    `   yes:${s.next_step_yes || '-'} no:${s.next_step_no || '-'} partial:${s.next_step_partial || '-'} unknown:${s.next_step_unknown || '-'} stop:${s.stop_after_send ? 'true' : 'false'}`
  )).join('\n\n');
  return tg('sendMessage', { chat_id: chatId, text });
}

async function sendFlowTest(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const account = await getAccount(accountOrKey);
  const defaults = [
    ['ask_application', ['ask_application']],
    ['ask_info', ['ask_info']],
    ['has_info', ['known_info_preface', 'short_intro', 'offer_end']],
    ['no_info', ['unknown_info_preface', 'full_intro', 'offer_end']],
    ['application_link', ['application_link_reply']]
  ];
  const lines = [];
  for (const [stepKey, fallback] of defaults) {
    const keys = await flowTemplateKeys(account.account_key, stepKey, fallback);
    const missing = [];
    for (const key of keys) {
      if (!(await getTemplate(key, account.account_key))) missing.push(key);
    }
    lines.push(`${stepKey}: ${keys.join(', ')}${missing.length ? `\n   missing: ${missing.join(', ')}` : ''}`);
  }
  return tg('sendMessage', { chat_id: chatId, text: `Flow test: ${account.account_key}/${account.flow_key || 'info_only'}\n\n${lines.join('\n\n')}` });
}

async function sendDashboard(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const account = await getAccount(accountOrKey);
  const accounts = await getAccounts();
  const auto = await getAutoOutreach(account.account_key);
  const daily = await getDailyAuto(account.account_key);
  const autoStatus = isAutoActive(auto) ? `yoqilgan, tugaydi: ${new Date(auto.until).toLocaleString('uz-UZ')}` : 'o‘chiq';
  const today = localDateKey();
  const todayCount = await countLeads(q => q.gte('outreach_at', `${today}T00:00:00+00:00`), account.account_key);
  const read = await countLeads(q => q.eq('status', 'tanishdim'), account.account_key);
  const payment = await countLeads(q => q.eq('status', 'payment_near'), account.account_key);
  const due = (await getReminderDue(100, account.account_key)).length;
  return tg('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text:
      `<b>🏠 OLYE Bot Panel</b>\n\n` +
      `👤 Akkaunt: ${html(account.label || account.account_key)}\n` +
      `📣 Auto Outreach: ${html(autoStatus)}\n` +
      `📅 Kunlik auto: ${daily.enabled ? `yoqilgan (${daily.start_time}, ${daily.duration_hours} soat)` : 'o‘chiq'}\n` +
      `Bugungi outreach: ${todayCount} ta\n` +
      `✅ Tanishdim: ${read} ta\n` +
      `💳 To‘lovga yaqin: ${payment} ta\n` +
      `⏰ Eslatma kerak: ${due} ta`,
    reply_markup: mainMenuKeyboard(accounts.length > 1)
  });
}

function mainMenuKeyboard(showAccounts = false) {
  const rows = [
      ...(showAccounts ? [[{ text: '👤 Akkaunt tanlash', callback_data: 'accounts' }]] : []),
      [{ text: '✏️ Shablonlar', callback_data: 'templates' }],
      [{ text: '🔁 Ketma-ketlik', callback_data: 'flow_menu' }, { text: '🤖 AI sozlamalari', callback_data: 'ai_menu' }],
      [{ text: '🧠 Javob qoidalari', callback_data: 'rules_menu' }, { text: '🕵️ Arxiv', callback_data: 'archive_menu' }],
      [{ text: '📊 Diagnostika', callback_data: 'diagnostics' }, { text: '⚙️ Auto javob', callback_data: 'outreach_menu' }],
      [{ text: '📄 Ma’lumot yuborilganlar', callback_data: 'list:info_sent' }],
      [{ text: '✅ Tanishdim yozganlar', callback_data: 'list:read' }, { text: '💳 To‘lovga yaqinlar', callback_data: 'list:payment' }],
      [{ text: '⏰ Eslatma keraklar', callback_data: 'list:reminders' }, { text: '📊 Hisobot', callback_data: 'report' }]
  ];
  return { inline_keyboard: rows };
}

function outreachKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🟢 Auto javobni yoqish', callback_data: 'auto:2' }, { text: '🔴 Auto javobni o‘chirish', callback_data: 'auto:off' }],
      [{ text: '📊 Auto holati', callback_data: 'autostatus' }],
      [{ text: '🚀 Hozir 1 soat', callback_data: 'auto:1' }, { text: '🚀 Hozir 2 soat', callback_data: 'auto:2' }],
      [{ text: '🚀 Hozir 3 soat', callback_data: 'auto:3' }, { text: '⛔ Auto OFF', callback_data: 'auto:off' }],
      [{ text: '📅 Kunlik 07:00 / 2 soat', callback_data: 'daily:on_default' }],
      [{ text: '⛔ Kunlik auto OFF', callback_data: 'daily:off' }, { text: '⏸ Bugun ishlamasin', callback_data: 'daily:skip_today' }],
      [{ text: '📋 Bugungi hisobot', callback_data: 'report' }, { text: '⬅️ Menyu', callback_data: 'menu' }]
    ]
  };
}

async function sendOutreachMenu(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const account = await getAccount(accountOrKey);
  const auto = await getAutoOutreach(account.account_key);
  const daily = await getDailyAuto(account.account_key);
  return tg('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text:
      `<b>📣 Outreach boshqaruvi</b>\n\n` +
      `Akkaunt: ${html(account.label || account.account_key)}\n` +
      `Hozirgi auto: ${isAutoActive(auto) ? `yoqilgan, tugaydi ${new Date(auto.until).toLocaleString('uz-UZ')}` : 'o‘chiq'}\n` +
      `Kunlik auto: ${daily.enabled ? `yoqilgan — ${daily.start_time}, ${daily.duration_hours} soat` : 'o‘chiq'}\n` +
      `Bugun skip: ${daily.skip_date === localDateKey() ? 'ha' : 'yo‘q'}`,
    reply_markup: outreachKeyboard()
  });
}

const COMMAND_ALIASES_UZ = new Map(Object.entries({
  '/menyu': '/menu',
  '/boshlash': '/start',
  '/bekor': '/cancel',
  '/kimman': '/whoami',
  '/menireset': '/resetme',
  '/akkauntlar': '/accounts',
  '/akkaunt': '/account',
  '/akkauntholati': '/accountstatus',
  '/ulanishlar': '/connections',
  '/ulanishbiriktir': '/bindconnection',
  '/akkauntsozla': '/setaccount',
  '/sozlamasozla': '/setsetting',
  '/akkauntadmin': '/accountadmin',
  '/akkauntniyoq': '/accounton',
  '/akkauntochir': '/accountoff',
  '/sozlamalar': '/settings',
  '/suniyintellekt': '/ai',
  '/aiholati': '/aistatus',
  '/qoidatest': '/testrule',
  '/aitest': '/testai',
  '/aishablon': '/aitemplate',
  '/ketmaketlik': '/flow',
  '/ketmaketliktest': '/flowtest',
  '/ketmaketliksozla': '/setflow',
  '/avtoyoq': '/autoon',
  '/avtoochir': '/autooff',
  '/avtoholat': '/autostatus',
  '/avto': '/auto',
  '/kunliksozla': '/setdaily',
  '/kunlikochir': '/dailyoff',
  '/kunlikholat': '/dailystatus',
  '/hisobot': '/report',
  '/kunlikhisobot': '/dailyreport',
  '/haftalikhisobot': '/weeklyreport',
  '/barchahisobot': '/reportall',
  '/malumot': '/info',
  '/oqilganlar': '/read',
  '/tanishdim': '/read',
  '/tolov': '/payment',
  '/eslatmalar': '/reminders',
  '/kutilayotgan': '/pending',
  '/shablonholati': '/healthtemplates',
  '/diagnostika': '/diagnostics',
  '/tekshir': '/tick',
  '/arxiv': '/archive',
  '/ochirilgan': '/deleted',
  '/tahrirlangan': '/edited',
  '/mediaarxiv': '/media',
  '/chatarxiv': '/archivechat',
  '/arxivdebug': '/archive_debug',
  '/arxivyo_debug': '/archive_route_debug',
  '/arxivyoldebug': '/archive_route_debug',
  '/testxabar': '/testnotify',
  '/shablonol': '/gettemplate',
  '/shablonsozla': '/settemplate',
  '/lidochir': '/leadsoff',
  '/lidyoq': '/leadson',
  '/qaytaboshla': '/reset',
  '/holat': '/status'
}));

function normalizeCommandWord(word = '') {
  const lower = String(word || '').toLowerCase();
  return COMMAND_ALIASES_UZ.get(lower) || lower;
}

function normalizeCommandArg(arg = '') {
  const value = String(arg || '').toLowerCase();
  if (['yoq', 'yoqish', 'yoqildi', 'ha', 'on'].includes(value)) return 'on';
  if (['ochir', 'ochirish', "o'chir", 'o‘chir', 'off'].includes(value)) return 'off';
  if (['bugun', 'today'].includes(value)) return 'today';
  return arg;
}

function normalizeAdminCommand(rawText = '') {
  const trimmed = String(rawText || '').trim();
  if (!trimmed.startsWith('/')) return trimmed;
  const [first, ...rest] = trimmed.split(/\s+/);
  const command = normalizeCommandWord(first);
  const normalizedRest = [...rest];
  if (['/ai', '/auto'].includes(command) && normalizedRest[0]) {
    normalizedRest[0] = normalizeCommandArg(normalizedRest[0]);
  }
  return [command, ...normalizedRest].join(' ').trim();
}

// -------------------- Admin commands --------------------
async function handleAdminMessage(msg) {
  const chatId = String(msg.chat?.id || '');
  const text = normalizeAdminCommand(msg.text || '');
  if (!text) return;
  const selectedAccountKey = await getSelectedAccountKey(chatId);
  const session = await getAdminSession(chatId);

  if (text === '/cancel') {
    await setAdminSession(chatId, 'account_selected', { selected_account_key: selectedAccountKey });
    return tg('sendMessage', { chat_id: chatId, text: 'Bekor qilindi.' });
  }

  if (session?.mode === 'template_edit_input' && !text.startsWith('/')) {
    const payload = session.payload || {};
    return showTemplateEditPreview(chatId, payload.selected_account_key || selectedAccountKey, payload.template_key, text);
  }

  if (session?.mode === 'ai_template_input' && !text.startsWith('/')) {
    const payload = session.payload || {};
    return showAiTemplatePreview(chatId, payload.selected_account_key || selectedAccountKey, payload.template_key, text);
  }

  if (text === '/start' || text === '/menu') return sendDashboard(chatId, selectedAccountKey);
  if (text === '/whoami') return replyWhoami(msg, 'message');
  if (text === '/resetme') {
    await resetMeChat({ chatId, from: msg.from, accountKey: selectedAccountKey });
    return tg('sendMessage', { chat_id: chatId, text: '✅ Test profilingiz tozalandi. Endi qayta test qilishingiz mumkin.' });
  }

  if (text === '/accounts') return sendAccountsMenu(chatId);
  if (text === '/connections') return sendConnections(chatId);
  if (text.startsWith('/account ')) {
    const key = text.split(/\s+/)[1];
    const accounts = await getAccounts();
    const account = accounts.find(a => a.account_key === key);
    if (!account) return tg('sendMessage', { chat_id: chatId, text: `Topilmadi: ${key}` });
    await setSelectedAccountKey(chatId, key);
    return tg('sendMessage', { chat_id: chatId, text: `✅ Akkaunt tanlandi: ${account.label || account.account_key}` });
  }
  if (text.startsWith('/bindconnection ')) {
    const [, ak, businessConnectionId] = text.split(/\s+/);
    if (!ak || !businessConnectionId) return tg('sendMessage', { chat_id: chatId, text: 'Format: /bindconnection ACCOUNT_KEY BUSINESS_CONNECTION_ID' });
    const account = await getAccount(ak);
    if (account.account_key !== ak) return tg('sendMessage', { chat_id: chatId, text: `Akkaunt topilmadi: ${ak}` });
    await bindBusinessConnectionToAccount(account, businessConnectionId);
    return tg('sendMessage', { chat_id: chatId, text: `✅ Bog‘landi: ${businessConnectionId} → ${ak}` });
  }
  if (text.startsWith('/setaccount ')) {
    const [, ak, field, ...rest] = text.split(/\s+/);
    const value = rest.join(' ');
    if (!ak || !field || !value) return tg('sendMessage', { chat_id: chatId, text: 'Format: /setaccount ACCOUNT_KEY FIELD VALUE' });
    try {
      const account = await setAccountField(ak, field, value);
      return tg('sendMessage', { chat_id: chatId, text: `✅ Saqlandi: ${account.account_key}.${field} = ${value}` });
    } catch (err) {
      return tg('sendMessage', { chat_id: chatId, text: `⚠️ ${err.message}` });
    }
  }
  if (text.startsWith('/setsetting ')) {
    const [, ak, key, ...rest] = text.split(/\s+/);
    const value = rest.join(' ');
    if (!ak || !key || !value) return tg('sendMessage', { chat_id: chatId, text: 'Format: /setsetting ACCOUNT_KEY KEY VALUE' });
    if (key === 'ai_intent_enabled') {
      await setAccountAiEnabled(ak, Boolean(parseSettingValue(value)));
      return tg('sendMessage', { chat_id: chatId, text: `✅ ${ak}.${key} = ${value}` });
    }
    try {
      const account = await setAccountField(ak, key, value);
      return tg('sendMessage', { chat_id: chatId, text: `✅ Saqlandi: ${account.account_key}.${key} = ${value}` });
    } catch (err) {
      return tg('sendMessage', { chat_id: chatId, text: `⚠️ ${err.message}` });
    }
  }
  if (text.startsWith('/accountadmin ')) {
    const [, ak, telegramId] = text.split(/\s+/);
    if (!ak || !telegramId) return tg('sendMessage', { chat_id: chatId, text: 'Format: /accountadmin ACCOUNT_KEY TELEGRAM_ID' });
    await upsertAccountPatch(ak, { admin_chat_id: String(telegramId) });
    return tg('sendMessage', { chat_id: chatId, text: `✅ Admin belgilandi: ${ak} → ${telegramId}` });
  }
  if (text.startsWith('/accounton ')) {
    const ak = text.split(/\s+/)[1];
    await upsertAccountPatch(ak, { bot_enabled: true, auto_reply_enabled: true });
    return tg('sendMessage', { chat_id: chatId, text: `✅ Akkaunt yoqildi: ${ak}` });
  }
  if (text.startsWith('/accountoff ')) {
    const ak = text.split(/\s+/)[1];
    await upsertAccountPatch(ak, { bot_enabled: false, auto_reply_enabled: false });
    return tg('sendMessage', { chat_id: chatId, text: `⛔ Akkaunt o‘chirildi: ${ak}` });
  }
  if (text === '/accountstatus') return sendAccountStatus(chatId, selectedAccountKey);
  if (text.startsWith('/ai ')) {
    const parts = text.split(/\s+/);
    const accounts = await getAccounts();
    const maybeAccount = accounts.find(a => a.account_key === parts[1]);
    const targetAccount = maybeAccount ? parts[1] : selectedAccountKey;
    const mode = maybeAccount ? parts[2] : parts[1];
    if (mode === 'on') {
      await setAccountAiEnabled(targetAccount, true);
      return tg('sendMessage', { chat_id: chatId, text: `✅ AI intent yoqildi: ${targetAccount}` });
    }
    if (mode === 'off') {
      await setAccountAiEnabled(targetAccount, false);
      return tg('sendMessage', { chat_id: chatId, text: `⛔ AI intent o‘chirildi: ${targetAccount}` });
    }
  }
  if (text === '/aistatus' || text.startsWith('/aistatus ')) {
    const parsed = await parseOptionalAccountArg(text.split(/\s+/), selectedAccountKey);
    const enabled = await getAccountAiEnabled(parsed.accountKey);
    return tg('sendMessage', { chat_id: chatId, text: `AI status\nAkkaunt: ${parsed.accountKey}\nEnv enabled: ${AI_INTENT_ENABLED ? 'true' : 'false'}\nOPENAI_API_KEY: ${OPENAI_API_KEY ? 'bor' : 'yo‘q'}\nAccount AI: ${enabled ? 'ON' : 'OFF'}\nModel: ${OPENAI_MODEL}` });
  }
  if (text.startsWith('/testrule ')) {
    const [, ak, stepKey, ...rest] = text.split(/\s+/);
    const sample = rest.join(' ');
    return tg('sendMessage', { chat_id: chatId, text: `Rule test\nAkkaunt: ${ak}\nStep: ${stepKey}\nText: ${sample}\nIntent: ${classify(sample, stepKey)}` });
  }
  if (text.startsWith('/testai ')) {
    const [, ak, stepKey, ...rest] = text.split(/\s+/);
    const sample = rest.join(' ');
    const fakeLead = { account_key: ak, chat_id: 'test', stage: stepKey, last_bot_message: '', last_admin_message: '' };
    const decision = await classifyWithAI(fakeLead, sample, classify(sample, stepKey));
    return tg('sendMessage', { chat_id: chatId, text: `AI test\n${JSON.stringify(decision || { ok: false, reason: 'AI unavailable' }, null, 2)}` });
  }
  if (text.startsWith('/aitemplate ')) {
    const rest = text.replace('/aitemplate ', '');
    const accounts = await getAccounts();
    const [first, second] = rest.split(/\s+/, 2);
    const maybeAccount = accounts.find(a => a.account_key === first);
    const templateAccountKey = maybeAccount ? first : selectedAccountKey;
    const templateKey = maybeAccount ? second : first;
    const prefix = maybeAccount ? `${first} ${second}` : first;
    const rough = rest.slice(prefix.length).trim();
    if (!templateKey || !rough) return tg('sendMessage', { chat_id: chatId, text: 'Format: /aitemplate TEMPLATE_KEY text yoki /aitemplate ACCOUNT_KEY TEMPLATE_KEY text' });
    return showAiTemplatePreview(chatId, templateAccountKey, templateKey, rough);
  }
  if (text === '/flow') return sendFlow(chatId, selectedAccountKey);
  if (text.startsWith('/flow ')) return sendFlow(chatId, text.split(/\s+/)[1]);
  if (text.startsWith('/flowtest ')) return sendFlowTest(chatId, text.split(/\s+/)[1]);
  if (text.startsWith('/setflow ')) {
    const [, ak, stepKey, templateKey, nextYes, nextNo, nextPartial, nextUnknown, stopAfterSend] = text.split(/\s+/);
    if (!ak || !stepKey || !templateKey) {
      return tg('sendMessage', { chat_id: chatId, text: 'Format: /setflow ACCOUNT_KEY STEP_KEY TEMPLATE_KEY NEXT_YES NEXT_NO NEXT_PARTIAL NEXT_UNKNOWN STOP_TRUE_FALSE' });
    }
    await upsertFlowStep({
      accountKey: ak,
      stepKey,
      templateKey,
      nextYes,
      nextNo,
      nextPartial,
      nextUnknown,
      stopAfterSend
    });
    return tg('sendMessage', { chat_id: chatId, text: `✅ Flow step saqlandi: ${ak}/${stepKey}` });
  }

  if (text === '/autoon') return autoOn(chatId, AUTO_OUTREACH_DEFAULT_HOURS, selectedAccountKey);
  if (text === '/autooff' || text.startsWith('/autooff ')) {
    const parts = text.split(/\s+/);
    const parsed = await parseOptionalAccountArg(parts, selectedAccountKey);
    return autoOff(chatId, parsed.accountKey);
  }
  if (text === '/autostatus' || text.startsWith('/autostatus ')) {
    const parts = text.split(/\s+/);
    const parsed = await parseOptionalAccountArg(parts, selectedAccountKey);
    return autoStatus(chatId, parsed.accountKey);
  }

  if (text === '/auto' || text.startsWith('/auto ')) {
    const parts = text.split(/\s+/);
    const parsed = await parseOptionalAccountArg(parts, selectedAccountKey);
    const arg = parts[parsed.nextIndex] || `${AUTO_OUTREACH_DEFAULT_HOURS}h`;
    if (arg === 'off') return autoOff(chatId, parsed.accountKey);
    if (arg === 'today') {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const hours = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 3600000));
      return autoOn(chatId, hours, parsed.accountKey);
    }
    const hours = Number(String(arg).replace('h', '')) || AUTO_OUTREACH_DEFAULT_HOURS;
    return autoOn(chatId, hours, parsed.accountKey);
  }

  if (text === '/settings') return sendSettings(chatId, selectedAccountKey);
  if (text.startsWith('/settings ')) return sendSettings(chatId, text.split(/\s+/)[1]);
  if (text === '/report') return sendReport(chatId, selectedAccountKey);
  if (text.startsWith('/report ')) return sendArchiveReport(chatId, text.split(/\s+/)[1], '📊 Hisobot');
  if (text === '/dailyreport' || text.startsWith('/dailyreport ')) return sendArchiveReport(chatId, text.split(/\s+/)[1] || selectedAccountKey, '📊 Kunlik hisobot');
  if (text === '/weeklyreport' || text.startsWith('/weeklyreport ')) return sendArchiveReport(chatId, text.split(/\s+/)[1] || selectedAccountKey, '📊 Haftalik hisobot');
  if (text === '/reportall') return sendReportAll(chatId);
  if (text === '/info') return sendList(chatId, 'info_sent', selectedAccountKey);
  if (text === '/read') return sendList(chatId, 'read', selectedAccountKey);
  if (text === '/payment') return sendList(chatId, 'payment', selectedAccountKey);
  if (text === '/reminders') return sendList(chatId, 'reminders', selectedAccountKey);
  if (text === '/pending') return sendList(chatId, 'pending', selectedAccountKey);
  if (text === '/healthtemplates') return healthTemplates(chatId, selectedAccountKey);
  if (text === '/diagnostics') return diagnostics(chatId, selectedAccountKey);
  if (text === '/archive') return sendArchiveMenu(chatId);
  if (text.startsWith('/archive ')) return sendArchivePeopleMenu(chatId, text.split(/\s+/)[1]);
  if (text === '/deleted' || text.startsWith('/deleted ')) return sendArchiveList(chatId, 'deleted', text.split(/\s+/)[1] || selectedAccountKey);
  if (text === '/edited' || text.startsWith('/edited ')) return sendArchiveList(chatId, 'edited', text.split(/\s+/)[1] || selectedAccountKey);
  if (text === '/media' || text.startsWith('/media ')) return sendArchiveList(chatId, 'media', text.split(/\s+/)[1] || selectedAccountKey);
  if (text === '/archive_route_debug') return sendArchiveDebug(chatId, ['/archive_debug', selectedAccountKey], selectedAccountKey);
  if (text.startsWith('/archive_debug ')) return sendArchiveDebug(chatId, text.split(/\s+/), selectedAccountKey);
  if (text.startsWith('/archivechat ')) {
    const parts = text.split(/\s+/);
    const accounts = await getAccounts();
    const maybeAccount = accounts.find(a => a.account_key === parts[1]);
    return sendArchiveList(chatId, 'chat', maybeAccount ? parts[1] : selectedAccountKey, maybeAccount ? parts[2] : parts[1]);
  }
  if (text.startsWith('/testnotify ')) {
    const [, ak, kind] = text.split(/\s+/);
    const account = await getAccount(ak);
    if (account.account_key !== ak) return tg('sendMessage', { chat_id: chatId, text: `Akkaunt topilmadi: ${ak}` });
    const fakeBase = {
      account_key: account.account_key,
      business_connection_id: 'test_connection',
      chat_id: 'test_chat',
      message_id: 1,
      from_username: 'Anisjon_Abdullayev',
      from_first_name: 'Anisjon',
      message_type: kind === 'deleted_photo' ? 'photo' : 'text',
      text: kind === 'deleted_photo' ? null : 'Hsbs',
      caption: null,
      last_event_type: kind?.startsWith('deleted') ? 'deleted' : 'edited'
    };
    if (kind === 'edited') {
      await notifyEditedMessage(account, { ...fakeBase, text: 'Hsbs' }, { ...fakeBase, text: 'Hsdhjjy' }, 'testnotify');
    } else if (kind === 'deleted_photo') {
      await notifyDeletedMessage(account, fakeBase, 'testnotify');
    } else {
      await notifyDeletedMessage(account, { ...fakeBase, text: 'O‘chirilgan test xabar' }, 'testnotify');
    }
    return tg('sendMessage', { chat_id: chatId, text: `✅ Test notification yuborildi: ${account.account_key}/${kind || 'deleted'}` });
  }
  if (text === '/tick') return manualTick(chatId);

  if (text.startsWith('/setdaily ')) {
    const parts = text.split(/\s+/);
    const parsed = await parseOptionalAccountArg(parts, selectedAccountKey);
    const start = parts[parsed.nextIndex];
    const durationRaw = parts[parsed.nextIndex + 1];
    const hours = Number(String(durationRaw || '').replace('h', '')) || DAILY_DEFAULT_DURATION_HOURS;
    const daily = await setDailyAuto({ enabled: true, start_time: start || DAILY_DEFAULT_START, duration_hours: hours, skip_date: null }, parsed.accountKey);
    return tg('sendMessage', { chat_id: chatId, text: `✅ Kunlik Auto Outreach sozlandi\n\nHar kuni: ${daily.start_time}\nDavomiylik: ${daily.duration_hours} soat` });
  }
  if (text === '/dailyoff' || text.startsWith('/dailyoff ')) {
    const parsed = await parseOptionalAccountArg(text.split(/\s+/), selectedAccountKey);
    await setDailyAuto({ enabled: false }, parsed.accountKey);
    return tg('sendMessage', { chat_id: chatId, text: '⛔ Kunlik Auto Outreach o‘chirildi.' });
  }
  if (text === '/dailystatus' || text.startsWith('/dailystatus ')) {
    const parsed = await parseOptionalAccountArg(text.split(/\s+/), selectedAccountKey);
    return dailyStatus(chatId, parsed.accountKey);
  }

  if (text.startsWith('/gettemplate ')) {
    const parts = text.split(/\s+/);
    const accounts = await getAccounts();
    const maybeAccount = accounts.find(a => a.account_key === parts[1]);
    const templateAccountKey = maybeAccount ? parts[1] : selectedAccountKey;
    const key = maybeAccount ? parts[2] : parts[1];
    const body = await getTemplate(key, templateAccountKey);
    return tg('sendMessage', { chat_id: chatId, text: body ? `Template: ${templateAccountKey}/${key}\n\n${body}` : `Topilmadi: ${templateAccountKey}/${key}` });
  }
  if (text.startsWith('/settemplate ')) {
    const rest = text.replace('/settemplate ', '');
    const accounts = await getAccounts();
    const [first, second] = rest.split(/\s+/, 2);
    const maybeAccount = accounts.find(a => a.account_key === first);
    const templateAccountKey = maybeAccount ? first : selectedAccountKey;
    const key = maybeAccount ? second : first;
    const prefix = maybeAccount ? `${first} ${second}` : first;
    const body = rest.slice(prefix.length).trim();
    if (!key || !body) return tg('sendMessage', { chat_id: chatId, text: 'Format: /settemplate key yangi matn yoki /settemplate account_key key yangi matn' });
    await setTemplate(key, body, templateAccountKey);
    return tg('sendMessage', { chat_id: chatId, text: `✅ ${templateAccountKey}/${key} yangilandi.` });
  }

  if (text.startsWith('/leadsoff ')) {
    const id = text.split(/\s+/)[1];
    await updateLead(id, { stage: STAGE.DISABLED, status: 'disabled', bot_enabled: false }, selectedAccountKey);
    return tg('sendMessage', { chat_id: chatId, text: `🔕 ${id} o‘chirildi.` });
  }
  if (text.startsWith('/leadson ')) {
    const id = text.split(/\s+/)[1];
    await updateLead(id, { status: 'active', bot_enabled: true }, selectedAccountKey);
    return tg('sendMessage', { chat_id: chatId, text: `🔔 ${id} yoqildi.` });
  }
  if (text.startsWith('/reset ')) {
    const id = text.split(/\s+/)[1];
    await accountLeadFilter(supabase.from('sent_actions').delete().eq('chat_id', String(id)), selectedAccountKey);
    await updateLead(id, { stage: STAGE.OUTREACH_SENT, status: 'active', bot_enabled: true, finished_at: null }, selectedAccountKey);
    return tg('sendMessage', { chat_id: chatId, text: `🔁 ${id} reset qilindi. Keyingi xabarida bot ask_application’dan boshlaydi.` });
  }
  if (text.startsWith('/status ')) {
    const id = text.split(/\s+/)[1];
    const lead = await getLead(id, selectedAccountKey);
    return tg('sendMessage', { chat_id: chatId, text: lead ? await leadCardText(lead) : 'Topilmadi.' });
  }

  return sendDashboard(chatId, selectedAccountKey);
}

async function autoOn(chatId, hours, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const account = await getAccount(accountOrKey);
  const value = await enableAutoOutreach(hours, 'manual', account.account_key);
  return tg('sendMessage', {
    chat_id: chatId,
    text: `✅ Auto Reply / Auto Outreach ${hours} soatga yoqildi.\n\nAkkaunt: ${account.label || account.account_key}\nTugash vaqti: ${new Date(value.until).toLocaleString('uz-UZ')}\nSession: ${value.session_id}\n\nShu vaqt ichida siz yozgan “Assalomu alaykum...” xabarlari eslab qolinadi va faqat shu sessiondagi lidlarga bot avtomatik javob beradi.`
  });
}

async function autoOff(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  await disableAutoOutreach(false, accountOrKey);
  return tg('sendMessage', { chat_id: chatId, text: '⛔ Auto Reply / Auto Outreach o‘chirildi.' });
}

async function autoStatus(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const account = await getAccount(accountOrKey);
  const auto = await getAutoOutreach(account.account_key);
  const count = isAutoActive(auto) && auto.session_id
    ? await countLeads(q => q.eq('outreach_session_id', auto.session_id), account.account_key)
    : 0;
  const text = isAutoActive(auto)
    ? `📣 Auto Reply: ON\nAkkaunt: ${account.label || account.account_key}\nTugash vaqti: ${new Date(auto.until).toLocaleString('uz-UZ')}\nActive session: ${auto.session_id}\nShu sessiondagi outreach: ${count} ta`
    : `📣 Auto Reply: OFF\nAkkaunt: ${account.label || account.account_key}\nActive session: ${auto?.session_id || '-'}`;
  return tg('sendMessage', { chat_id: chatId, text });
}

async function dailyStatus(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const daily = await getDailyAuto(accountOrKey);
  return tg('sendMessage', {
    chat_id: chatId,
    text: `📅 Kunlik Auto Outreach\n\nHolat: ${daily.enabled ? 'yoqilgan' : 'o‘chiq'}\nStart: ${daily.start_time}\nDavomiylik: ${daily.duration_hours} soat\nBugun skip: ${daily.skip_date === localDateKey() ? 'ha' : 'yo‘q'}\nOxirgi start: ${daily.last_started_date || '-'}`
  });
}

async function sendReport(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const auto = await getAutoOutreach(accountOrKey);
  if (auto?.session_id) return sendAutoSessionReport(chatId, auto, false, accountOrKey);
  const stages = [STAGE.OUTREACH_SENT, STAGE.ASKED_APPLICATION, STAGE.ASKED_INFO, STAGE.INFO_SENT_FINISHED, STAGE.PENDING_APPROVAL, STAGE.PAUSED, STAGE.DISABLED];
  const parts = [];
  for (const st of stages) {
    parts.push(`${st}: ${await countLeads(q => q.eq('stage', st), accountOrKey)}`);
  }
  return tg('sendMessage', { chat_id: chatId, text: `📊 Hisobot\n\n${parts.join('\n')}` });
}

async function countArchive(apply, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  let q = supabase.from('message_archive').select('*', { count: 'exact', head: true });
  q = archiveAccountFilter(q, accountOrKey);
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) {
    console.error('countArchive:', error.message);
    return 0;
  }
  return count || 0;
}

async function countUniqueArchiveChats(accountOrKey = DEFAULT_ACCOUNT_KEY) {
  let q = supabase.from('message_archive').select('chat_id').limit(10000);
  q = archiveAccountFilter(q, accountOrKey);
  const { data, error } = await q;
  if (error) {
    console.error('countUniqueArchiveChats:', error.message);
    return 0;
  }
  return new Set((data || []).map(r => String(r.chat_id))).size;
}

async function sendArchiveReport(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY, title = '📊 Kunlik hisobot') {
  const account = await getAccount(accountOrKey);
  const total = await countArchive(null, account.account_key);
  const incoming = await countArchive(q => q.eq('direction', 'incoming'), account.account_key);
  const outgoing = await countArchive(q => q.eq('direction', 'outgoing'), account.account_key);
  const edited = await countArchive(q => q.gt('edit_count', 0), account.account_key);
  const deleted = await countArchive(q => q.eq('delete_detected', true), account.account_key);
  const deletedPhotos = await countArchive(q => q.eq('delete_detected', true).eq('message_type', 'photo'), account.account_key);
  const deletedVoice = await countArchive(q => q.eq('delete_detected', true).eq('message_type', 'voice'), account.account_key);
  const deletedVideoNotes = await countArchive(q => q.eq('delete_detected', true).eq('message_type', 'video_note'), account.account_key);
  const deletedDocs = await countArchive(q => q.eq('delete_detected', true).eq('message_type', 'document'), account.account_key);
  const uniqueChats = await countUniqueArchiveChats(account.account_key);
  const autoStarted = await countLeads(q => q.eq('outreach_sent', true), account.account_key);
  const humanNeeded = await countLeads(q => q.in('status', ['needs_admin', 'pending_approval']), account.account_key);

  return tg('sendMessage', {
    chat_id: chatId,
    text:
      `${title}\n\n` +
      `Akkaunt: ${account.label || account.account_key}\n` +
      `Jami arxiv xabarlar: ${total}\n` +
      `Incoming: ${incoming}\n` +
      `Outgoing: ${outgoing}\n` +
      `Tahrirlangan: ${edited}\n` +
      `O‘chirilgan: ${deleted}\n` +
      `O‘chirilgan rasm: ${deletedPhotos}\n` +
      `O‘chirilgan ovozli: ${deletedVoice}\n` +
      `O‘chirilgan dumaloq video: ${deletedVideoNotes}\n` +
      `O‘chirilgan fayl: ${deletedDocs}\n` +
      `Unique chatlar: ${uniqueChats}\n` +
      `Active chatlar: ${await countLeads(q => q.eq('status', 'active'), account.account_key)}\n` +
      `Auto reply started: ${autoStarted}\n` +
      `Human needed: ${humanNeeded}`
  });
}

async function sendReportAll(chatId) {
  const accounts = (await getAccounts()).filter(a => a.account_key !== UNKNOWN_ACCOUNT_KEY);
  const lines = [];
  for (const account of accounts) {
    lines.push(`${account.label || account.account_key}: ${await countArchive(null, account.account_key)} arxiv, ${await countLeads(null, account.account_key)} lead`);
  }
  return tg('sendMessage', { chat_id: chatId, text: `📊 Barcha akkauntlar\n\n${lines.join('\n') || 'Akkaunt yo‘q.'}` });
}

async function sendSettings(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const account = await getAccount(accountOrKey);
  const ai = await getAccountAiEnabled(account.account_key);
  return tg('sendMessage', {
    chat_id: chatId,
    text:
      `⚙️ Sozlamalar\n\n` +
      `Akkaunt: ${account.label || account.account_key}\n` +
      `bot_enabled: ${account.bot_enabled ? 'ON' : 'OFF'}\n` +
      `auto_reply_enabled: ${account.auto_reply_enabled ? 'ON' : 'OFF'}\n` +
      `archive_enabled: ${account.archive_enabled ? 'ON' : 'OFF'}\n` +
      `archive_notify_enabled: ${account.archive_notify_enabled ? 'ON' : 'OFF'}\n` +
      `reports_enabled: ${account.reports_enabled ? 'ON' : 'OFF'}\n` +
      `media_archive_enabled: ${account.media_archive_enabled ? 'ON' : 'OFF'}\n` +
      `media_archive_download: ${account.media_archive_download ? 'ON' : 'OFF'}\n` +
      `media_archive_max_bytes: ${account.media_archive_max_bytes}\n` +
      `storage_bucket: ${account.storage_bucket || '-'}\n` +
      `timezone: ${account.timezone || '-'}\n` +
      `daily_report_time: ${account.daily_report_time || '18:00'}\n` +
      `AI intent: ${ai ? 'ON' : 'OFF'}\n\n` +
      `O‘zgartirish: /setsetting ${account.account_key} KEY VALUE`
  });
}

async function healthTemplates(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const keys = ['ask_application', 'ask_info', 'known_info_preface', 'unknown_info_preface', 'short_intro', 'full_intro', 'offer_end', 'application_link_reply', 'clarify_application', 'media_text_request', 'offer_followup'];
  const missing = [];
  for (const k of keys) if (!(await getTemplate(k, accountOrKey))) missing.push(k);
  return tg('sendMessage', { chat_id: chatId, text: missing.length ? `⚠️ Yetishmayotgan template:\n${missing.join('\n')}` : '✅ Barcha kerakli template mavjud.' });
}

async function diagnostics(chatId, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const account = await getAccount(accountOrKey);
  const auto = await getAutoOutreach(account.account_key);
  const daily = await getDailyAuto(account.account_key);
  const lastIgnore = await getLastIgnoreReason(null, account.account_key);
  const activeCount = isAutoActive(auto) && auto.session_id
    ? await countLeads(q => q.eq('outreach_session_id', auto.session_id), account.account_key)
    : 0;
  const missing = [];
  for (const k of ['ask_application', 'ask_info', 'full_intro', 'offer_end', 'offer_followup']) if (!(await getTemplate(k, account.account_key))) missing.push(k);
  return tg('sendMessage', {
    chat_id: chatId,
    text:
      `🩺 Bot holati\n\n` +
      `Akkaunt: ${account.label || account.account_key}\n` +
      `Project: ${account.project_name || '-'}\n` +
      `Webhook: /webhook-info orqali tekshiring\n` +
      `Supabase: ok\n` +
      `Auto Reply: ${isAutoActive(auto) ? 'ON' : 'OFF'}\n` +
      `Active outreach session: ${auto?.session_id || '-'}\n` +
      `Active session outreach: ${activeCount} ta\n` +
      `Kunlik timer: ${daily.enabled ? 'yoqilgan' : 'o‘chiq'}\n` +
      `Local vaqt: ${localHHMM()}\n` +
      `Last ignore reason: ${lastIgnore ? `${lastIgnore.event_type} (${lastIgnore.chat_id})` : '-'}\n` +
      `Template missing: ${missing.length ? missing.join(', ') : 'yo‘q'}`
  });
}

async function manualTick(chatId) {
  await runSchedulerTick('manual');
  return tg('sendMessage', { chat_id: chatId, text: '✅ Tick bajarildi.' });
}

async function handleCallback(cb) {
  const data = cb.data || '';
  const chatId = cb.message?.chat?.id;
  await answerCallback(cb.id);
  if (!chatId) return;
  const selectedAccountKey = await getSelectedAccountKey(chatId);

  if (data === 'menu' || data === 'noop') return sendDashboard(chatId, selectedAccountKey);
  if (data === 'accounts') return sendAccountsMenu(chatId);
  if (data === 'archive_menu') return sendArchiveMenu(chatId);
  if (data.startsWith('archa:')) return sendArchivePeopleMenu(chatId, data.split(':')[1]);
  if (data.startsWith('archp:')) {
    const [, ak, targetChatId] = data.split(':');
    return sendArchivePersonEvents(chatId, ak, targetChatId);
  }
  if (data.startsWith('archv:')) {
    const [, ak, archiveId] = data.split(':');
    return sendArchiveFullDetail(chatId, ak, archiveId);
  }
  if (data === 'archive:deleted') return sendArchiveList(chatId, 'deleted', selectedAccountKey);
  if (data === 'archive:edited') return sendArchiveList(chatId, 'edited', selectedAccountKey);
  if (data === 'archive:media') return sendArchiveList(chatId, 'media', selectedAccountKey);
  if (data === 'archive:search_help') return tg('sendMessage', { chat_id: chatId, text: 'Chat bo‘yicha qidirish:\n/archivechat CHAT_ID' });
  if (data.startsWith('account:')) {
    const key = data.split(':')[1];
    const account = await getAccount(key);
    await setSelectedAccountKey(chatId, account.account_key);
    return tg('sendMessage', { chat_id: chatId, text: `✅ Akkaunt tanlandi: ${account.label || account.account_key}` });
  }
  if (data === 'outreach_menu') return sendOutreachMenu(chatId, selectedAccountKey);
  if (data === 'flow_menu') return sendFlow(chatId, selectedAccountKey);
  if (data === 'ai_menu') {
    const enabled = await getAccountAiEnabled(selectedAccountKey);
    return tg('sendMessage', { chat_id: chatId, text: `Joriy akkaunt: ${accountDisplayLabel(selectedAccountKey)}\n\n🤖 AI sozlamalari\nAI intent: ${enabled ? 'ON' : 'OFF'}\nModel: ${OPENAI_MODEL}\nOPENAI_API_KEY: ${OPENAI_API_KEY ? 'bor' : 'yo‘q'}` });
  }
  if (data === 'rules_menu') return tg('sendMessage', { chat_id: chatId, text: `Joriy akkaunt: ${accountDisplayLabel(selectedAccountKey)}\n\n🧠 Javob qoidalari\nTekshirish: /testrule ${selectedAccountKey} STEP_KEY TEXT\nAI test: /testai ${selectedAccountKey} STEP_KEY TEXT` });
  if (data === 'autostatus') return autoStatus(chatId, selectedAccountKey);
  if (data.startsWith('auto:')) {
    const arg = data.split(':')[1];
    if (arg === 'off') return autoOff(chatId, selectedAccountKey);
    return autoOn(chatId, Number(arg) || AUTO_OUTREACH_DEFAULT_HOURS, selectedAccountKey);
  }
  if (data === 'daily:on_default') {
    await setDailyAuto({ enabled: true, start_time: DAILY_DEFAULT_START, duration_hours: DAILY_DEFAULT_DURATION_HOURS, skip_date: null }, selectedAccountKey);
    return tg('sendMessage', { chat_id: chatId, text: `✅ Kunlik auto yoqildi: ${DAILY_DEFAULT_START}, ${DAILY_DEFAULT_DURATION_HOURS} soat` });
  }
  if (data === 'daily:off') {
    await setDailyAuto({ enabled: false }, selectedAccountKey);
    return tg('sendMessage', { chat_id: chatId, text: '⛔ Kunlik auto o‘chirildi.' });
  }
  if (data === 'daily:skip_today') {
    await setDailyAuto({ skip_date: localDateKey() }, selectedAccountKey);
    return tg('sendMessage', { chat_id: chatId, text: '⏸ Bugungi kun uchun auto outreach o‘chirildi. Ertaga yana odatdagidek ishlaydi.' });
  }
  if (data === 'report') return sendReport(chatId, selectedAccountKey);
  if (data === 'diagnostics') return diagnostics(chatId, selectedAccountKey);
  if (data === 'templates') return sendTemplatesMenu(chatId, selectedAccountKey);
  if (data.startsWith('tpl:')) return sendTemplateActions(chatId, data.split(':')[1], selectedAccountKey);
  if (data.startsWith('tpl_view:')) {
    const key = data.split(':')[1];
    const body = await getTemplate(key, selectedAccountKey);
    return tg('sendMessage', { chat_id: chatId, text: body ? `Template: ${selectedAccountKey}/${key}\n\n${body}` : `Topilmadi: ${selectedAccountKey}/${key}` });
  }
  if (data.startsWith('tpl_edit:')) {
    const key = data.split(':')[1];
    return startTemplateEdit(chatId, selectedAccountKey, key);
  }
  if (data.startsWith('tpl_ai:')) {
    const key = data.split(':')[1];
    await setAdminSession(chatId, 'ai_template_input', { selected_account_key: selectedAccountKey, template_key: key });
    return tg('sendMessage', { chat_id: chatId, text: `Joriy akkaunt: ${accountDisplayLabel(selectedAccountKey)}\n\nXomaki matnni yuboring. AI imlo, tinish belgilari va uslubni yaxshilab beradi.` });
  }
  if (data.startsWith('tpl_test:')) {
    const key = data.split(':')[1];
    const body = await getTemplate(key, selectedAccountKey);
    return tg('sendMessage', { chat_id: chatId, text: body ? `🧪 Test preview (${selectedAccountKey}/${key})\n\n${renderTemplate(body)}` : `Topilmadi: ${selectedAccountKey}/${key}` });
  }
  if (data === 'tpl_ai_save') {
    const session = await getAdminSession(chatId);
    const payload = session?.payload || {};
    if (!payload.template_key || !payload.edited_text) return tg('sendMessage', { chat_id: chatId, text: 'Saqlanadigan AI preview topilmadi.' });
    await setTemplate(payload.template_key, payload.edited_text, payload.selected_account_key);
    await setAdminSession(chatId, 'account_selected', { selected_account_key: payload.selected_account_key });
    return tg('sendMessage', { chat_id: chatId, text: `✅ Saqlandi: ${payload.selected_account_key}/${payload.template_key}` });
  }
  if (data === 'tpl_edit_save') {
    const session = await getAdminSession(chatId);
    const payload = session?.payload || {};
    if (!payload.template_key || !payload.edited_text) return tg('sendMessage', { chat_id: chatId, text: 'Saqlanadigan preview topilmadi.' });
    await setTemplate(payload.template_key, payload.edited_text, payload.selected_account_key);
    await setAdminSession(chatId, 'account_selected', { selected_account_key: payload.selected_account_key });
    return tg('sendMessage', { chat_id: chatId, text: `✅ Saqlandi: ${payload.selected_account_key}/${payload.template_key}` });
  }
  if (data === 'tpl_edit_retry') {
    const session = await getAdminSession(chatId);
    const payload = session?.payload || {};
    await setAdminSession(chatId, 'template_edit_input', payload);
    return tg('sendMessage', { chat_id: chatId, text: `Joriy akkaunt: ${accountDisplayLabel(payload.selected_account_key || selectedAccountKey)}\n\nYangi matnni yuboring.` });
  }
  if (data === 'tpl_ai_retry') {
    const session = await getAdminSession(chatId);
    const payload = session?.payload || {};
    await setAdminSession(chatId, 'ai_template_input', payload);
    return tg('sendMessage', { chat_id: chatId, text: 'Qayta tahrirlash uchun yangi xomaki matn yuboring.' });
  }
  if (data === 'tpl_ai_cancel' || data === 'tpl_edit_cancel') {
    await setAdminSession(chatId, 'account_selected', { selected_account_key: selectedAccountKey });
    return tg('sendMessage', { chat_id: chatId, text: 'Bekor qilindi.' });
  }
  if (data.startsWith('list:')) return sendList(chatId, data.split(':')[1], selectedAccountKey);
  if (data === 'reminder_preview') return sendReminderPreview(chatId, selectedAccountKey);
  if (data === 'reminder_confirm') return sendReminderConfirm(chatId, selectedAccountKey);
}

async function leadCardText(lead) {
  const auto = await getAutoOutreach(lead.account_key);
  const lastIgnore = await getLastIgnoreReason(lead.chat_id, lead.account_key);
  return `👤 Lid\nAkkaunt: ${lead.account_key || DEFAULT_ACCOUNT_KEY}\nIsm: ${lead.first_name || '-'}\nUsername: ${lead.username ? '@' + lead.username : '-'}\nChat ID: ${lead.chat_id}\nAuto Reply: ${isAutoActive(auto) ? 'ON' : 'OFF'}\nActive session: ${auto?.session_id || '-'}\nOutreach sent: ${lead.outreach_sent ? 'true' : 'false'}\nOutreach session: ${lead.outreach_session_id || '-'}\nStatus: ${lead.status}\nStage: ${lead.stage}\nBot enabled: ${lead.bot_enabled ? 'true' : 'false'}\nLast user message: ${lead.last_user_message || '-'}\nLast admin message: ${lead.last_admin_message || '-'}\nLast ignore reason: ${lastIgnore ? `${lastIgnore.event_type} (${lastIgnore.created_at})` : '-'}`;
}

// -------------------- HTTP routes --------------------
app.get('/', (_, res) => res.json({ ok: true, name: 'OLYE Info Bot v6', mode: 'info-only' }));
app.get('/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/webhook', (_, res) => res.json({ ok: true, note: 'Telegram uses POST /webhook' }));
app.get('/tick', async (_, res) => {
  await runSchedulerTick('http');
  res.json({ ok: true, ticked_at: new Date().toISOString() });
});

const BASIC_ALLOWED_UPDATES = ['message', 'callback_query', 'business_connection', 'business_message'];
const FULL_ALLOWED_UPDATES = [...BASIC_ALLOWED_UPDATES, 'edited_business_message', 'deleted_business_messages'];

async function setWebhookResponse(req, res, allowedUpdates) {
  try {
    const url = WEBHOOK_URL || `${req.protocol}://${req.get('host')}/webhook`;
    const result = await tg('setWebhook', {
      url,
      secret_token: WEBHOOK_SECRET || undefined,
      allowed_updates: allowedUpdates
    });
    res.json({ ok: true, url, allowed_updates: allowedUpdates, result });
  } catch (err) {
    console.error('setWebhook error:', err.telegram || err.message);
    res.status(500).json({
      ok: false,
      error: err.message,
      telegram: err.telegram || null
    });
  }
}

app.get('/set-webhook', async (req, res) => setWebhookResponse(req, res, BASIC_ALLOWED_UPDATES));
app.get('/set-webhook-basic', async (req, res) => setWebhookResponse(req, res, BASIC_ALLOWED_UPDATES));
app.get('/set-webhook-full', async (req, res) => setWebhookResponse(req, res, FULL_ALLOWED_UPDATES));

app.get('/webhook-debug', async (_, res) => {
  const accounts = await getAccounts();
  res.json({
    ok: true,
    bot_token_exists: Boolean(BOT_TOKEN),
    bot_token_length: BOT_TOKEN ? BOT_TOKEN.length : 0,
    webhook_url_exists: Boolean(WEBHOOK_URL),
    webhook_url_https: WEBHOOK_URL ? WEBHOOK_URL.startsWith('https://') : false,
    webhook_url_ends_with_webhook: WEBHOOK_URL ? WEBHOOK_URL.endsWith('/webhook') : false,
    webhook_secret_exists: Boolean(WEBHOOK_SECRET),
    webhook_secret_length: WEBHOOK_SECRET ? WEBHOOK_SECRET.length : 0,
    basic_allowed_updates: BASIC_ALLOWED_UPDATES,
    full_allowed_updates: FULL_ALLOWED_UPDATES,
    set_webhook_default: 'basic',
    detected_accounts: accounts.map(a => ({
      account_key: a.account_key,
      label: a.label,
      project_name: a.project_name,
      admin_chat_id: a.admin_chat_id ? String(a.admin_chat_id) : '',
      business_owner_id: a.business_owner_id ? String(a.business_owner_id) : '',
      business_connection_id: a.business_connection_id ? 'configured' : '',
      flow_key: a.flow_key
    }))
  });
});

app.get('/webhook-info', async (_, res) => {
  try {
    const result = await tg('getWebhookInfo', {});
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/webhook', async (req, res) => {
  if (WEBHOOK_SECRET) {
    const header = req.get('x-telegram-bot-api-secret-token');
    if (header !== WEBHOOK_SECRET) return res.status(403).json({ ok: false });
  }
  res.json({ ok: true });
  try {
    const update = req.body || {};
    if (update.callback_query) await handleCallback(update.callback_query);
    if (update.message) {
      const text = normalizeCommandWord(String(update.message.text || '').trim().split(/\s+/)[0]);
      if (text === '/whoami') {
        await replyWhoami(update.message, 'message');
      } else if (await isKnownAdminMessage(update.message)) {
        await handleAdminMessage(update.message);
      }
    }
    if (update.business_connection) await handleBusinessConnectionUpdate(update.business_connection);
    if (update.business_message) await handleBusinessMessage(update.business_message);
    if (update.edited_business_message) await archiveEditedBusinessMessage(update.edited_business_message);
    if (update.deleted_business_messages) await handleDeletedBusinessMessages(update.deleted_business_messages);
  } catch (err) {
    console.error('webhook processing error:', err);
    await sendAdmin(`⚠️ Bot xatosi: ${html(err.message || String(err))}`);
  }
});

// -------------------- Utils --------------------
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function html(s = '') { return String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])); }
function short(s = '', n = 80) { const x = String(s || ''); return x.length > n ? x.slice(0, n - 1) + '…' : x; }

setInterval(() => runSchedulerTick('interval'), SCHEDULER_TICK_MS).unref();

app.listen(PORT, () => {
  console.log(`OLYE Info Bot v6 running on port ${PORT}`);
});
