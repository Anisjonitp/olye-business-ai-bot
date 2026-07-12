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
  WAITING_APPLICATION_SUBMIT: 'waiting_application_submit',
  INFO_SENT_FINISHED: 'info_sent_finished',
  PAUSED: 'paused',
  DISABLED: 'disabled'
};

const STOP_STAGES = new Set([STAGE.INFO_SENT_FINISHED, STAGE.PAUSED, STAGE.DISABLED]);
const buffers = new Map();

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
    await logEvent(lead?.chat_id || 'unknown', 'send_skipped_no_business_connection', text.slice(0, 300));
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
  const { data, error } = await supabase
    .from('business_leads')
    .select('*')
    .eq('chat_id', String(chatId))
    .maybeSingle();
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
  const payload = {
    ...patch,
    updated_at: new Date().toISOString()
  };
  if (changedStage) payload.stage_started_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('business_leads')
    .update(payload)
    .eq('chat_id', String(chatId))
    .select()
    .maybeSingle();
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
    status: 'human_needed',
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

async function enableAutoOutreach(hours) {
  const now = Date.now();
  const until = now + hours * 60 * 60 * 1000;
  const sessionId = `outreach_${new Date(now).toISOString().slice(0, 10)}_${now}`;
  const value = { enabled: true, until, session_id: sessionId, started_at: now, hours };
  await setSetting('auto_outreach', value);
  return value;
}

async function disableAutoOutreach() {
  await setSetting('auto_outreach', { enabled: false, disabled_at: Date.now() });
}

function isAutoActive(auto) {
  return Boolean(auto?.enabled && Number(auto.until || 0) > Date.now());
}

function looksLikeOutreachGreeting(text = '') {
  const t = normalize(text);
  if (!t) return false;
  if (!t.includes('assalomu') && !t.includes('assalom') && !t.includes('salom')) return false;
  if (t.includes('maqola tayyor') || t.includes('chek') || t.includes('karta') || t.includes('tolov') || t.includes('to‘lov')) return false;
  return t.includes('yaxshimisiz') || t.includes('qalaysiz') || t.includes('yaxshilarmi') || t.length < 90;
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
    if (STOP_STAGES.has(existing.stage) || existing.status === 'disabled') return;
    await updateLead(chatId, patch);
  } else {
    await createLead({ chatId, businessConnectionId, from, text, stage: STAGE.OUTREACH_SENT, status: 'active', botEnabled: true });
    await updateLead(chatId, patch);
  }
  await logEvent(chatId, 'outreach_sent_detected', text);
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

  const hardReject = [
    'kerak emas', 'kerakmas', 'qiziq emas', 'yozmang', 'bezovta qilmang', 'stop', 'rad qilaman', 'xohlamayman'
  ];
  if (includesAny(t, hardReject)) return 'hard_reject';

  const later = ['keyinroq', 'hozir band', 'bandman', 'birozdan keyin', 'keyin yozaman', 'vaqtim yoq', "vaqtim yo'q"];
  if (includesAny(t, later)) return 'later';

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

  // Owner/admin outgoing message: remember outreach only. Do not respond.
  if (isOwnerMessage(msg)) {
    if (text) await markOutreach({ chatId, businessConnectionId, from: msg.from, text });
    const existing = await getLead(chatId);
    if (existing) await updateLead(chatId, { last_admin_message: text || '[media]', last_message_at: new Date().toISOString() });
    return;
  }

  if (isMediaOnly(msg)) {
    const lead = await upsertLeadBase({ chatId, businessConnectionId, from: msg.from, text: '[media]' });
    if (!lead || !lead.bot_enabled || STOP_STAGES.has(lead.stage)) return;
    if (AUTO_START_REQUIRE_OUTREACH && !lead.outreach_sent) return;
    const sent = await sendPackage(lead, 'media_text_request', ['media_text_request'], {});
    await logEvent(chatId, 'media_received', JSON.stringify(Object.keys(msg).slice(0, 10)));
    return sent;
  }

  const lead = await upsertLeadBase({ chatId, businessConnectionId, from: msg.from, text });
  if (!lead) return;

  // Default safety: if this was not an outreach chat, do not auto-answer.
  if (AUTO_START_REQUIRE_OUTREACH && !lead.outreach_sent) {
    await updateLead(chatId, { stage: STAGE.PENDING_APPROVAL, status: 'pending_approval', bot_enabled: false });
    await logEvent(chatId, 'ignored_not_outreach', text);
    return;
  }

  if (!lead.bot_enabled || STOP_STAGES.has(lead.stage)) return;
  enqueueLeadMessage(lead, text);
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
  if (!lead.bot_enabled || STOP_STAGES.has(lead.stage)) return;
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
    await sendPackage(lead, 'ask_application', ['ask_application'], {
      stage: STAGE.ASKED_APPLICATION,
      status: 'active',
      bot_enabled: true
    });
    return;
  }

  if (lead.stage === STAGE.ASKED_APPLICATION) {
    if (intent === 'application_confirmed' || intent === 'application_submitted') {
      await sendPackage(lead, 'ask_info', ['ask_info'], { stage: STAGE.ASKED_INFO });
      return;
    }

    if (intent === 'application_not_submitted') {
      await sendPackage(lead, 'application_link_reply', ['application_link_reply'], {
        stage: STAGE.INFO_SENT_FINISHED,
        status: 'human_needed',
        bot_enabled: false,
        finished_at: new Date().toISOString()
      });
      await sendAdmin(`🔗 <b>Ariza havolasi yuborildi</b>\nChat ID: <code>${lead.chat_id}</code>\nEndi chatni qo‘lda davom ettiring.`);
      return;
    }

    // One clarification only. If unclear again, stop for admin.
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

    // If the user says no_info OR asks something unclear, still send full info and finish.
    const after = await sendPackage(lead, 'unknown_info_package', ['unknown_info_preface', 'full_intro', 'offer_end'], {});
    await finishAfterInfo(after || lead);
    return;
  }

  // Any other stage should be safe: do not continue automatically.
  await updateLead(lead.chat_id, { stage: STAGE.PAUSED, status: 'needs_admin', bot_enabled: false });
  await logEvent(lead.chat_id, 'unexpected_stage_stopped', `${lead.stage}: ${text}`);
}

// -------------------- Admin commands --------------------
async function handleAdminMessage(msg) {
  const chatId = String(msg.chat?.id || '');
  const text = String(msg.text || '').trim();
  if (!text) return;

  if (text === '/start' || text === '/menu') return sendMenu(chatId);
  if (text === '/whoami') return tg('sendMessage', { chat_id: chatId, text: `Sizning Telegram ID: ${msg.from.id}` });

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
  if (text === '/pending') return sendPending(chatId);
  if (text === '/healthtemplates') return healthTemplates(chatId);

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

  return sendMenu(chatId);
}

async function sendMenu(chatId) {
  const auto = await getAutoOutreach();
  const status = isAutoActive(auto) ? `yoqilgan, tugaydi: ${new Date(auto.until).toLocaleString('uz-UZ')}` : 'o‘chiq';
  return tg('sendMessage', {
    chat_id: chatId,
    text: `OLYE Info Bot v6\n\nAuto Outreach: ${status}\n\nBu versiya faqat ma’lumot + oferta yuboradi va keyin to‘xtaydi.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '📣 Auto 1 soat', callback_data: 'auto:1' }, { text: '📣 Auto 2 soat', callback_data: 'auto:2' }],
        [{ text: '📣 Auto 3 soat', callback_data: 'auto:3' }, { text: '⛔ Auto OFF', callback_data: 'auto:off' }],
        [{ text: '📊 Hisobot', callback_data: 'report' }, { text: '🆕 Pending', callback_data: 'pending' }],
        [{ text: '🧹 Pending tozalash', callback_data: 'clear_pending' }]
      ]
    }
  });
}

async function autoOn(chatId, hours) {
  const value = await enableAutoOutreach(hours);
  return tg('sendMessage', {
    chat_id: chatId,
    text: `✅ Auto Outreach ${hours} soatga yoqildi.\n\nTugash vaqti: ${new Date(value.until).toLocaleString('uz-UZ')}\n\nShu vaqt ichida siz yozgan “Assalomu alaykum...” xabarlari eslab qolinadi va faqat o‘sha lidlarga bot avtomatik javob beradi.`
  });
}

async function autoOff(chatId) {
  await disableAutoOutreach();
  return tg('sendMessage', { chat_id: chatId, text: '⛔ Auto Outreach o‘chirildi.' });
}

async function autoStatus(chatId) {
  const auto = await getAutoOutreach();
  const text = isAutoActive(auto)
    ? `📣 Auto Outreach yoqilgan\nTugash vaqti: ${new Date(auto.until).toLocaleString('uz-UZ')}\nSession: ${auto.session_id}`
    : '📣 Auto Outreach o‘chiq';
  return tg('sendMessage', { chat_id: chatId, text });
}

async function sendReport(chatId) {
  const stages = [STAGE.OUTREACH_SENT, STAGE.ASKED_APPLICATION, STAGE.ASKED_INFO, STAGE.INFO_SENT_FINISHED, STAGE.PENDING_APPROVAL, STAGE.PAUSED, STAGE.DISABLED];
  const parts = [];
  for (const st of stages) {
    const { count } = await supabase.from('business_leads').select('*', { count: 'exact', head: true }).eq('stage', st);
    parts.push(`${st}: ${count || 0}`);
  }
  return tg('sendMessage', { chat_id: chatId, text: `📊 Hisobot\n\n${parts.join('\n')}` });
}

async function sendPending(chatId) {
  const { data, error } = await supabase
    .from('business_leads')
    .select('*')
    .in('stage', [STAGE.PENDING_APPROVAL, STAGE.OUTREACH_SENT, STAGE.PAUSED])
    .order('updated_at', { ascending: false })
    .limit(20);
  if (error) return tg('sendMessage', { chat_id: chatId, text: `Xato: ${error.message}` });
  if (!data?.length) return tg('sendMessage', { chat_id: chatId, text: 'Pending lidlar yo‘q.' });
  return tg('sendMessage', { chat_id: chatId, text: data.map(leadCardText).join('\n\n---\n\n') });
}

async function healthTemplates(chatId) {
  const keys = ['ask_application', 'ask_info', 'known_info_preface', 'unknown_info_preface', 'short_intro', 'full_intro', 'offer_end', 'application_link_reply', 'clarify_application', 'media_text_request'];
  const missing = [];
  for (const k of keys) {
    if (!(await getTemplate(k))) missing.push(k);
  }
  return tg('sendMessage', { chat_id: chatId, text: missing.length ? `⚠️ Yetishmayotgan template:\n${missing.join('\n')}` : '✅ Barcha kerakli template mavjud.' });
}

async function handleCallback(cb) {
  const data = cb.data || '';
  const chatId = cb.message?.chat?.id;
  await answerCallback(cb.id);
  if (!chatId) return;
  if (data.startsWith('auto:')) {
    const arg = data.split(':')[1];
    if (arg === 'off') return autoOff(chatId);
    return autoOn(chatId, Number(arg) || AUTO_OUTREACH_DEFAULT_HOURS);
  }
  if (data === 'report') return sendReport(chatId);
  if (data === 'pending') return sendPending(chatId);
  if (data === 'clear_pending') {
    return tg('sendMessage', {
      chat_id: chatId,
      text: 'Tasdiq kutayotgan/pending lidlar disabled qilinadi. Tasdiqlaysizmi?',
      reply_markup: { inline_keyboard: [[{ text: '✅ Ha, tozalash', callback_data: 'clear_pending_yes' }, { text: '❌ Bekor qilish', callback_data: 'noop' }]] }
    });
  }
  if (data === 'clear_pending_yes') {
    const { data: rows } = await supabase.from('business_leads').select('chat_id').in('stage', [STAGE.PENDING_APPROVAL, STAGE.PAUSED]);
    const ids = (rows || []).map(r => r.chat_id);
    if (ids.length) {
      await supabase.from('business_leads').update({ stage: STAGE.DISABLED, status: 'disabled', bot_enabled: false, updated_at: new Date().toISOString() }).in('chat_id', ids);
    }
    return tg('sendMessage', { chat_id: chatId, text: `🧹 ${ids.length} ta lid disabled qilindi.` });
  }
}

function leadCardText(lead) {
  return `👤 Lid\nIsm: ${lead.first_name || '-'}\nUsername: ${lead.username ? '@' + lead.username : '-'}\nChat ID: ${lead.chat_id}\nStatus: ${lead.status}\nStage: ${lead.stage}\nBot: ${lead.bot_enabled ? 'yoqilgan' : 'o‘chiq'}\nOutreach: ${lead.outreach_sent ? 'ha' : 'yo‘q'}\nOxirgi xabar: ${lead.last_user_message || '-'}`;
}

// -------------------- HTTP routes --------------------
app.get('/', (_, res) => res.json({ ok: true, name: 'OLYE Info Bot v6', mode: 'info-only' }));
app.get('/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/webhook', (_, res) => res.json({ ok: true, note: 'Telegram uses POST /webhook' }));

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
function html(s = '') {
  return String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
}

app.listen(PORT, () => {
  console.log(`OLYE Info Bot v6 running on port ${PORT}`);
});
