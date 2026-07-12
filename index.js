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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

const MESSAGE_BUFFER_MS = Number(process.env.MESSAGE_BUFFER_MS || 5000);
const AUTO_START_REQUIRE_OUTREACH = String(process.env.AUTO_START_REQUIRE_OUTREACH || 'true') === 'true';
const AUTO_OUTREACH_DEFAULT_HOURS = Number(process.env.AUTO_OUTREACH_DEFAULT_HOURS || 2);
const OUTREACH_GREETING_REQUIRED = String(process.env.OUTREACH_GREETING_REQUIRED || 'true') === 'true';
const DAILY_DEFAULT_START = process.env.DAILY_AUTO_START || '07:00';
const DAILY_DEFAULT_DURATION_HOURS = Number(process.env.DAILY_AUTO_DURATION_HOURS || 2);
const LOCAL_UTC_OFFSET_HOURS = Number(process.env.LOCAL_UTC_OFFSET_HOURS || 5);
const DAILY_NO_OUTREACH_WARN_MIN = Number(process.env.DAILY_NO_OUTREACH_WARN_MIN || 15);
const REMINDER_AFTER_MS = Number(process.env.REMINDER_AFTER_MS || 3600000);
const SCHEDULER_TICK_MS = Number(process.env.SCHEDULER_TICK_MS || 60000);

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
const buffers = new Map();
let schedulerBusy = false;

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
    throw new Error(`Telegram API error: ${method}`);
  }
  return data.result;
}

async function sendAdmin(text, extra = {}) {
  if (!ADMIN_CHAT_ID) return;
  try {
    await tg('sendMessage', { chat_id: ADMIN_CHAT_ID, text, parse_mode: 'HTML', ...extra });
  } catch (err) {
    console.error('sendAdmin error:', err.message);
  }
}

async function sendBusinessMessage(lead, text) {
  if (!lead?.business_connection_id) {
    await logEvent(lead?.chat_id || 'unknown', 'send_skipped_no_business_connection', String(text || '').slice(0, 300));
    return null;
  }
  await tg('sendMessage', {
    chat_id: lead.chat_id,
    business_connection_id: lead.business_connection_id,
    text
  });
  await updateLead(lead.chat_id, { last_bot_message: text, last_message_at: new Date().toISOString() });
  return true;
}

async function answerCallback(callbackQueryId, text = '') {
  try { await tg('answerCallbackQuery', { callback_query_id: callbackQueryId, text }); } catch {}
}

// -------------------- DB helpers --------------------
async function logEvent(chatId, eventType, message = '') {
  const { error } = await supabase.from('lead_events').insert({
    chat_id: String(chatId),
    event_type: eventType,
    message: String(message || '').slice(0, 1500)
  });
  if (error) console.error('logEvent:', error.message);
}

async function getLead(chatId) {
  const { data, error } = await supabase.from('business_leads').select('*').eq('chat_id', String(chatId)).maybeSingle();
  if (error) {
    console.error('getLead:', error.message);
    return null;
  }
  return data || null;
}

async function createLead({ chatId, businessConnectionId, from, text, stage = STAGE.NEW, status = 'active', botEnabled = true }) {
  const payload = {
    chat_id: String(chatId),
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
  await logEvent(chatId, `lead_created_${stage}`, text || '');
  return data;
}

async function updateLead(chatId, patch) {
  const changedStage = Object.prototype.hasOwnProperty.call(patch, 'stage');
  const payload = { ...patch, updated_at: new Date().toISOString() };
  if (changedStage) payload.stage_started_at = new Date().toISOString();
  const { data, error } = await supabase.from('business_leads').update(payload).eq('chat_id', String(chatId)).select().maybeSingle();
  if (error) console.error('updateLead:', error.message);
  return data;
}

async function upsertLeadBase({ chatId, businessConnectionId, from, text }) {
  const existing = await getLead(chatId);
  if (existing) {
    return updateLead(chatId, {
      business_connection_id: businessConnectionId || existing.business_connection_id,
      first_name: from?.first_name || existing.first_name,
      username: from?.username || existing.username,
      last_user_message: text || existing.last_user_message,
      last_message_at: new Date().toISOString()
    });
  }
  return createLead({ chatId, businessConnectionId, from, text, stage: STAGE.NEW });
}

async function markProcessed(messageKey, chatId) {
  const { error } = await supabase.from('processed_messages').insert({ message_key: messageKey, chat_id: String(chatId) });
  if (!error) return true;
  if (error.code === '23505') return false;
  console.error('markProcessed:', error.message);
  return true;
}

async function reserveAction(chatId, stage, actionName) {
  const actionKey = `${chatId}:${stage}:${actionName}`;
  const { error } = await supabase.from('sent_actions').insert({
    action_key: actionKey,
    chat_id: String(chatId),
    action_name: actionName,
    stage
  });
  if (!error) return true;
  if (error.code === '23505') return false;
  console.error('reserveAction:', error.message);
  return true;
}

async function getTemplate(key) {
  const { data, error } = await supabase.from('reply_templates').select('body').eq('key', key).maybeSingle();
  if (error) {
    console.error('getTemplate:', key, error.message);
    return null;
  }
  return data?.body || null;
}

async function setTemplate(key, body) {
  const { error } = await supabase.from('reply_templates').upsert({
    key,
    title: key,
    body,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

function renderTemplate(body = '') {
  return String(body || '').replaceAll('{APPLICATION_LINK}', APPLICATION_LINK);
}

async function sendTemplate(lead, templateKey) {
  const body = await getTemplate(templateKey);
  if (!body) {
    await sendAdmin(`⚠️ Template topilmadi: <b>${templateKey}</b>`);
    await logEvent(lead.chat_id, 'missing_template', templateKey);
    return false;
  }
  const text = renderTemplate(body);
  await sendBusinessMessage(lead, text);
  await logEvent(lead.chat_id, `sent_${templateKey}`, text.slice(0, 300));
  return true;
}

async function sendPackage(lead, actionName, templateKeys, nextPatch = {}) {
  const reserved = await reserveAction(lead.chat_id, lead.stage, actionName);
  if (!reserved) {
    await logEvent(lead.chat_id, `duplicate_action_skipped_${actionName}`, '');
    return lead;
  }
  let currentLead = lead;
  for (const key of templateKeys) {
    await sendTemplate(currentLead, key);
    await sleep(350);
  }
  if (Object.keys(nextPatch).length) {
    currentLead = await updateLead(lead.chat_id, nextPatch) || currentLead;
  }
  return currentLead;
}

async function finishAfterInfo(lead) {
  const updated = await updateLead(lead.chat_id, {
    stage: STAGE.INFO_SENT_FINISHED,
    status: 'info_sent',
    bot_enabled: false,
    finished_at: new Date().toISOString()
  });
  await sendAdmin(
    `✅ <b>Info-only yakunlandi</b>\n\n` +
    `Ism: ${html(lead.first_name || '-')}\n` +
    `Username: ${lead.username ? '@' + html(lead.username) : '-'}\n` +
    `Chat ID: <code>${lead.chat_id}</code>\n\n` +
    `Bot ma’lumot va oferta xabarini yubordi. Endi chatni qo‘lda davom ettiring.`
  );
  return updated || lead;
}


async function resetMeChat({ chatId, businessConnectionId = null, from = null }) {
  const id = String(chatId);

  // Faqat shu chatning test holatini tozalaydi. Boshqa lidlarga tegmaydi.
  // business_leads yozuvini o‘chirmaymiz, chunki business_connection_id kerak bo‘lib qoladi.
  await supabase.from('sent_actions').delete().eq('chat_id', id);
  await supabase.from('processed_messages').delete().eq('chat_id', id);
  await supabase.from('lead_events').delete().eq('chat_id', id);

  const existing = await getLead(id);
  const patch = {
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
    await updateLead(id, patch);
  } else {
    await createLead({ chatId: id, businessConnectionId, from, text: '', stage: STAGE.OUTREACH_SENT, status: 'active', botEnabled: true });
    await updateLead(id, patch);
  }

  await logEvent(id, 'resetme', 'Test profil reset qilindi');
}

async function stopLead(lead, reason = 'stopped') {
  await updateLead(lead.chat_id, {
    stage: STAGE.DISABLED,
    status: reason,
    bot_enabled: false,
    finished_at: new Date().toISOString()
  });
  await logEvent(lead.chat_id, reason, 'bot stopped');
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

async function getAutoOutreach() {
  return getSetting('auto_outreach', { enabled: false });
}

async function enableAutoOutreach(hours, source = 'manual') {
  const now = Date.now();
  const until = now + hours * 60 * 60 * 1000;
  const sessionId = `outreach_${localDateKey()}_${now}`;
  const value = {
    enabled: true,
    until,
    session_id: sessionId,
    started_at: now,
    hours,
    source,
    report_sent: false,
    no_outreach_warn_sent: false
  };
  await setSetting('auto_outreach', value);
  await logEvent('system', 'auto_outreach_enabled', JSON.stringify(value));
  return value;
}

async function disableAutoOutreach(reportSent = false) {
  await setSetting('auto_outreach', { enabled: false, disabled_at: Date.now(), report_sent: reportSent });
}

function isAutoActive(auto) {
  return Boolean(auto?.enabled && Number(auto.until || 0) > Date.now());
}

function looksLikeOutreachGreeting(text = '') {
  const t = normalize(text);
  if (!t) return false;
  if (!t.includes('assalomu') && !t.includes('assalom') && !t.includes('salom')) return false;
  if (t.includes('maqola tayyor') || t.includes('chek') || t.includes('karta') || t.includes('tolov') || t.includes('to‘lov')) return false;
  return t.includes('yaxshimisiz') || t.includes('qalaysiz') || t.includes('yaxshilarmi') || t.length < 110;
}

async function markOutreach({ chatId, businessConnectionId, from, text }) {
  const auto = await getAutoOutreach();
  if (!isAutoActive(auto)) return;
  if (OUTREACH_GREETING_REQUIRED && !looksLikeOutreachGreeting(text)) return;

  const existing = await getLead(chatId);
  const patch = {
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
    if (existing.stage === STAGE.DISABLED || existing.status === 'disabled') return;
    await updateLead(chatId, patch);
  } else {
    await createLead({ chatId, businessConnectionId, from, text, stage: STAGE.OUTREACH_SENT, status: 'active', botEnabled: true });
    await updateLead(chatId, patch);
  }
  await logEvent(chatId, 'outreach_sent_detected', text);
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

async function getDailyAuto() {
  return getSetting('daily_auto', {
    enabled: false,
    start_time: DAILY_DEFAULT_START,
    duration_hours: DAILY_DEFAULT_DURATION_HOURS,
    skip_date: null,
    last_started_date: null
  });
}

async function setDailyAuto(value) {
  const current = await getDailyAuto();
  const next = { ...current, ...value, updated_at: Date.now() };
  await setSetting('daily_auto', next);
  return next;
}

async function runSchedulerTick(source = 'interval') {
  if (schedulerBusy) return;
  schedulerBusy = true;
  try {
    await maybeStartDailyAuto();
    await maybeWarnNoOutreach();
    await maybeFinishAutoReport();
  } catch (err) {
    console.error('scheduler tick error:', err);
    await logEvent('system', 'scheduler_error', err.message || String(err));
  } finally {
    schedulerBusy = false;
  }
}

async function maybeStartDailyAuto() {
  const daily = await getDailyAuto();
  if (!daily?.enabled) return;
  const today = localDateKey();
  if (daily.skip_date === today) return;
  if (daily.last_started_date === today) return;

  const nowMin = localMinuteNow();
  const startMin = minutesOf(daily.start_time || DAILY_DEFAULT_START);
  if (nowMin < startMin || nowMin > startMin + 10) return;

  const hours = Number(daily.duration_hours || DAILY_DEFAULT_DURATION_HOURS);
  const auto = await enableAutoOutreach(hours, 'daily');
  await setDailyAuto({ last_started_date: today });
  await sendAdmin(
    `📣 <b>Kunlik Auto Outreach yoqildi</b>\n\n` +
    `Start: ${html(daily.start_time || DAILY_DEFAULT_START)}\n` +
    `Davomiylik: ${hours} soat\n` +
    `Tugash: ${new Date(auto.until).toLocaleString('uz-UZ')}\n\n` +
    `Telegram scheduled xabarlaringiz yuborilsa, bot faqat o‘sha outreach chatlarga javob beradi.`
  );
}

async function maybeWarnNoOutreach() {
  const auto = await getAutoOutreach();
  if (!isAutoActive(auto) || auto.no_outreach_warn_sent) return;
  const startedAt = Number(auto.started_at || 0);
  if (!startedAt || Date.now() - startedAt < DAILY_NO_OUTREACH_WARN_MIN * 60000) return;
  const count = await countLeads(q => q.eq('outreach_session_id', auto.session_id));
  if (count > 0) return;
  await sendAdmin(
    `⚠️ <b>Outreach aniqlanmadi</b>\n\n` +
    `${DAILY_NO_OUTREACH_WARN_MIN} daqiqa bo‘ldi, lekin bugungi outreach xabarlari ko‘rinmadi. ` +
    `Telegram scheduled xabarlar yuborilganini tekshiring.`
  );
  await setSetting('auto_outreach', { ...auto, no_outreach_warn_sent: true });
}

async function maybeFinishAutoReport() {
  const auto = await getAutoOutreach();
  if (!auto?.enabled) return;
  if (Number(auto.until || 0) > Date.now()) return;
  if (auto.report_sent) return;
  await sendAutoSessionReport(ADMIN_CHAT_ID, auto, true);
  await setSetting('auto_outreach', { ...auto, enabled: false, report_sent: true, disabled_at: Date.now() });
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

function isOwnerMessage(msg) {
  const fromId = String(msg?.from?.id || '');
  if (!fromId) return false;
  return fromId === String(BUSINESS_OWNER_ID) || fromId === String(OWNER_TELEGRAM_ID);
}

function isBotMessage(msg) {
  return Boolean(msg?.from?.is_bot);
}

async function handleBusinessMessage(msg) {
  const chatId = String(msg.chat?.id || '');
  if (!chatId) return;
  const businessConnectionId = msg.business_connection_id || msg.business_connection?.id || null;
  const text = getMessageText(msg).trim();
  const key = `business:${chatId}:${msg.message_id || msg.date || Date.now()}`;

  const firstTime = await markProcessed(key, chatId);
  if (!firstTime) return;
  if (isBotMessage(msg)) return;

  if (text.toLowerCase().trim() === '/resetme') {
    await resetMeChat({ chatId, businessConnectionId, from: msg.from });
    await tg('sendMessage', {
      chat_id: chatId,
      business_connection_id: businessConnectionId || undefined,
      text: '✅ Test profilingiz tozalandi. Endi qayta test qilishingiz mumkin. Keyingi oddiy xabaringizda bot boshidan boshlaydi.'
    });
    return;
  }

  // Owner/admin outgoing message: remember outreach only. Do not respond.
  if (isOwnerMessage(msg)) {
    if (text) await markOutreach({ chatId, businessConnectionId, from: msg.from, text });
    const existing = await getLead(chatId);
    if (existing) await updateLead(chatId, { last_admin_message: text || '[media]', last_message_at: new Date().toISOString() });
    return;
  }

  const rawText = text || (isMediaOnly(msg) ? '[media]' : '');
  const lead = await upsertLeadBase({ chatId, businessConnectionId, from: msg.from, text: rawText });
  if (!lead) return;

  if (STOP_REPLY_STAGES.has(lead.stage)) {
    await handlePostFinishSignal(lead, msg, rawText);
    return;
  }

  // Default safety: if this was not an outreach chat, do not auto-answer.
  if (AUTO_START_REQUIRE_OUTREACH && !lead.outreach_sent) {
    await updateLead(chatId, { stage: STAGE.PENDING_APPROVAL, status: 'pending_approval', bot_enabled: false });
    await logEvent(chatId, 'ignored_not_outreach', rawText);
    return;
  }

  if (!lead.bot_enabled) return;

  if (isMediaOnly(msg)) {
    await sendPackage(lead, 'media_text_request', ['media_text_request'], {});
    await logEvent(chatId, 'media_received', JSON.stringify(Object.keys(msg).slice(0, 10)));
    return;
  }

  enqueueLeadMessage(lead, text);
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
  await updateLead(lead.chat_id, patch);
  await logEvent(lead.chat_id, `post_finish_${intent}`, text || '[media]');
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
  let lead = await getLead(initialLead.chat_id) || initialLead;
  if (!lead.bot_enabled || STOP_REPLY_STAGES.has(lead.stage)) return;
  const text = texts.join('\n').trim();
  const intent = classify(text, lead.stage);
  await updateLead(lead.chat_id, { last_user_message: text, last_message_at: new Date().toISOString() });
  await logEvent(lead.chat_id, `intent_${intent}_${lead.stage}`, text);

  if (intent === 'hard_reject') {
    await stopLead(lead, 'hard_reject');
    return;
  }
  if (intent === 'later') {
    await updateLead(lead.chat_id, { stage: STAGE.PAUSED, status: 'paused', bot_enabled: false });
    await logEvent(lead.chat_id, 'paused_by_later', text);
    return;
  }

  // Main info-only flow.
  if (lead.stage === STAGE.OUTREACH_SENT || lead.stage === STAGE.NEW || lead.stage === STAGE.PENDING_APPROVAL) {
    await sendPackage(lead, 'ask_application', ['ask_application'], { stage: STAGE.ASKED_APPLICATION, status: 'active', bot_enabled: true });
    return;
  }

  if (lead.stage === STAGE.ASKED_APPLICATION) {
    if (intent === 'application_confirmed' || intent === 'application_submitted') {
      await sendPackage(lead, 'ask_info', ['ask_info'], { stage: STAGE.ASKED_INFO });
      return;
    }
    if (intent === 'application_not_submitted') {
      const after = await sendPackage(lead, 'application_link_reply', ['application_link_reply'], {
        stage: STAGE.INFO_SENT_FINISHED,
        status: 'application_link_sent',
        bot_enabled: false,
        finished_at: new Date().toISOString()
      });
      await sendAdmin(`🔗 <b>Ariza havolasi yuborildi</b>\nChat ID: <code>${lead.chat_id}</code>\nEndi chatni qo‘lda davom ettiring.`);
      return after;
    }
    const clarified = await reserveAction(lead.chat_id, lead.stage, 'clarify_application_once');
    if (clarified) {
      await sendTemplate(lead, 'clarify_application');
      return;
    }
    await updateLead(lead.chat_id, { stage: STAGE.PAUSED, status: 'needs_admin', bot_enabled: false });
    await sendAdmin(`⚠️ <b>Noaniq lid</b>\nChat ID: <code>${lead.chat_id}</code>\nXabar: ${html(text)}\nBot to‘xtadi, qo‘lda davom ettiring.`);
    return;
  }

  if (lead.stage === STAGE.ASKED_INFO) {
    if (intent === 'has_info') {
      const after = await sendPackage(lead, 'known_info_package', ['known_info_preface', 'short_intro', 'offer_end'], {});
      await finishAfterInfo(after || lead);
      return;
    }
    const after = await sendPackage(lead, 'unknown_info_package', ['unknown_info_preface', 'full_intro', 'offer_end'], {});
    await finishAfterInfo(after || lead);
    return;
  }

  await updateLead(lead.chat_id, { stage: STAGE.PAUSED, status: 'needs_admin', bot_enabled: false });
  await logEvent(lead.chat_id, 'unexpected_stage_stopped', `${lead.stage}: ${text}`);
}

// -------------------- Reports / lists --------------------
async function countLeads(apply) {
  let q = supabase.from('business_leads').select('*', { count: 'exact', head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) {
    console.error('countLeads:', error.message);
    return 0;
  }
  return count || 0;
}

async function getLeads(apply, limit = 20) {
  let q = supabase.from('business_leads').select('*').order('updated_at', { ascending: false }).limit(limit);
  if (apply) q = apply(q);
  const { data, error } = await q;
  if (error) {
    console.error('getLeads:', error.message);
    return [];
  }
  return data || [];
}

async function sessionStats(sessionId) {
  const sessionFilter = q => q.eq('outreach_session_id', sessionId);
  return {
    outreach: await countLeads(sessionFilter),
    replied: await countLeads(q => sessionFilter(q).not('last_user_message', 'is', null)),
    infoSent: await countLeads(q => sessionFilter(q).eq('stage', STAGE.INFO_SENT_FINISHED).in('status', ['info_sent', 'tanishdim', 'payment_near', 'reminder_sent'])),
    appLink: await countLeads(q => sessionFilter(q).eq('status', 'application_link_sent')),
    read: await countLeads(q => sessionFilter(q).eq('status', 'tanishdim')),
    payment: await countLeads(q => sessionFilter(q).eq('status', 'payment_near')),
    rejected: await countLeads(q => sessionFilter(q).in('status', ['hard_reject', 'disabled']))
  };
}

async function sendAutoSessionReport(chatId, auto = null, final = false) {
  const current = auto || await getAutoOutreach();
  if (!current?.session_id) return tg('sendMessage', { chat_id: chatId, text: 'Hozircha outreach session yo‘q.' });
  const s = await sessionStats(current.session_id);
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

async function getReminderDue(limit = 50) {
  return getLeads(q => dueReminderFilter(q), limit);
}

function listText(title, rows) {
  if (!rows.length) return `${title}\n\nHozircha ro‘yxat bo‘sh.`;
  return `${title}\n\n` + rows.map((l, i) => `${i + 1}. ${l.first_name || '-'} ${l.username ? '@' + l.username : ''}\n   Chat ID: ${l.chat_id}\n   Status: ${l.status}\n   Oxirgi: ${short(l.last_user_message || '-')}`).join('\n\n');
}

async function sendList(chatId, type) {
  let rows = [];
  let title = '';
  if (type === 'info_sent') {
    title = '📄 Ma’lumot yuborilganlar';
    rows = await getLeads(q => q.eq('stage', STAGE.INFO_SENT_FINISHED).in('status', ['info_sent', 'reminder_sent']), 20);
  } else if (type === 'read') {
    title = '✅ Tanishdim yozganlar';
    rows = await getLeads(q => q.eq('status', 'tanishdim'), 20);
  } else if (type === 'payment') {
    title = '💳 To‘lovga yaqinlar';
    rows = await getLeads(q => q.eq('status', 'payment_near'), 20);
  } else if (type === 'reminders') {
    title = '⏰ Eslatma keraklar';
    rows = await getReminderDue(20);
  } else if (type === 'pending') {
    title = '🆕 Pending';
    rows = await getLeads(q => q.in('stage', [STAGE.PENDING_APPROVAL, STAGE.OUTREACH_SENT, STAGE.PAUSED]), 20);
  }
  const keyboard = type === 'reminders' && rows.length
    ? { inline_keyboard: [[{ text: '👁 Eslatma preview', callback_data: 'reminder_preview' }], [{ text: '⬅️ Menyu', callback_data: 'menu' }]] }
    : { inline_keyboard: [[{ text: '⬅️ Menyu', callback_data: 'menu' }]] };
  return tg('sendMessage', { chat_id: chatId, text: listText(title, rows), reply_markup: keyboard });
}

async function sendReminderPreview(chatId) {
  const rows = await getReminderDue(50);
  if (!rows.length) return tg('sendMessage', { chat_id: chatId, text: '⏰ Eslatma kerak bo‘lgan lidlar yo‘q.' });
  const body = await getTemplate('offer_followup') || 'Tanishib chiqdingizmi? Biz sizni kutyapmiz.';
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

async function sendReminderConfirm(chatId) {
  const rows = await getReminderDue(100);
  if (!rows.length) return tg('sendMessage', { chat_id: chatId, text: '⏰ Yuboriladigan lidlar qolmadi.' });
  let sent = 0;
  for (const lead of rows) {
    const reserved = await reserveAction(lead.chat_id, lead.stage, 'manual_offer_followup');
    if (!reserved) continue;
    const ok = await sendTemplate(lead, 'offer_followup');
    if (ok) {
      sent += 1;
      await updateLead(lead.chat_id, { status: 'reminder_sent' });
      await sleep(400);
    }
  }
  return tg('sendMessage', { chat_id: chatId, text: `✅ ${sent} ta lidga eslatma yuborildi.` });
}

async function sendDashboard(chatId) {
  const auto = await getAutoOutreach();
  const daily = await getDailyAuto();
  const autoStatus = isAutoActive(auto) ? `yoqilgan, tugaydi: ${new Date(auto.until).toLocaleString('uz-UZ')}` : 'o‘chiq';
  const today = localDateKey();
  const todayCount = await countLeads(q => q.gte('outreach_at', `${today}T00:00:00+00:00`));
  const read = await countLeads(q => q.eq('status', 'tanishdim'));
  const payment = await countLeads(q => q.eq('status', 'payment_near'));
  const due = (await getReminderDue(100)).length;
  return tg('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text:
      `<b>🏠 OLYE Bot Panel</b>\n\n` +
      `📣 Auto Outreach: ${html(autoStatus)}\n` +
      `📅 Kunlik auto: ${daily.enabled ? `yoqilgan (${daily.start_time}, ${daily.duration_hours} soat)` : 'o‘chiq'}\n` +
      `Bugungi outreach: ${todayCount} ta\n` +
      `✅ Tanishdim: ${read} ta\n` +
      `💳 To‘lovga yaqin: ${payment} ta\n` +
      `⏰ Eslatma kerak: ${due} ta`,
    reply_markup: mainMenuKeyboard()
  });
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📣 Outreach', callback_data: 'outreach_menu' }, { text: '📊 Hisobot', callback_data: 'report' }],
      [{ text: '📄 Ma’lumot yuborilganlar', callback_data: 'list:info_sent' }],
      [{ text: '✅ Tanishdim yozganlar', callback_data: 'list:read' }, { text: '💳 To‘lovga yaqinlar', callback_data: 'list:payment' }],
      [{ text: '⏰ Eslatma keraklar', callback_data: 'list:reminders' }],
      [{ text: '✏️ Shablonlar', callback_data: 'templates' }, { text: '🩺 Bot holati', callback_data: 'diagnostics' }]
    ]
  };
}

function outreachKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🚀 Hozir 1 soat', callback_data: 'auto:1' }, { text: '🚀 Hozir 2 soat', callback_data: 'auto:2' }],
      [{ text: '🚀 Hozir 3 soat', callback_data: 'auto:3' }, { text: '⛔ Auto OFF', callback_data: 'auto:off' }],
      [{ text: '📅 Kunlik 07:00 / 2 soat', callback_data: 'daily:on_default' }],
      [{ text: '⛔ Kunlik auto OFF', callback_data: 'daily:off' }, { text: '⏸ Bugun ishlamasin', callback_data: 'daily:skip_today' }],
      [{ text: '📋 Bugungi hisobot', callback_data: 'report' }, { text: '⬅️ Menyu', callback_data: 'menu' }]
    ]
  };
}

async function sendOutreachMenu(chatId) {
  const auto = await getAutoOutreach();
  const daily = await getDailyAuto();
  return tg('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text:
      `<b>📣 Outreach boshqaruvi</b>\n\n` +
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

  if (text === '/start' || text === '/menu') return sendDashboard(chatId);
  if (text === '/whoami') return tg('sendMessage', { chat_id: chatId, text: `Sizning Telegram ID: ${msg.from.id}` });
  if (text === '/resetme') {
    await resetMeChat({ chatId, from: msg.from });
    return tg('sendMessage', { chat_id: chatId, text: '✅ Test profilingiz tozalandi. Endi qayta test qilishingiz mumkin.' });
  }

  if (text.startsWith('/auto')) {
    const arg = text.split(/\s+/)[1] || `${AUTO_OUTREACH_DEFAULT_HOURS}h`;
    if (arg === 'off') return autoOff(chatId);
    if (arg === 'today') {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const hours = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 3600000));
      return autoOn(chatId, hours);
    }
    const hours = Number(String(arg).replace('h', '')) || AUTO_OUTREACH_DEFAULT_HOURS;
    return autoOn(chatId, hours);
  }

  if (text === '/autooff') return autoOff(chatId);
  if (text === '/autostatus') return autoStatus(chatId);
  if (text === '/report') return sendReport(chatId);
  if (text === '/info') return sendList(chatId, 'info_sent');
  if (text === '/read') return sendList(chatId, 'read');
  if (text === '/payment') return sendList(chatId, 'payment');
  if (text === '/reminders') return sendList(chatId, 'reminders');
  if (text === '/pending') return sendList(chatId, 'pending');
  if (text === '/healthtemplates') return healthTemplates(chatId);
  if (text === '/diagnostics') return diagnostics(chatId);
  if (text === '/tick') return manualTick(chatId);

  if (text.startsWith('/setdaily ')) {
    const [, start, durationRaw] = text.split(/\s+/);
    const hours = Number(String(durationRaw || '').replace('h', '')) || DAILY_DEFAULT_DURATION_HOURS;
    const daily = await setDailyAuto({ enabled: true, start_time: start || DAILY_DEFAULT_START, duration_hours: hours, skip_date: null });
    return tg('sendMessage', { chat_id: chatId, text: `✅ Kunlik Auto Outreach sozlandi\n\nHar kuni: ${daily.start_time}\nDavomiylik: ${daily.duration_hours} soat` });
  }
  if (text === '/dailyoff') {
    await setDailyAuto({ enabled: false });
    return tg('sendMessage', { chat_id: chatId, text: '⛔ Kunlik Auto Outreach o‘chirildi.' });
  }
  if (text === '/dailystatus') return dailyStatus(chatId);

  if (text.startsWith('/gettemplate ')) {
    const key = text.split(/\s+/)[1];
    const body = await getTemplate(key);
    return tg('sendMessage', { chat_id: chatId, text: body ? `Template: ${key}\n\n${body}` : `Topilmadi: ${key}` });
  }
  if (text.startsWith('/settemplate ')) {
    const rest = text.replace('/settemplate ', '');
    const firstSpace = rest.indexOf(' ');
    if (firstSpace < 0) return tg('sendMessage', { chat_id: chatId, text: 'Format: /settemplate key yangi matn' });
    const key = rest.slice(0, firstSpace).trim();
    const body = rest.slice(firstSpace + 1).trim();
    await setTemplate(key, body);
    return tg('sendMessage', { chat_id: chatId, text: `✅ ${key} yangilandi.` });
  }

  if (text.startsWith('/leadsoff ')) {
    const id = text.split(/\s+/)[1];
    await updateLead(id, { stage: STAGE.DISABLED, status: 'disabled', bot_enabled: false });
    return tg('sendMessage', { chat_id: chatId, text: `🔕 ${id} o‘chirildi.` });
  }
  if (text.startsWith('/leadson ')) {
    const id = text.split(/\s+/)[1];
    await updateLead(id, { status: 'active', bot_enabled: true });
    return tg('sendMessage', { chat_id: chatId, text: `🔔 ${id} yoqildi.` });
  }
  if (text.startsWith('/reset ')) {
    const id = text.split(/\s+/)[1];
    await supabase.from('sent_actions').delete().eq('chat_id', String(id));
    await updateLead(id, { stage: STAGE.OUTREACH_SENT, status: 'active', bot_enabled: true, finished_at: null });
    return tg('sendMessage', { chat_id: chatId, text: `🔁 ${id} reset qilindi. Keyingi xabarida bot ask_application’dan boshlaydi.` });
  }
  if (text.startsWith('/status ')) {
    const id = text.split(/\s+/)[1];
    const lead = await getLead(id);
    return tg('sendMessage', { chat_id: chatId, text: lead ? leadCardText(lead) : 'Topilmadi.' });
  }

  return sendDashboard(chatId);
}

async function autoOn(chatId, hours) {
  const value = await enableAutoOutreach(hours, 'manual');
  return tg('sendMessage', {
    chat_id: chatId,
    text: `✅ Auto Outreach ${hours} soatga yoqildi.\n\nTugash vaqti: ${new Date(value.until).toLocaleString('uz-UZ')}\n\nShu vaqt ichida siz yozgan “Assalomu alaykum...” xabarlari eslab qolinadi va faqat o‘sha lidlarga bot avtomatik javob beradi.`
  });
}

async function autoOff(chatId) {
  await disableAutoOutreach(false);
  return tg('sendMessage', { chat_id: chatId, text: '⛔ Auto Outreach o‘chirildi.' });
}

async function autoStatus(chatId) {
  const auto = await getAutoOutreach();
  const text = isAutoActive(auto)
    ? `📣 Auto Outreach yoqilgan\nTugash vaqti: ${new Date(auto.until).toLocaleString('uz-UZ')}\nSession: ${auto.session_id}`
    : '📣 Auto Outreach o‘chiq';
  return tg('sendMessage', { chat_id: chatId, text });
}

async function dailyStatus(chatId) {
  const daily = await getDailyAuto();
  return tg('sendMessage', {
    chat_id: chatId,
    text: `📅 Kunlik Auto Outreach\n\nHolat: ${daily.enabled ? 'yoqilgan' : 'o‘chiq'}\nStart: ${daily.start_time}\nDavomiylik: ${daily.duration_hours} soat\nBugun skip: ${daily.skip_date === localDateKey() ? 'ha' : 'yo‘q'}\nOxirgi start: ${daily.last_started_date || '-'}`
  });
}

async function sendReport(chatId) {
  const auto = await getAutoOutreach();
  if (auto?.session_id) return sendAutoSessionReport(chatId, auto, false);
  const stages = [STAGE.OUTREACH_SENT, STAGE.ASKED_APPLICATION, STAGE.ASKED_INFO, STAGE.INFO_SENT_FINISHED, STAGE.PENDING_APPROVAL, STAGE.PAUSED, STAGE.DISABLED];
  const parts = [];
  for (const st of stages) {
    parts.push(`${st}: ${await countLeads(q => q.eq('stage', st))}`);
  }
  return tg('sendMessage', { chat_id: chatId, text: `📊 Hisobot\n\n${parts.join('\n')}` });
}

async function healthTemplates(chatId) {
  const keys = ['ask_application', 'ask_info', 'known_info_preface', 'unknown_info_preface', 'short_intro', 'full_intro', 'offer_end', 'application_link_reply', 'clarify_application', 'media_text_request', 'offer_followup'];
  const missing = [];
  for (const k of keys) if (!(await getTemplate(k))) missing.push(k);
  return tg('sendMessage', { chat_id: chatId, text: missing.length ? `⚠️ Yetishmayotgan template:\n${missing.join('\n')}` : '✅ Barcha kerakli template mavjud.' });
}

async function diagnostics(chatId) {
  const auto = await getAutoOutreach();
  const daily = await getDailyAuto();
  const missing = [];
  for (const k of ['ask_application', 'ask_info', 'full_intro', 'offer_end', 'offer_followup']) if (!(await getTemplate(k))) missing.push(k);
  return tg('sendMessage', {
    chat_id: chatId,
    text:
      `🩺 Bot holati\n\n` +
      `Webhook: /webhook-info orqali tekshiring\n` +
      `Supabase: ok\n` +
      `Auto Outreach: ${isAutoActive(auto) ? 'yoqilgan' : 'o‘chiq'}\n` +
      `Kunlik timer: ${daily.enabled ? 'yoqilgan' : 'o‘chiq'}\n` +
      `Local vaqt: ${localHHMM()}\n` +
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

  if (data === 'menu' || data === 'noop') return sendDashboard(chatId);
  if (data === 'outreach_menu') return sendOutreachMenu(chatId);
  if (data.startsWith('auto:')) {
    const arg = data.split(':')[1];
    if (arg === 'off') return autoOff(chatId);
    return autoOn(chatId, Number(arg) || AUTO_OUTREACH_DEFAULT_HOURS);
  }
  if (data === 'daily:on_default') {
    await setDailyAuto({ enabled: true, start_time: DAILY_DEFAULT_START, duration_hours: DAILY_DEFAULT_DURATION_HOURS, skip_date: null });
    return tg('sendMessage', { chat_id: chatId, text: `✅ Kunlik auto yoqildi: ${DAILY_DEFAULT_START}, ${DAILY_DEFAULT_DURATION_HOURS} soat` });
  }
  if (data === 'daily:off') {
    await setDailyAuto({ enabled: false });
    return tg('sendMessage', { chat_id: chatId, text: '⛔ Kunlik auto o‘chirildi.' });
  }
  if (data === 'daily:skip_today') {
    await setDailyAuto({ skip_date: localDateKey() });
    return tg('sendMessage', { chat_id: chatId, text: '⏸ Bugungi kun uchun auto outreach o‘chirildi. Ertaga yana odatdagidek ishlaydi.' });
  }
  if (data === 'report') return sendReport(chatId);
  if (data === 'diagnostics') return diagnostics(chatId);
  if (data === 'templates') return tg('sendMessage', { chat_id: chatId, text: '✏️ Shablonlar uchun buyruqlar:\n/gettemplate key\n/settemplate key yangi matn\n\nMuhim: supabase.sql eski shablonlarni overwrite qilmaydi.' });
  if (data.startsWith('list:')) return sendList(chatId, data.split(':')[1]);
  if (data === 'reminder_preview') return sendReminderPreview(chatId);
  if (data === 'reminder_confirm') return sendReminderConfirm(chatId);
}

function leadCardText(lead) {
  return `👤 Lid\nIsm: ${lead.first_name || '-'}\nUsername: ${lead.username ? '@' + lead.username : '-'}\nChat ID: ${lead.chat_id}\nStatus: ${lead.status}\nStage: ${lead.stage}\nBot: ${lead.bot_enabled ? 'yoqilgan' : 'o‘chiq'}\nOutreach: ${lead.outreach_sent ? 'ha' : 'yo‘q'}\nOxirgi xabar: ${lead.last_user_message || '-'}`;
}

// -------------------- HTTP routes --------------------
app.get('/', (_, res) => res.json({ ok: true, name: 'OLYE Info Bot v6', mode: 'info-only' }));
app.get('/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/webhook', (_, res) => res.json({ ok: true, note: 'Telegram uses POST /webhook' }));
app.get('/tick', async (_, res) => {
  await runSchedulerTick('http');
  res.json({ ok: true, ticked_at: new Date().toISOString() });
});

app.get('/set-webhook', async (req, res) => {
  try {
    const url = WEBHOOK_URL || `${req.protocol}://${req.get('host')}/webhook`;
    const result = await tg('setWebhook', {
      url,
      secret_token: WEBHOOK_SECRET || undefined,
      allowed_updates: ['message', 'callback_query', 'business_message']
    });
    res.json({ ok: true, url, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
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
      const chatId = String(update.message.chat?.id || '');
      const fromId = String(update.message.from?.id || '');
      if (fromId === String(OWNER_TELEGRAM_ID) || fromId === String(ADMIN_CHAT_ID) || chatId === String(ADMIN_CHAT_ID)) {
        await handleAdminMessage(update.message);
      }
    }
    if (update.business_message) await handleBusinessMessage(update.business_message);
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
