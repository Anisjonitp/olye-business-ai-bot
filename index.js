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
const MEDIA_ARCHIVE_DOWNLOAD = String(process.env.MEDIA_ARCHIVE_DOWNLOAD || 'true') === 'true';
const MEDIA_ARCHIVE_MAX_BYTES = Number(process.env.MEDIA_ARCHIVE_MAX_BYTES || 20000000);
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'business-media-archive';
const AI_INTENT_ENABLED = String(process.env.AI_INTENT_ENABLED || 'false') === 'true';
const AI_TEMPLATE_EDITOR_ENABLED = String(process.env.AI_TEMPLATE_EDITOR_ENABLED || 'false') === 'true';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

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
        label: process.env.SECOND_ACCOUNT_LABEL || 'Second',
        business_owner_id: process.env.SECOND_ACCOUNT_BUSINESS_OWNER_ID || '',
        admin_chat_id: process.env.SECOND_ACCOUNT_ADMIN_CHAT_ID || '',
        business_connection_id: process.env.SECOND_ACCOUNT_BUSINESS_CONNECTION_ID || '',
        project_name: process.env.SECOND_ACCOUNT_PROJECT_NAME || 'Second Project',
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
  const byKey = new Map(ENV_ACCOUNTS.map(a => [a.account_key, a]));
  const { data, error } = await supabase.from('bot_accounts').select('*');
  if (!error && Array.isArray(data)) {
    for (const row of data) {
      if (!row?.account_key) continue;
      byKey.set(row.account_key, { ...byKey.get(row.account_key), ...row });
    }
  } else if (error && !String(error.message || '').includes('does not exist')) {
    console.error('getAccounts:', error.message);
  }
  if (!byKey.size) byKey.set(DEFAULT_ACCOUNT.account_key, DEFAULT_ACCOUNT);
  return [...byKey.values()];
}

async function getAccount(accountOrKey = DEFAULT_ACCOUNT_KEY) {
  const key = accountKey(accountOrKey);
  const accounts = await getAccounts();
  return accounts.find(a => a.account_key === key) || accounts[0] || DEFAULT_ACCOUNT;
}

async function findAccountForBusinessMessage(msg) {
  const fromId = String(msg?.from?.id || '');
  const businessConnectionId = String(msg?.business_connection_id || msg?.business_connection?.id || '');
  const chatId = String(msg?.chat?.id || '');
  const accounts = await getAccounts();
  const direct = accounts.find(a => (
    (a.business_owner_id && String(a.business_owner_id) === fromId) ||
    (a.business_connection_id && String(a.business_connection_id) === businessConnectionId)
  ));
  if (direct) return direct;
  if (businessConnectionId) {
    let q = supabase.from('business_leads')
      .select('account_key')
      .eq('business_connection_id', businessConnectionId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (chatId) q = q.eq('chat_id', chatId);
    const { data } = await q;
    const learnedKey = data?.[0]?.account_key;
    if (learnedKey) return accounts.find(a => a.account_key === learnedKey) || { ...DEFAULT_ACCOUNT, account_key: learnedKey };
  }
  return DEFAULT_ACCOUNT;
}

async function rememberAccountBusinessConnection(account, businessConnectionId) {
  if (!businessConnectionId || !account?.account_key) return;
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
      content: 'Classify Telegram customer replies for an info-only business bot. Never write a reply to the customer. Return strict JSON only with keys: intent, confidence, next_step, template_key, should_stop, reason. Allowed intents: confirm,reject,thanks,interested,price_question,info_request,unclear,stop,complaint,payment_ready,other.'
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
    if (['confirm', 'thanks', 'interested'].includes(intent)) return 'has_info';
    if (intent === 'info_request') return 'no_info';
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
    if (intent === 'no_info' || intent === 'unclear' || intent === 'payment_near' || intent === 'read_offer') {
      const keys = await flowTemplateKeys(current.account_key, 'no_info', ['unknown_info_preface', 'full_intro', 'offer_end']);
      const after = await sendPackage(current, 'unknown_info_context_resume', keys, {});
      await finishAfterInfo(after || current);
      return { handled: true, lead: after || current };
    }
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
    }
  } catch (err) {
    console.error('scheduler tick error:', err);
    await logEvent('system', 'scheduler_error', err.message || String(err));
  } finally {
    schedulerBusy = false;
  }
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

  const noInfo = ['yoq', "yo'q", 'bilmayman', 'malumotga ega emas', "ma'lumotga ega emas", 'ma’lumotga ega emas', 'xabardor emas'];
  if (stage === STAGE.ASKED_INFO && includesAny(t, noInfo)) return 'no_info';

  const partial = ['biroz', 'ozgina', 'sal pal', 'sal-pal', 'qisman', 'uncha emas'];
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
  if (!MEDIA_ARCHIVE_DOWNLOAD || !SUPABASE_STORAGE_BUCKET || !payload.file_id) return {};
  if (payload.file_size && Number(payload.file_size) > MEDIA_ARCHIVE_MAX_BYTES) {
    await logEvent(payload.chat_id, 'media_archive_download_skipped_large', `${payload.message_id}:${payload.file_size}`, payload.account_key);
    return {};
  }
  try {
    const file = await tg('getFile', { file_id: payload.file_id });
    if (!file?.file_path) return {};
    const fileRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`);
    if (!fileRes.ok) throw new Error(`download failed ${fileRes.status}`);
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    if (bytes.byteLength > MEDIA_ARCHIVE_MAX_BYTES) {
      await logEvent(payload.chat_id, 'media_archive_download_skipped_large', `${payload.message_id}:${bytes.byteLength}`, payload.account_key);
      return {};
    }
    const storagePath = archiveStoragePath(payload, file.file_path);
    const { error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).upload(storagePath, bytes, {
      contentType: payload.mime_type || 'application/octet-stream',
      upsert: true
    });
    if (error) throw error;
    const { data } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(storagePath);
    return { storage_path: storagePath, public_url: data?.publicUrl || null, storage_url: data?.publicUrl || null };
  } catch (err) {
    console.error('maybeArchiveMediaFile:', err.message);
    await logEvent(payload.chat_id, 'media_archive_download_skipped', err.message || String(err), payload.account_key);
    return {};
  }
}

async function archiveBusinessMessage(msg, account, direction = 'unknown') {
  if (!MEDIA_ARCHIVE_ENABLED || account?.archive_enabled === false) return null;
  const payload = messageArchivePayload(msg, account, direction, 'created');
  if (!payload.chat_id || !payload.message_id) return null;
  const storage = await maybeArchiveMediaFile(payload);
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
  const account = await findAccountForBusinessMessage(msg);
  if (!MEDIA_ARCHIVE_ENABLED || account?.archive_enabled === false) return;
  const direction = isOwnerMessage(msg) ? 'outgoing' : 'incoming';
  const payload = messageArchivePayload(msg, account, direction, 'edited');
  if (!payload.chat_id || !payload.message_id) return;

  const { data: oldRow } = await supabase.from('message_archive')
    .select('*')
    .eq('account_key', payload.account_key)
    .eq('chat_id', payload.chat_id)
    .eq('message_id', payload.message_id)
    .maybeSingle();
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
  const { error } = await supabase.from('message_archive').upsert({
    ...(oldRow || {}),
    ...payload,
    ...storage,
    id: oldRow?.id,
    edited_at: new Date().toISOString(),
    edit_count: nextEditCount,
    last_event_type: 'edited'
  }, { onConflict: 'account_key,chat_id,message_id' });
  if (error) console.error('archiveEditedBusinessMessage:', error.message);

  if (account.archive_notify_enabled !== false) await notifyEditedMessage(account, oldRow, payload);
}

function deletedMessageIds(update = {}) {
  const ids = update.message_ids || update.deleted_message_ids || update.message_id || [];
  return Array.isArray(ids) ? ids : [ids];
}

async function handleDeletedBusinessMessages(update = {}) {
  const account = await findAccountForBusinessMessage(update);
  if (!MEDIA_ARCHIVE_ENABLED || account?.archive_enabled === false) return;
  const ak = account.account_key;
  const businessConnectionId = update.business_connection_id || update.business_connection?.id || account.business_connection_id || null;
  const chatId = String(update.chat?.id || update.chat_id || '');
  if (!chatId) return;
  for (const messageId of deletedMessageIds(update)) {
    if (!messageId) continue;
    const { data: oldRow } = await supabase.from('message_archive')
      .select('*')
      .eq('account_key', ak)
      .eq('chat_id', chatId)
      .eq('message_id', messageId)
      .maybeSingle();
    const patch = {
      account_key: ak,
      business_connection_id: businessConnectionId,
      chat_id: chatId,
      message_id: messageId,
      deleted_at: new Date().toISOString(),
      delete_detected: true,
      last_event_type: 'deleted'
    };
    const { error } = await supabase.from('message_archive').upsert({
      ...(oldRow || {}),
      ...patch,
      id: oldRow?.id
    }, { onConflict: 'account_key,chat_id,message_id' });
    if (error) console.error('handleDeletedBusinessMessages:', error.message);
    if (account.archive_notify_enabled !== false) await notifyDeletedMessage(account, oldRow || patch);
  }
}

async function notifyDeletedMessage(account, row) {
  const archived = row?.storage_path || row?.file_id ? 'Ha' : 'Yo‘q';
  const actor = row?.from_username ? `@${row.from_username}` : (row?.from_first_name || 'Foydalanuvchi');
  const item = row?.message_type === 'photo' ? 'rasmni' : row?.file_id ? `${row.message_type || 'media'}ni` : 'xabarni';
  await sendAdmin(
    `🗑 <b>${html(actor)} ushbu ${html(item)} o‘chirdi</b>\n\n` +
    `Akkaunt: ${html(account.label || account.account_key)}\n` +
    `Project: ${html(account.project_name || '-')}\n` +
    `Chat ID: <code>${html(row.chat_id || '-')}</code>\n` +
    `Message ID: <code>${html(row.message_id || '-')}</code>\n` +
    `Turi: ${html(row.message_type || '-')}\n` +
    `Matn: ${html(short(row.text || row.caption || '-', 500))}\n` +
    `Media arxiv: ${archived}`,
    {},
    account.account_key
  );
  await sendArchivedMediaToAdmin(account, row, `O‘chirilgan ${row?.message_type === 'photo' ? 'rasm' : 'media'} arxivi`);
}

async function notifyEditedMessage(account, oldRow, payload) {
  const actor = payload?.from_username ? `@${payload.from_username}` : (payload?.from_first_name || 'Foydalanuvchi');
  await sendAdmin(
    `✏️ <b>${html(actor)} ushbu xabarni tahrirladi</b>\n\n` +
    `Akkaunt: ${html(account.label || account.account_key)}\n` +
    `Chat ID: <code>${html(payload.chat_id || '-')}</code>\n` +
    `Message ID: <code>${html(payload.message_id || '-')}</code>\n` +
    `Eski xabar:\n${html(short(oldRow?.text || oldRow?.caption || '-', 700))}\n\n` +
    `Yangi xabar:\n${html(short(payload.text || payload.caption || '-', 700))}`,
    {},
    account.account_key
  );
}

async function sendArchivedMediaToAdmin(account, row, caption = 'Media arxiv') {
  if (!row?.file_id) return;
  const adminChatId = account.admin_chat_id || ADMIN_CHAT_ID;
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

function isOwnerMessage(msg) {
  const fromId = String(msg?.from?.id || '');
  if (!fromId) return false;
  return ENV_ACCOUNTS.some(a => String(a.business_owner_id || '') === fromId) || fromId === String(BUSINESS_OWNER_ID) || fromId === String(OWNER_TELEGRAM_ID);
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
      (a.business_owner_id && String(a.business_owner_id) === fromId)
    ));
  const isAdmin = await isKnownAdminMessage(msg);
  const accountMatches = accounts
    .filter(a => (
      (a.admin_chat_id && (String(a.admin_chat_id) === chatId || String(a.admin_chat_id) === fromId)) ||
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
  if (text.toLowerCase() === '/whoami') {
    await replyWhoami(msg, 'business_message');
    return;
  }
  const key = `business:${ak}:${chatId}:${msg.message_id || msg.date || Date.now()}`;
  const direction = isOwnerMessage(msg) ? 'outgoing' : 'incoming';
  if (direction === 'outgoing') await rememberAccountBusinessConnection(account, businessConnectionId);
  await archiveBusinessMessage(msg, account, direction);

  const firstTime = await markProcessed(key, chatId, ak);
  if (!firstTime) {
    await logIgnore(chatId, 'duplicate_message', key, ak);
    return;
  }
  if (isBotMessage(msg)) return;

  if (text.toLowerCase().trim() === '/resetme') {
    await resetMeChat({ chatId, businessConnectionId, from: msg.from, accountKey: ak });
    await tg('sendMessage', {
      chat_id: chatId,
      business_connection_id: businessConnectionId || undefined,
      text: '✅ Test profilingiz tozalandi. Endi qayta test qilishingiz mumkin. Keyingi oddiy xabaringizda bot boshidan boshlaydi.'
    });
    return;
  }

  // Owner/admin outgoing message: remember outreach/context. Do not respond to the admin message itself.
  if (isOwnerMessage(msg)) {
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

function archiveRowsText(title, rows) {
  if (!rows.length) return `${title}\n\nHozircha ro‘yxat bo‘sh.`;
  return `${title}\n\n` + rows.map((r, i) => (
    `${i + 1}. ${r.from_username ? '@' + r.from_username : (r.from_first_name || '-') } — ${r.direction || 'unknown'} ${r.message_type || 'other'}\n` +
    `   Chat ID: ${r.chat_id}\n` +
    `   Message ID: ${r.message_id}\n` +
    `   Text: ${short(r.text || r.caption || '-', 90)}\n` +
    `   Event: ${r.last_event_type || '-'}${r.delete_detected ? ' / deleted' : ''}${r.edit_count ? ` / edits:${r.edit_count}` : ''}`
  )).join('\n\n');
}

function archiveMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🗑 O‘chirilgan xabarlar', callback_data: 'archive:deleted' }],
      [{ text: '✏️ Tahrirlangan xabarlar', callback_data: 'archive:edited' }],
      [{ text: '🖼 Media arxiv', callback_data: 'archive:media' }],
      [{ text: '🔎 Chat bo‘yicha qidirish', callback_data: 'archive:search_help' }],
      [{ text: '⬅️ Menyu', callback_data: 'menu' }]
    ]
  };
}

async function sendArchiveMenu(chatId) {
  return tg('sendMessage', {
    chat_id: chatId,
    text: '🕵️ Dialog arxiv',
    reply_markup: archiveMenuKeyboard()
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
  return tg('sendMessage', { chat_id: chatId, text: archiveRowsText(titles[type] || titles.recent, rows) });
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
    text: '👤 Akkaunt tanlash',
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
    text: `✏️ Shablonlar\nAkkaunt: ${accountKey(accountOrKey)}`,
    reply_markup: { inline_keyboard: rows }
  });
}

async function sendTemplateActions(chatId, templateKey, accountOrKey = DEFAULT_ACCOUNT_KEY) {
  return tg('sendMessage', {
    chat_id: chatId,
    text: `Shablon: ${templateKey}`,
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
  if (!edited) return tg('sendMessage', { chat_id: chatId, text: 'AI tahrir hozir ishlamadi. OPENAI_API_KEY va AI_TEMPLATE_EDITOR_ENABLED sozlamalarini tekshiring.' });
  await setAdminSession(chatId, 'ai_template_preview', {
    selected_account_key: accountKey(accountOrKey),
    template_key: templateKey,
    rough_text: roughText,
    edited_text: edited
  });
  return tg('sendMessage', {
    chat_id: chatId,
    text: `AI tahrirlangan matn:\n\n${edited}`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Saqlash', callback_data: 'tpl_ai_save' }, { text: '✏️ Qayta tahrirlash', callback_data: 'tpl_ai_retry' }],
        [{ text: '❌ Bekor qilish', callback_data: 'tpl_ai_cancel' }]
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
      [{ text: '🟢 Auto javobni yoqish', callback_data: 'auto:2' }, { text: '🔴 Auto javobni o‘chirish', callback_data: 'auto:off' }],
      [{ text: '📊 Auto holati', callback_data: 'autostatus' }, { text: '📣 Outreach', callback_data: 'outreach_menu' }],
      [{ text: '📣 Outreach', callback_data: 'outreach_menu' }, { text: '📊 Hisobot', callback_data: 'report' }],
      [{ text: '📄 Ma’lumot yuborilganlar', callback_data: 'list:info_sent' }],
      [{ text: '✅ Tanishdim yozganlar', callback_data: 'list:read' }, { text: '💳 To‘lovga yaqinlar', callback_data: 'list:payment' }],
      [{ text: '⏰ Eslatma keraklar', callback_data: 'list:reminders' }],
      [{ text: '🕵️ Dialog arxiv', callback_data: 'archive_menu' }],
      [{ text: '✏️ Shablonlar', callback_data: 'templates' }, { text: '🩺 Bot holati', callback_data: 'diagnostics' }]
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

// -------------------- Admin commands --------------------
async function handleAdminMessage(msg) {
  const chatId = String(msg.chat?.id || '');
  const text = String(msg.text || '').trim();
  if (!text) return;
  const selectedAccountKey = await getSelectedAccountKey(chatId);
  const session = await getAdminSession(chatId);

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
  if (text.startsWith('/account ')) {
    const key = text.split(/\s+/)[1];
    const accounts = await getAccounts();
    const account = accounts.find(a => a.account_key === key);
    if (!account) return tg('sendMessage', { chat_id: chatId, text: `Topilmadi: ${key}` });
    await setSelectedAccountKey(chatId, key);
    return tg('sendMessage', { chat_id: chatId, text: `✅ Akkaunt tanlandi: ${account.label || account.account_key}` });
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

  if (text === '/report') return sendReport(chatId, selectedAccountKey);
  if (text === '/info') return sendList(chatId, 'info_sent', selectedAccountKey);
  if (text === '/read') return sendList(chatId, 'read', selectedAccountKey);
  if (text === '/payment') return sendList(chatId, 'payment', selectedAccountKey);
  if (text === '/reminders') return sendList(chatId, 'reminders', selectedAccountKey);
  if (text === '/pending') return sendList(chatId, 'pending', selectedAccountKey);
  if (text === '/healthtemplates') return healthTemplates(chatId, selectedAccountKey);
  if (text === '/diagnostics') return diagnostics(chatId, selectedAccountKey);
  if (text === '/archive') return sendArchiveMenu(chatId);
  if (text.startsWith('/archive ')) return sendArchiveList(chatId, 'recent', text.split(/\s+/)[1]);
  if (text === '/deleted' || text.startsWith('/deleted ')) return sendArchiveList(chatId, 'deleted', text.split(/\s+/)[1] || selectedAccountKey);
  if (text === '/edited' || text.startsWith('/edited ')) return sendArchiveList(chatId, 'edited', text.split(/\s+/)[1] || selectedAccountKey);
  if (text === '/media' || text.startsWith('/media ')) return sendArchiveList(chatId, 'media', text.split(/\s+/)[1] || selectedAccountKey);
  if (text.startsWith('/archivechat ')) {
    const parts = text.split(/\s+/);
    const accounts = await getAccounts();
    const maybeAccount = accounts.find(a => a.account_key === parts[1]);
    return sendArchiveList(chatId, 'chat', maybeAccount ? parts[1] : selectedAccountKey, maybeAccount ? parts[2] : parts[1]);
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
    return tg('sendMessage', { chat_id: chatId, text: `Oddiy tahrirlash:\n/settemplate ${selectedAccountKey} ${key} yangi matn` });
  }
  if (data.startsWith('tpl_ai:')) {
    const key = data.split(':')[1];
    await setAdminSession(chatId, 'ai_template_input', { selected_account_key: selectedAccountKey, template_key: key });
    return tg('sendMessage', { chat_id: chatId, text: `🤖 AI bilan tahrirlash\n\n${key} uchun xomaki matn yuboring.` });
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
  if (data === 'tpl_ai_retry') {
    const session = await getAdminSession(chatId);
    const payload = session?.payload || {};
    await setAdminSession(chatId, 'ai_template_input', payload);
    return tg('sendMessage', { chat_id: chatId, text: 'Qayta tahrirlash uchun yangi xomaki matn yuboring.' });
  }
  if (data === 'tpl_ai_cancel') {
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
      const text = String(update.message.text || '').trim().toLowerCase();
      if (text === '/whoami') {
        await replyWhoami(update.message, 'message');
      } else if (await isKnownAdminMessage(update.message)) {
        await handleAdminMessage(update.message);
      }
    }
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
