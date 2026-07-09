import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? String(process.env.ADMIN_CHAT_ID) : '';
const OWNER_TELEGRAM_ID = process.env.OWNER_TELEGRAM_ID ? String(process.env.OWNER_TELEGRAM_ID) : '';
// Business profil egasining Telegram user ID'si. Bot o'zingiz yozgan xabarlarga javob bermasligi uchun MUHIM.
const BUSINESS_OWNER_ID = process.env.BUSINESS_OWNER_ID ? String(process.env.BUSINESS_OWNER_ID) : OWNER_TELEGRAM_ID;
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || '')
  .split(',')
  .map(x => x.trim())
  .filter(Boolean);
const IGNORE_FROM_IDS = new Set([OWNER_TELEGRAM_ID, BUSINESS_OWNER_ID, ...ADMIN_USER_IDS].filter(Boolean));
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

// silent_queue = DB'da yo'q chatlarni admin xabarisiz navbatga qo'yadi.
// approval = yangi chatda admin chatga tugmali signal yuboradi.
// auto = salomdan keyin avtomatik oqim boshlaydi.
const FIRST_CONTACT_MODE = (process.env.FIRST_CONTACT_MODE || 'silent_queue').toLowerCase();
const AI_CONFIDENCE_MIN = Number(process.env.AI_CONFIDENCE_MIN || 0.65);

// Aqlli turn processing:
// - lid ketma-ket yozgan xabarlarni bitta batch qiladi;
// - bitta chatda bir vaqtda faqat bitta jarayon ishlaydi;
// - bot yangi savol yuborgandan keyin juda qisqa/generic davom-xabarlarni keyingi javob deb olmaydi.
const MESSAGE_BUFFER_MS = Number(process.env.MESSAGE_BUFFER_MS || 7000);
const TURN_COOLDOWN_MS = Number(process.env.TURN_COOLDOWN_MS || 12000);
const MAX_BATCH_MESSAGES = Number(process.env.MAX_BATCH_MESSAGES || 8);
const MAX_BATCH_CHARS = Number(process.env.MAX_BATCH_CHARS || 3000);
const CHAT_LOCK_MS = Number(process.env.CHAT_LOCK_MS || 30000);
const PACKAGE_MESSAGE_DELAY_MS = Number(process.env.PACKAGE_MESSAGE_DELAY_MS || 500);
// Bir xil stage'da bir xil qisqa qaytaruvchi javob qayta-qayta ketmasligi uchun.
const SAME_ACTION_COOLDOWN_MS = Number(process.env.SAME_ACTION_COOLDOWN_MS || 10 * 60 * 1000);

// Oferta follow-up: offer_end yuborilgandan keyin lid "tanishdim" demasa bir marta eslatma.
const OFFER_FOLLOWUP_MS = Number(process.env.OFFER_FOLLOWUP_MS || 60 * 60 * 1000);
const FOLLOWUP_TICK_MS = Number(process.env.FOLLOWUP_TICK_MS || 5 * 60 * 1000);

// Ariza havolasi va ish vaqti. Shablonlarda {APPLICATION_LINK} avtomatik shu qiymatga almashadi.
const APPLICATION_LINK = process.env.APPLICATION_LINK || '';
const QUIET_HOURS_ENABLED = String(process.env.QUIET_HOURS_ENABLED || 'false').toLowerCase() === 'true';
const QUIET_HOURS_START = process.env.QUIET_HOURS_START || '07:00';
const QUIET_HOURS_END = process.env.QUIET_HOURS_END || '23:00';

// Outreach Auto: siz yuborgan salomlarni eslab, faqat o'sha chatlarga avto start qilish.
const AUTO_START_REQUIRE_OUTREACH = String(process.env.AUTO_START_REQUIRE_OUTREACH || 'true').toLowerCase() !== 'false';
const DEFAULT_OUTREACH_HOURS = Number(process.env.DEFAULT_OUTREACH_HOURS || 2);
// Admin/Business profil egasi o'zi yozgan xabarlaridan chat mavzusini avtomatik aniqlash.
// Masalan admin qo'lda oferta yuborsa, bot stage=waiting_offer_read deb eslab qoladi.
const AUTO_TOPIC_FROM_OUTGOING = String(process.env.AUTO_TOPIC_FROM_OUTGOING || 'true').toLowerCase() !== 'false';
// Admin qo'lda xabar yuborganda bot o'sha chatga darrov aralashib ketmasligi uchun.
const ADMIN_TAKEOVER_PAUSE_MS = Number(process.env.ADMIN_TAKEOVER_PAUSE_MS || 60000);
// Admin qo'lda narx/ma'lumot/karta kabi mavzuni yuborgan bo'lsa, bot shu mavzuni qayta yubormasligi uchun uzunroq cooldown.
const MANUAL_TOPIC_COOLDOWN_MS = Number(process.env.MANUAL_TOPIC_COOLDOWN_MS || 10 * 60 * 1000);

if (!BOT_TOKEN) throw new Error('BOT_TOKEN missing');
if (!SUPABASE_URL) throw new Error('SUPABASE_URL missing');
if (!SUPABASE_KEY) throw new Error('SUPABASE key missing');
if (!ADMIN_CHAT_ID) console.warn('ADMIN_CHAT_ID missing. Admin menu will not work.');

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Per-chat in-memory turn queue. Render'da odatda bitta instance bo'ladi;
// shuning uchun bu Telegram webhook burstlarini tartiblash uchun yetarli va tez.
const businessTurnBuffers = new Map();

const STAGE = Object.freeze({
  NEW: 'new',
  ASKED_APPLICATION: 'asked_application',
  ASKED_INFO: 'asked_info',
  WAITING_APPLICATION_SUBMIT: 'waiting_application_submit',
  WAITING_OFFER_READ: 'waiting_offer_read',
  ASKED_BIO_CONFIRM: 'asked_bio_confirm',
  BIO_QUESTIONS_SENT: 'bio_questions_sent',
  PAUSED: 'paused',
  NEEDS_ADMIN: 'needs_admin',
  HUMAN_NEEDED: 'human_needed',
  STOPPED: 'stopped',
  DISABLED: 'disabled'
});

const STATUS = Object.freeze({
  PENDING: 'pending_approval',
  OUTREACH: 'outreach_sent',
  ACTIVE: 'active',
  PAUSED: 'paused',
  NEEDS_ADMIN: 'needs_admin',
  HUMAN_NEEDED: 'human_needed',
  STOPPED: 'stopped',
  DISABLED: 'disabled'
});

const FINAL_STATUSES = new Set([STATUS.STOPPED, STATUS.DISABLED]);
const STOP_STAGES = new Set([STAGE.BIO_QUESTIONS_SENT, STAGE.STOPPED, STAGE.DISABLED, STAGE.PAUSED, STAGE.NEEDS_ADMIN, STAGE.HUMAN_NEEDED]);
const ACTIVE_STAGES = [STAGE.ASKED_APPLICATION, STAGE.WAITING_APPLICATION_SUBMIT, STAGE.ASKED_INFO, STAGE.WAITING_OFFER_READ, STAGE.ASKED_BIO_CONFIRM];

const TEMPLATE_TITLES = {
  ask_application: 'Ariza/qiziqishni tasdiqlash',
  ask_info: 'Ma’lumot bor-yo‘qligini so‘rash',
  application_link_reply: 'Ariza havolasini yuborish',
  short_intro: 'Qisqa tanishtiruv',
  full_intro: 'To‘liq tanishtiruv',
  explain_reply: 'Loyiha haqida tushuntirish boshlanishi',
  offer_end: 'Oferta oxiri',
  offer_followup: 'Oferta follow-up eslatmasi',
  ask_bio_confirm: 'Biografik maqola taklifi',
  bio_questions: 'Biografik savollar',
  price_reply: 'Narx/badal savoliga javob',
  card_reply: 'Karta/to‘lov rekvizitlari',
  expensive_reply: 'Qimmat ekan javobi',
  human_takeover_reply: 'Operatorga o‘tkazish javobi',
  voice_text_request: 'Ovozli xabar o‘rniga matn so‘rash',
  media_text_request: 'Media/fayl o‘rniga matn so‘rash',
  next_steps_reply: 'Nima qilish kerak javobi',
  later_reply: 'Keyinroq javobi',
  reject_reply: 'Rad javobi'
};

// -------------------- Helpers --------------------

function nowIso() {
  return new Date().toISOString();
}

function str(v) {
  return v === undefined || v === null ? '' : String(v);
}

function htmlEscape(text = '') {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function clip(text = '', max = 3500) {
  const s = String(text || '');
  return s.length <= max ? s : s.slice(0, max - 20) + '\n...';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function stableHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 32);
}

function addMsIso(ms) {
  return new Date(Date.now() + Number(ms || 0)).toISOString();
}

function safeBridgeText(text = '') {
  let s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  // Chat davom etayotgan paytda AI bridge boshida qayta salomlashib yubormasin.
  s = s.replace(
    /^(assalomu alaykum|assalom|salom|va alaykum assalom|vaalaykum assalom|valaykum assalom)[,!.\s]+/i,
    ''
  ).trim();

  return s.slice(0, 900);
}

function msSince(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return Date.now() - t;
}

function normalizeText(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/ў/g, "o'")
    .replace(/ғ/g, "g'")
    .replace(/[.,!?！？;:()\[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderTemplate(body = '') {
  return String(body || '')
    .replaceAll('{APPLICATION_LINK}', APPLICATION_LINK || 'APPLICATION_LINK_KIRITILMAGAN')
    .replaceAll('{TODAY}', new Date().toLocaleDateString('uz-UZ'));
}

function parseHm(value = '00:00') {
  const [h, m] = String(value).split(':').map(n => Number(n));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function isInsideQuietHours() {
  if (!QUIET_HOURS_ENABLED) return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const start = parseHm(QUIET_HOURS_START);
  const end = parseHm(QUIET_HOURS_END);
  if (start <= end) return current < start || current > end;
  return current > end && current < start;
}

function isOwnerBusinessSender(message) {
  const fromId = str(message?.from?.id);
  if (!fromId) return false;
  return fromId === BUSINESS_OWNER_ID || fromId === OWNER_TELEGRAM_ID || ADMIN_USER_IDS.includes(fromId);
}

function mediaTemplateKey(message) {
  if (message?.voice || message?.audio || message?.video_note) return 'voice_text_request';
  if (message?.photo || message?.sticker || message?.document || message?.video || message?.animation) return 'media_text_request';
  return null;
}

function parseCommand(text = '') {
  const trimmed = String(text || '').trim();
  const [cmdRaw, ...rest] = trimmed.split(/\s+/);
  const cmd = (cmdRaw || '').split('@')[0].toLowerCase();
  const args = trimmed.slice((cmdRaw || '').length).trim();
  return { cmd, args };
}

function isAdminMessage(msg) {
  const chatId = str(msg?.chat?.id);
  const fromId = str(msg?.from?.id);
  if (IGNORE_FROM_IDS.has(fromId)) return true;
  if (ADMIN_CHAT_ID && chatId === ADMIN_CHAT_ID) return true;
  return false;
}

function isIgnoredBusinessSender(message) {
  const fromId = str(message?.from?.id);
  if (message?.from?.is_bot) return true;
  if (IGNORE_FROM_IDS.has(fromId)) return true;
  // Telegram Business'da ayrim avtomatik/outgoing xabarlarda shu flaglar kelishi mumkin.
  // Bularni qayta ishlamasak, bot o'zi yoki admin yozgan xabarga javob qaytarmaydi.
  if (message?.is_from_offline) return true;
  if (message?.sender_business_bot) return true;
  return false;
}

function leadTitle(lead) {
  const name = lead.first_name || '-';
  const username = lead.username ? `@${lead.username}` : '';
  return `${name}${username ? ' ' + username : ''}`.trim() || lead.chat_id;
}

function leadShortLine(lead, i = null) {
  const prefix = i === null ? '' : `${i + 1}. `;
  return `${prefix}${leadTitle(lead)}\nChat ID: ${lead.chat_id}\nStage: ${lead.stage}\nXabar: ${clip(lead.last_user_message || '-', 120)}`;
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
    console.error('Telegram API error:', method, JSON.stringify(data));
    throw new Error(data?.description || `Telegram API error: ${method}`);
  }
  return data.result;
}

async function sendMessage(chatId, text, extra = {}) {
  return tg('sendMessage', { chat_id: chatId, text: clip(text, 4096), ...extra });
}

async function editMessage(chatId, messageId, text, extra = {}) {
  try {
    return await tg('editMessageText', { chat_id: chatId, message_id: messageId, text: clip(text, 4096), ...extra });
  } catch (err) {
    // Agar eski xabarni edit qilib bo'lmasa, yangi xabar yuboramiz.
    return sendMessage(chatId, text, extra);
  }
}

async function answerCallbackQuery(callbackQueryId, text = '') {
  try {
    await tg('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
  } catch (err) {
    console.error('answerCallbackQuery:', err.message);
  }
}

async function sendAdmin(text, extra = {}) {
  if (!ADMIN_CHAT_ID) return null;
  try {
    return await sendMessage(ADMIN_CHAT_ID, text, { parse_mode: 'HTML', ...extra });
  } catch (err) {
    console.error('sendAdmin:', err.message);
    return null;
  }
}

async function sendBusinessMessage({ chatId, businessConnectionId, text }) {
  if (!businessConnectionId) {
    console.warn('No business_connection_id for chat:', chatId);
    return null;
  }
  return tg('sendMessage', {
    chat_id: chatId,
    business_connection_id: businessConnectionId,
    text: clip(text, 4096)
  });
}

// -------------------- Keyboards --------------------

function adminMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 Hisobot', callback_data: 'menu:report' },
        { text: '🆕 Tasdiq kutayotganlar', callback_data: 'list:pending' }
      ],
      [
        { text: '🟢 Faol lidlar', callback_data: 'list:active' },
        { text: '🟡 Chala lidlar', callback_data: 'list:stalled' }
      ],
      [
        { text: '⚠️ AI/Operator', callback_data: 'list:needs_admin' },
        { text: '🔥 Issiq lidlar', callback_data: 'list:hot' }
      ],
      [
        { text: '✅ Savollargacha yetganlar', callback_data: 'list:reached' },
        { text: '📣 Outreach Auto', callback_data: 'menu:outreach' }
      ],
      [
        { text: '✏️ Shablonlar', callback_data: 'tmpl:list' },
        { text: '⚙️ Yordam', callback_data: 'menu:help' }
      ]
    ]
  };
}

function backMenuKeyboard() {
  return { inline_keyboard: [[{ text: '⬅️ Menyu', callback_data: 'menu:main' }]] };
}

function templateListKeyboard() {
  const rows = Object.entries(TEMPLATE_TITLES).map(([key, title]) => [
    { text: title, callback_data: `tmpl:view:${key}` }
  ]);
  rows.push([{ text: '⬅️ Menyu', callback_data: 'menu:main' }]);
  return { inline_keyboard: rows };
}

function templateViewKeyboard(key) {
  return {
    inline_keyboard: [
      [{ text: '✏️ Tahrirlash', callback_data: `tmpl:edit:${key}` }],
      [{ text: '⬅️ Shablonlar', callback_data: 'tmpl:list' }]
    ]
  };
}

function leadListKeyboard(leads, listType = 'active') {
  const rows = (leads || []).map((lead, i) => [{
    text: `${i + 1}. ${lead.first_name || lead.chat_id} — ${lead.stage}`.slice(0, 60),
    callback_data: `lead:view:${lead.chat_id}`
  }]);
  rows.push([{ text: '🔄 Yangilash', callback_data: `list:${listType}` }]);
  if (['pending', 'stalled', 'needs_admin'].includes(listType) && (leads || []).length) {
    rows.push([{ text: '🧹 Barchasini rad/disabled qilish', callback_data: `clear:confirm:${listType}` }]);
  }
  rows.push([{ text: '⬅️ Menyu', callback_data: 'menu:main' }]);
  return { inline_keyboard: rows };
}

function leadCardKeyboard(lead) {
  const chatId = lead.chat_id;
  const rows = [];

  if (lead.status === STATUS.PENDING || lead.stage === STAGE.NEW) {
    rows.push([{ text: '🤖 Mos joydan davom ettirish', callback_data: `lead:start:${chatId}` }]);
  }

  if (lead.status === STATUS.NEEDS_ADMIN || lead.stage === STAGE.NEEDS_ADMIN) {
    rows.push([
      { text: '✅ Ha deb davom ettirish', callback_data: `lead:force_yes:${chatId}` },
      { text: '❌ Yo‘q/to‘xtatish', callback_data: `lead:force_no:${chatId}` }
    ]);
  }

  rows.push([
    { text: '🔗 Ariza havolasi', callback_data: `lead:send_app:${chatId}` },
    { text: '📄 Ma’lumot berish', callback_data: `lead:send_info:${chatId}` }
  ]);

  rows.push([
    { text: '⏸ To‘xtatish', callback_data: `lead:pause:${chatId}` },
    { text: '🔁 Qayta boshlash', callback_data: `lead:restart:${chatId}` }
  ]);
  rows.push([
    { text: '🔔 Yoqish', callback_data: `lead:on:${chatId}` },
    { text: '🔕 O‘chirish', callback_data: `lead:off:${chatId}` }
  ]);
  rows.push([{ text: '📌 Yangilash', callback_data: `lead:view:${chatId}` }]);
  rows.push([{ text: '⬅️ Menyu', callback_data: 'menu:main' }]);
  return { inline_keyboard: rows };
}

// -------------------- Supabase helpers --------------------

async function getTemplate(key) {
  const { data, error } = await supabase
    .from('reply_templates')
    .select('key,title,body')
    .eq('key', key)
    .maybeSingle();
  if (error) {
    console.error('getTemplate:', error);
    return null;
  }
  return data || null;
}

async function getTemplateBody(key) {
  const tmpl = await getTemplate(key);
  return tmpl?.body || null;
}

async function setTemplate(key, body) {
  if (!TEMPLATE_TITLES[key]) throw new Error(`Unknown template key: ${key}`);
  const { error } = await supabase.from('reply_templates').upsert({
    key,
    title: TEMPLATE_TITLES[key],
    body,
    updated_at: nowIso()
  });
  if (error) throw error;
}

async function listTemplates() {
  const { data, error } = await supabase
    .from('reply_templates')
    .select('key,title,updated_at')
    .order('key');
  if (error) throw error;
  return data || [];
}

async function logEvent(chatId, eventType, message = '') {
  try {
    const { error } = await supabase.from('lead_events').insert({
      chat_id: str(chatId),
      event_type: eventType,
      message: String(message || '').slice(0, 4000)
    });
    if (error) console.error('logEvent:', error);
  } catch (err) {
    console.error('logEvent:', err.message);
  }
}

async function markProcessed(chatId, messageId) {
  if (!chatId || !messageId) return true;
  try {
    const { error } = await supabase.from('processed_messages').insert({
      chat_id: str(chatId),
      message_id: str(messageId),
      created_at: nowIso()
    });
    if (error) {
      if (error.code === '23505') return false;
      console.error('markProcessed:', error);
      return true;
    }
    return true;
  } catch (err) {
    console.error('markProcessed:', err.message);
    return true;
  }
}

async function getLead(chatId) {
  const { data, error } = await supabase
    .from('business_leads')
    .select('*')
    .eq('chat_id', str(chatId))
    .maybeSingle();
  if (error) {
    console.error('getLead:', error);
    return null;
  }
  return data || null;
}

async function createLead({ chatId, businessConnectionId, from, text, status = STATUS.ACTIVE, botEnabled = true }) {
  const payload = {
    chat_id: str(chatId),
    business_connection_id: businessConnectionId || null,
    first_name: from?.first_name || null,
    username: from?.username || null,
    status,
    stage: STAGE.NEW,
    bot_enabled: botEnabled,
    is_old_lead: false,
    last_user_message: text || '',
    last_message_at: nowIso(),
    review_stage: null,
    updated_at: nowIso()
  };

  const { data, error } = await supabase
    .from('business_leads')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('createLead:', error);
    return null;
  }
  await logEvent(chatId, 'lead_created', text || '');
  return data;
}

async function updateLead(chatId, patch) {
  const { data, error } = await supabase
    .from('business_leads')
    .update({ ...patch, updated_at: nowIso() })
    .eq('chat_id', str(chatId))
    .select()
    .maybeSingle();
  if (error) {
    console.error('updateLead:', error);
    return null;
  }
  return data || null;
}

async function findOrCreateLead({ chatId, businessConnectionId, from, text, status = STATUS.ACTIVE, botEnabled = true }) {
  const existing = await getLead(chatId);
  if (existing) {
    return updateLead(chatId, {
      business_connection_id: businessConnectionId || existing.business_connection_id,
      first_name: from?.first_name || existing.first_name,
      username: from?.username || existing.username,
      last_user_message: text || existing.last_user_message,
      last_message_at: nowIso()
    });
  }
  return createLead({ chatId, businessConnectionId, from, text, status, botEnabled });
}

async function getAdminSession(chatId) {
  const { data, error } = await supabase
    .from('admin_sessions')
    .select('*')
    .eq('chat_id', str(chatId))
    .maybeSingle();
  if (error) {
    console.error('getAdminSession:', error);
    return null;
  }
  return data || null;
}

async function setAdminSession(chatId, mode, payload = {}) {
  const { error } = await supabase.from('admin_sessions').upsert({
    chat_id: str(chatId),
    mode,
    payload,
    updated_at: nowIso()
  });
  if (error) throw error;
}

async function clearAdminSession(chatId) {
  const { error } = await supabase
    .from('admin_sessions')
    .delete()
    .eq('chat_id', str(chatId));
  if (error) console.error('clearAdminSession:', error);
}

async function getSetting(key, fallback = null) {
  try {
    const { data, error } = await supabase.from('bot_settings').select('value').eq('key', key).maybeSingle();
    if (error) return fallback;
    return data?.value ?? fallback;
  } catch {
    return fallback;
  }
}

async function setSetting(key, value) {
  const { error } = await supabase.from('bot_settings').upsert({ key, value, updated_at: nowIso() });
  if (error) throw error;
}

function defaultGreetingPatterns() {
  return [
    'assalomu alaykum',
    'assalomu alaykum yaxshimisiz',
    'assalomu alaykum, yaxshimisiz',
    'assalomu alaykum * yaxshimisiz'
  ];
}

async function getGreetingPatterns() {
  const value = await getSetting('greeting_patterns', null);
  if (Array.isArray(value) && value.length) return value.map(String);
  return defaultGreetingPatterns();
}

function patternMatches(text, pattern) {
  const t = normalizeText(text).replace(/,/g, '');
  const p = normalizeText(pattern).replace(/,/g, '');
  if (!p) return false;
  if (!p.includes('*')) return t.includes(p);
  const parts = p.split('*').map(x => x.trim()).filter(Boolean);
  let pos = 0;
  for (const part of parts) {
    const idx = t.indexOf(part, pos);
    if (idx < 0) return false;
    pos = idx + part.length;
  }
  return true;
}

async function isOutreachGreeting(text) {
  const patterns = await getGreetingPatterns();
  return patterns.some(p => patternMatches(text, p));
}

function parseDurationToMs(arg = '') {
  const a = String(arg || '').trim().toLowerCase();
  if (!a || a === 'default') return DEFAULT_OUTREACH_HOURS * 60 * 60 * 1000;
  if (a === 'today' || a === 'bugun') {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return Math.max(5 * 60 * 1000, end.getTime() - Date.now());
  }
  const m = a.match(/^(\d+(?:\.\d+)?)(h|soat|m|min|daq)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] || 'h';
  if (!Number.isFinite(n) || n <= 0) return null;
  if (['m','min','daq'].includes(unit)) return n * 60 * 1000;
  return n * 60 * 60 * 1000;
}

async function enableOutreachAuto(durationMs) {
  const until = new Date(Date.now() + durationMs).toISOString();
  const sessionId = `outreach_${new Date().toISOString().slice(0, 10)}_${stableHash(until).slice(0, 6)}`;
  await setSetting('outreach_auto', { enabled: true, until, session_id: sessionId, started_at: nowIso() });
  return { until, sessionId };
}

async function disableOutreachAuto() {
  await setSetting('outreach_auto', { enabled: false, until: null, session_id: null, stopped_at: nowIso() });
}

async function getOutreachAutoState() {
  const value = await getSetting('outreach_auto', { enabled: false });
  const until = value?.until ? new Date(value.until).getTime() : 0;
  const active = Boolean(value?.enabled && until && until > Date.now());
  return { ...value, active };
}

async function maybeRecordOutgoingOutreach(message) {
  const text = (message?.text || message?.caption || '').trim();
  if (!text) return false;
  const state = await getOutreachAutoState();
  if (!state.active) return false;
  if (!(await isOutreachGreeting(text))) return false;

  const chatId = message?.chat?.id;
  if (!chatId) return false;
  const businessConnectionId = message?.business_connection_id || message?.business_connection?.id || null;

  const existing = await getLead(chatId);
  const patch = {
    business_connection_id: businessConnectionId || existing?.business_connection_id || null,
    status: STATUS.OUTREACH,
    bot_enabled: false,
    stage: existing?.stage && existing.stage !== STAGE.DISABLED ? existing.stage : STAGE.NEW,
    outreach_sent_at: nowIso(),
    outreach_session_id: state.session_id || null,
    last_bot_message: text,
    last_bot_sent_at: nowIso(),
    last_bot_template_key: 'manual_outreach_greeting'
  };

  if (existing) await updateLead(chatId, patch);
  else await createLead({ chatId, businessConnectionId, from: message.from || {}, text, status: STATUS.OUTREACH, botEnabled: false });
  await updateLead(chatId, patch);
  await logEvent(chatId, 'outreach_greeting_recorded', text);
  return true;
}


function detectOutgoingTopicFromText(text = '') {
  const t = normalizeText(text);
  if (!t) return null;

  // Eng aniq shablonlardan boshlab tekshiramiz. Bu outgoing xabarni "chat mavzusi"ga aylantiradi.
  if (hasAny(t, ['ariza qoldirgansiz', 'shunaqami']) && hasAny(t, ['ozbekiston lider yoshlari', "o'zbekiston lider yoshlari", 'ensiklopediya'])) {
    return { stage: STAGE.ASKED_APPLICATION, templateKey: 'ask_application', topic: 'ask_application', status: STATUS.ACTIVE, botEnabled: true };
  }

  if (hasAny(t, ['ariza qoldiring', 'ariza havolasi', 'ariza qoldirish', 'avval ushbu havola']) || (APPLICATION_LINK && t.includes(normalizeText(APPLICATION_LINK)))) {
    return { stage: STAGE.WAITING_APPLICATION_SUBMIT, templateKey: 'application_link_reply', topic: 'application_link', status: STATUS.ACTIVE, botEnabled: true };
  }

  // Admin qo'lda narx/to'lov/karta bo'yicha javob yuborsa, bot shu mavzuni qayta yubormasligi kerak.
  // Bunda asosiy stage saqlanadi: narx/karta side-question hisoblanadi, oqimni bio taklifga sakratmaydi.
  const manualCardSignals = ['karta raqam', 'karta raqami', 'karta egasi', 'plastik', 'rekvizit', 'hisob raqam', 'chek rasmini yuboring'];
  if (hasAny(t, manualCardSignals)) {
    return { keepStage: true, templateKey: 'card_reply', topic: 'manual_card', status: STATUS.ACTIVE, botEnabled: true };
  }

  const manualExpensiveSignals = ['qimmat', '14 kunda', "14 kunda bo'lib", '14 kunda bo‘lib', 'boshlangich tolov', 'boshlang‘ich to‘lov', 'chegirma'];
  if (hasAny(t, manualExpensiveSignals) && hasAny(t, ['to‘lov', "to'lov", 'tolov', 'badal', 'pul', 'so‘m', "so'm", 'som'])) {
    return { keepStage: true, templateKey: 'expensive_reply', topic: 'manual_expensive', status: STATUS.ACTIVE, botEnabled: true };
  }

  const manualPriceSignals = ['badal', '100 000', '100000', 'yillik badal', 'pulni', 'pullar', 'to‘lov', "to'lov", 'tolov', 'so‘m', "so'm", 'som', 'necha pul'];
  if (hasAny(t, manualPriceSignals) && hasAny(t, ['maqola', 'sayt', 'ensiklopediya', 'badal', 'to‘lov', "to'lov", 'tolov'])) {
    return { keepStage: true, templateKey: 'price_reply', topic: 'manual_price', status: STATUS.ACTIVE, botEnabled: true };
  }

  if (hasAny(t, ['foydali jihatlari haqida', 'batafsil ma’lumotga egamisiz', "batafsil ma'lumotga egamisiz", 'malumotga egamisiz'])) {
    return { stage: STAGE.ASKED_INFO, templateKey: 'ask_info', topic: 'ask_info', status: STATUS.ACTIVE, botEnabled: true };
  }

  // Admin qo'lda loyiha haqida ma'lumot yuborgan bo'lsa, bot shu ma'lumotni qayta yubormasligi kerak.
  // Bu yerda xabar shablonga aynan teng bo'lishi shart emas — mazmun yetarli.
  const introSignals = [
    'ozbekiston lider yoshlari', "o'zbekiston lider yoshlari", 'ensiklopediya', 'biografik maqola',
    'google', 'qidiruv tizim', 'portfolio', 'grant', 'forum', 'sertifikat', 'wikipedia'
  ];
  const introScore = introSignals.reduce((n, w) => n + (t.includes(normalizeText(w)) ? 1 : 0), 0);
  if (introScore >= 3) {
    return { stage: STAGE.WAITING_OFFER_READ, templateKey: 'full_intro', topic: 'manual_intro', status: STATUS.ACTIVE, botEnabled: true };
  }

  if (hasAny(t, ['oferta va xabar bilan tanishib', 'ommaviy oferta', 'oferta bilan tanishib'])) {
    return { stage: STAGE.WAITING_OFFER_READ, templateKey: 'offer_end', topic: 'offer', status: STATUS.ACTIVE, botEnabled: true, scheduleOfferFollowup: true };
  }

  if (hasAny(t, ['biografik maqola yozamizmi', 'maqola yozamizmi', 'ensiklopediyamizga kiritish uchun'])) {
    return { stage: STAGE.ASKED_BIO_CONFIRM, templateKey: 'ask_bio_confirm', topic: 'bio_confirm', status: STATUS.ACTIVE, botEnabled: true };
  }

  if (hasAny(t, ['ism familiyangiz', 'tugilgan sana', 'tug‘ilgan sana', 'hozirgi faoliyatingiz', 'rasm yuboring']) && hasAny(t, ['savol', 'ma’lumot', 'malumot'])) {
    return { stage: STAGE.BIO_QUESTIONS_SENT, templateKey: 'bio_questions', topic: 'bio_questions', status: STATUS.STOPPED, botEnabled: false };
  }

  // Oddiy outreach salomi: admin qo'lda lidga yozgan bo'lsa, javob kelganda bot ask_applicationga tayyor turadi.
  if (hasAny(t, ['assalomu alaykum', 'assalom']) && hasAny(t, ['yaxshimisiz', 'yaxshimisiz?', 'yaxshi misiz'])) {
    return { stage: STAGE.NEW, templateKey: 'manual_outreach_greeting', topic: 'manual_greeting', status: STATUS.ACTIVE, botEnabled: true };
  }

  return null;
}

async function maybeRecordOutgoingTopic(message) {
  if (!AUTO_TOPIC_FROM_OUTGOING) return false;
  const text = (message?.text || message?.caption || '').trim();
  if (!text) return false;

  const topic = detectOutgoingTopicFromText(text);
  if (!topic) return false;

  const chatId = message?.chat?.id;
  if (!chatId) return false;
  const businessConnectionId = message?.business_connection_id || message?.business_connection?.id || null;
  const existing = await getLead(chatId);

  const resolvedStage = topic.keepStage ? (existing?.stage || STAGE.NEW) : topic.stage;
  const patch = {
    business_connection_id: businessConnectionId || existing?.business_connection_id || null,
    status: topic.status || existing?.status || STATUS.ACTIVE,
    bot_enabled: Boolean(topic.botEnabled),
    stage: resolvedStage,
    last_bot_message: text,
    last_bot_sent_at: nowIso(),
    last_bot_template_key: topic.templateKey,
    ai_intent: `outgoing_topic_${topic.topic}`,
    ai_confidence: 1,
    ...(topic.scheduleOfferFollowup ? {
      offer_followup_due_at: addMsIso(OFFER_FOLLOWUP_MS),
      offer_followup_sent: false,
      offer_followup_sent_at: null
    } : {})
  };

  if (existing) await updateLead(chatId, patch);
  else await createLead({ chatId, businessConnectionId, from: message.from || {}, text, status: patch.status, botEnabled: patch.bot_enabled });
  await updateLead(chatId, patch);
  await logEvent(chatId, `outgoing_topic_recorded_${topic.topic}`, text);
  return true;
}

async function acquireChatLock(chatId, lockMs = CHAT_LOCK_MS) {
  const id = str(chatId);
  try {
    // Avval muddati o'tgan lockni tozalaymiz.
    await supabase
      .from('chat_locks')
      .delete()
      .eq('chat_id', id)
      .lt('locked_until', nowIso());

    const { error } = await supabase.from('chat_locks').insert({
      chat_id: id,
      locked_until: addMsIso(lockMs),
      updated_at: nowIso()
    });

    if (!error) return true;
    if (error.code === '23505') return false;
    console.error('acquireChatLock:', error);
    // Jadval yo'q yoki boshqa mayda muammo bo'lsa, bot butunlay to'xtab qolmasin.
    return true;
  } catch (err) {
    console.error('acquireChatLock:', err.message);
    return true;
  }
}

async function releaseChatLock(chatId) {
  try {
    await supabase.from('chat_locks').delete().eq('chat_id', str(chatId));
  } catch (err) {
    console.error('releaseChatLock:', err.message);
  }
}

async function ensureResponsePackage(packageId, chatId, turnId, actionName) {
  try {
    const { error } = await supabase.from('response_packages').insert({
      package_id: packageId,
      chat_id: str(chatId),
      turn_id: str(turnId),
      action_name: actionName,
      status: 'sending',
      created_at: nowIso(),
      updated_at: nowIso()
    });
    if (!error) return true;
    if (error.code === '23505') return false;
    console.error('ensureResponsePackage:', error);
    return true;
  } catch (err) {
    console.error('ensureResponsePackage:', err.message);
    return true;
  }
}

async function markPackageComplete(packageId) {
  try {
    await supabase
      .from('response_packages')
      .update({ status: 'completed', completed_at: nowIso(), updated_at: nowIso() })
      .eq('package_id', packageId);
  } catch (err) {
    console.error('markPackageComplete:', err.message);
  }
}

async function reservePackageMessage(packageId, chatId, messageIndex, templateKey) {
  try {
    const { error } = await supabase.from('sent_bot_messages').insert({
      package_id: packageId,
      chat_id: str(chatId),
      message_index: messageIndex,
      template_key: templateKey || 'bridge_text',
      created_at: nowIso()
    });
    if (!error) return true;
    if (error.code === '23505') return false;
    console.error('reservePackageMessage:', error);
    return true;
  } catch (err) {
    console.error('reservePackageMessage:', err.message);
    return true;
  }
}

// -------------------- Intent classifier --------------------

function isExactAny(t, words) {
  return words.some(w => t === normalizeText(w));
}

function hasAny(t, words) {
  return words.some(w => t.includes(normalizeText(w)));
}

function forceIntentByStage(text, stage, current = { intent: 'unclear', confidence: 0.35 }) {
  const t = normalizeText(text);
  if (!t) return { intent: 'unclear', confidence: 0.2, forced: true };

  // Eng muhim qoida: oddiy "yo'q" HAMMA joyda rad emas.
  // U qaysi savol berilganiga qarab talqin qilinadi.
  const plainYes = ['ha', 'xa', 'haa', 'haaa', 'ha shunday', 'xa shunday', 'shunday', 'to\'g\'ri', 'togri', 'to‘g‘ri'];
  const plainNo = ['yoq', "yo'q", 'yo‘q', 'yuq', 'yo'];

  // Haqiqiy rad so'zlari. Bu yerga oddiy "yo'q" qo'shilmaydi.
  const hardReject = [
    'kerak emas', 'kerakmas', 'qiziq emas', 'qiziqmas', 'xohlamayman', 'hohlamayman',
    'bezovta qilmang', 'yozmang', 'rad etaman', 'bekor qiling', 'menga kerak emas',
    'endi yozmang', 'spam qilmang', 'raqamimni qayerdan oldingiz', 'kim berdi raqamimni', 'shikoyat qilaman', 'bloklayman',
    'tanimayman sizlarni', 'tanimiman sizlarni', 'tanimayman bilmayman', 'tanimiman bilmayman',
    'bilmayman sizlarni', 'sizlarni tanimayman', 'sizlarni bilmayman'
  ];
  if (hasAny(t, hardReject)) return { intent: 'reject', confidence: 0.99, forced: true };

  const laterWords = ['keyinroq', 'hozir bandman', 'vaqtim yoq', "vaqtim yo'q", 'ertaga', 'kechqurun', 'keyin yozing', 'keyin gaplashamiz', 'boshqa payt'];
  if (hasAny(t, laterWords)) return { intent: 'later', confidence: 0.96, forced: true };

  const questionListWords = ['savollarni yuboring', 'savollar yuboring', 'savollarni tashlang', 'savol yuboring', 'savollar qani', 'anketa savollari', "ma\'lumotlarni yuboraymi", 'malumotlarni yuboraymi', 'biografik savollar'];
  if (hasAny(t, questionListWords)) return { intent: 'questions_request', confidence: 0.97, forced: true };

  const humanWords = ['chek yubordim', 'chek tashladim', 'chekni yubordim', "to'lov qildim", 'to‘lov qildim', 'tolov qildim', "pul o'tkazdim", 'pul o‘tkazdim', 'odam bilan gaplashay', 'operator bilan', 'admin bilan', 'inson bilan gaplash'];
  if (hasAny(t, humanWords)) return { intent: 'human_needed', confidence: 0.98, forced: true };

  const cardWords = ['karta', 'kartangiz', 'karta raqam', 'karta raqami', 'plastik', 'rekvizit', 'hisob raqam', 'kartaga', 'kartadan', "to\'lov qilinadimi", 'to‘lov qilinadimi', 'tolov qilinadimi', 'qayerga tolayman', 'qayerga to‘layman', "qayerga to\'layman"];
  if (hasAny(t, cardWords)) return { intent: 'card_question', confidence: 0.97, forced: true };

  const expensiveWords = ['qimmat', 'qimmat ekan', 'juda qimmat', 'arzonroq', 'chegirma', 'tushirib ber', 'pasaytirib', 'narxini tushiring'];
  if (hasAny(t, expensiveWords)) return { intent: 'expensive_question', confidence: 0.94, forced: true };

  const priceWords = ['narx', 'qancha', 'pullikmi', 'pullik', 'tolov', "to'lov", 'to‘lov', 'badal', 'necha pul', 'sum', "so'm", 'so‘m', 'som'];
  if (hasAny(t, priceWords)) return { intent: 'price_question', confidence: 0.96, forced: true };

  const nextStepWords = ['nima qilish kerak', 'nima qilaman', 'qanday qilamiz', 'qanday davom etamiz', 'keyin nima', 'qanday kiraman', 'jarayon qanday', 'boshlash uchun nima kerak', 'nimalar kerak', 'hosh', 'xosh', 'ho‘sh', "ho'sh", 'keyinchi', 'nima bo‘ladi yozsam', "nima bo'ladi yozsam", 'nima boladi yozsam'];
  if (hasAny(t, nextStepWords)) return { intent: 'next_steps', confidence: 0.92, forced: true };

  const explainWords = ['nima bu', "nima o\'zi", 'nima o‘zi', 'qanaqa loyiha', 'tushuntiring', 'batafsil tushuntiring', 'malumot bering', "ma\'lumot bering", 'ma’lumot bering', 'berolasizmi malumot', 'ikkilanib turibman', "do\'stim aytgandi", 'do‘stim aytgandi', 'dostim aytgandi', 'tanishim aytgandi'];
  if (hasAny(t, explainWords)) return { intent: 'explain_project', confidence: 0.94, forced: true };

  if (stage === STAGE.NEW) {
    const greetings = ['assalomu alaykum', 'assalom', 'salom', 'va alaykum', 'valaykum', 'yaxshi', 'ha yaxshi', 'rahmat yaxshi', 'yaxshiman', 'alhamdulillah'];
    if (hasAny(t, greetings)) return { intent: 'greeting_positive', confidence: 0.95, forced: true };
  }

  if (stage === STAGE.ASKED_APPLICATION) {
    const applicationYes = [
      'qoldirdim', 'qoldirgandim', 'ariza qoldirgandim', 'anketa to\'ldirgandim', 'anketa to‘ldirgandim', 'forma to\'ldirgandim', 'google form',
      'instagramda', 'instagram', 'instada', 'reklamadan', 'reklamada', 'ko\'rdim', 'ko‘rdim',
      'yozgandim', 'yozgan edim', 'yozganman', 'murojaat qilgandim',
      'dostim aytdi', "do'stim aytdi", 'do‘stim aytdi', 'tanishim aytdi', 'ustozim aytdi',
      'aytishgandi', 'ko\'rgandim', 'ko‘rgandim', 'qiziqib yozgandim', 'qiziqdim',
      'malumot olmoqchi', "ma'lumot olmoqchi", 'ma’lumot olmoqchi', 'bilmoqchi edim'
    ];
    const applicationNotSubmitted = [
      'qoldirmaganman', 'ariza qoldirmaganman', 'yoq qoldirmaganman', "yo'q qoldirmaganman", 'yo‘q qoldirmaganman',
      'hali qoldirmadim', 'qoldirmadim', 'qoldirmoqchiman', 'qanday qoldiraman', 'qanday ariza qoldiraman',
      'ariza qoldirish uchun', 'ariza havolasi', 'link bering', 'havola bering', 'qayerdan qoldiraman'
    ];
    const applicationNo = ['men yozmadim', 'adashdingiz', 'adashdingiz shekilli'];

    if (hasAny(t, applicationNotSubmitted) || isExactAny(t, plainNo)) return { intent: 'application_not_submitted', confidence: 0.99, forced: true };
    if (isExactAny(t, plainYes) || hasAny(t, applicationYes)) return { intent: 'application_confirmed', confidence: 0.98, forced: true };
    if (hasAny(t, applicationNo)) return { intent: 'application_denied', confidence: 0.88, forced: true };
  }

  if (stage === STAGE.WAITING_APPLICATION_SUBMIT) {
    const submitted = ['ariza qoldirdim', 'qoldirdim', 'yubordim', 'jonatdim', 'jo‘natdim', "jo'natdim", 'toldirdim', 'to‘ldirdim', "to'ldirdim", 'anketa yubordim', 'forma yubordim'];
    const needLink = ['link', 'havola', 'qanday', 'qayerdan', 'topolmadim', 'ochilmayapti', 'qayta yuboring'];
    if (hasAny(t, submitted)) return { intent: 'application_submitted', confidence: 0.98, forced: true };
    if (hasAny(t, needLink)) return { intent: 'application_not_submitted', confidence: 0.96, forced: true };
  }

  if (stage === STAGE.ASKED_INFO) {
    const hasInfo = ['egaman', 'bilaman', 'xabardorman', "ma'lumotim bor", 'ma’lumotim bor', 'malumotim bor', 'ha bor', 'bor', 'tushunaman'];
    const noInfo = ['bilmayman', "ma'lumotim yo", 'ma’lumotim yo', 'malumotim yo', 'xabardor emasman', 'tushuntiring', 'bilmadim', 'ma\'lumot bering', 'malumot bering', 'berolasizmi malumot'];

    const partialInfo = ['biroz', 'ozgina', 'sal pal', 'sal-pal', 'kamroq bilaman', 'to‘liq emas', "to'liq emas", 'qisman'];
    if (isExactAny(t, partialInfo) || hasAny(t, ['biroz ma', 'ozgina ma', 'qisman ma'])) return { intent: 'partial_info', confidence: 0.97, forced: true };

    // Shu savolga oddiy "yo'q" degani: "ma'lumotga ega emasman".
    // Bu RAD EMAS. Bot to'liq ma'lumot yuborishi shart.
    if (isExactAny(t, plainNo) || hasAny(t, noInfo)) return { intent: 'no_info', confidence: 0.99, forced: true };
    if (isExactAny(t, plainYes) || hasAny(t, hasInfo)) return { intent: 'has_info', confidence: 0.96, forced: true };
  }

  if (stage === STAGE.WAITING_OFFER_READ) {
    const read = ['tanishdim', 'oqib chiqdim', "o'qib chiqdim", 'o‘qib chiqdim', 'korib chiqdim', "ko'rib chiqdim", 'ko‘rib chiqdim', 'tushunarli', 'tanishib chiqdim'];
    const okWait = ['hop', "ho'p", 'ho‘p', 'mayli', 'ok', 'boladi', "bo'ladi", 'bo‘ladi', 'tanishib chiqaman', 'oqib chiqaman', "o'qib chiqaman", 'o‘qib chiqaman'];
    if (hasAny(t, read)) return { intent: 'read_offer', confidence: 0.96, forced: true };
    if (hasAny(t, okWait)) return { intent: 'ok_wait', confidence: 0.9, forced: true };
    // Bu bosqichda oddiy "yo'q" noaniq: radmi yoki hali tanishmaganmi — admin ko'rsin.
    if (isExactAny(t, plainNo)) return { intent: 'unclear', confidence: 0.4, forced: true };
  }

  if (stage === STAGE.ASKED_BIO_CONFIRM) {
    const agree = ['yozing', 'ha yozing', 'maqola yoz', 'boshlayver', 'qilavering', 'roziman', 'mayli', 'boladi', "bo'ladi", 'bo‘ladi'];
    const no = ['o\'ylab ko\'raman', 'o‘ylab ko‘raman'];
    if (isExactAny(t, plainNo) || hasAny(t, no)) return { intent: 'reject', confidence: 0.96, forced: true };
    if (isExactAny(t, plainYes) || hasAny(t, agree)) return { intent: 'agree_bio', confidence: 0.96, forced: true };
  }

  return current;
}

function localIntent(text, stage) {
  return forceIntentByStage(text, stage, { intent: 'unclear', confidence: 0.35 });
}

async function aiIntent(text, stage) {
  const fallback = localIntent(text, stage);
  // Stage bo'yicha aniq qoida topilgan bo'lsa, AI'ga topshirmaymiz.
  // Masalan asked_info bosqichidagi oddiy "yo'q" = no_info, reject emas.
  if (fallback.forced && fallback.confidence >= 0.9) {
    return { intent: fallback.intent, confidence: fallback.confidence };
  }
  if (!openai) return fallback;

  try {
    const prompt = `Sen Telegram Business savdo botidagi intent-classifier bo'lib ishlaysan.

Vazifa: foydalanuvchi javobining ma'nosini aniqlash. Javob yozma, faqat JSON qaytar.

Qoidalar:
- O'zbek lotin/kirill, ruscha aralash, xato yozilgan matnlarni tushun.
- Stage juda muhim. "ha" har bosqichda boshqa ma'no beradi.
- Botning maqsadi lidni biografik savollargacha olib kelish.
- "instagramda qoldirdim", "do'stim aytdi", "yozgandim", "reklamadan ko'rdim" kabi javoblar asked_application bosqichida application_confirmed.
- "narxi qancha", "pullikmi", "badal bormi" kabi javoblar price_question.
- "karta", "kartaga to'lov qilinadimi", "karta raqam" kabi javoblar card_question.
- "qimmat ekan", "chegirma bormi" kabi javoblar expensive_question.
- "nima bu o'zi", "do'stim aytgandi, ikkilanib turibman", "ma'lumot bering" kabi javoblar explain_project.
- "nima qilish kerak", "jarayon qanday" kabi javoblar next_steps.
- "savollarni yuboring", "anketa savollari" kabi javoblar questions_request.
- "yo'q", "yo'q qoldirmaganman", "qoldirmoqchiman", "ariza havolasi" kabi javoblar asked_application bosqichida application_not_submitted.
- "ariza qoldirdim", "yubordim", "to'ldirdim" waiting_application_submit bosqichida application_submitted.
- "biroz", "ozgina", "qisman" asked_info bosqichida partial_info.
- "chek yubordim", "to'lov qildim", "operator bilan gaplashay" kabi javoblar human_needed.
- "keyinroq", "hozir bandman" kabi javoblar later.
- "kerak emas", "qiziq emas", "bezovta qilmang" kabi aniq rad javoblar reject.
- Oddiy "yo'q"ni avtomatik reject qilma. Stage asked_info bo'lsa "yo'q" = no_info.
- Stage asked_info savoli: "ma'lumotga egamisiz?". Bu bosqichda "yo'q", "bilmayman", "ma'lumotim yo'q" => no_info, bot to'liq ma'lumot yuboradi.
- Stage asked_application bosqichida "instagramda qoldirdim", "do'stim aytdi", "yozgandim", "qiziqib yozgandim" => application_confirmed.
- Ishonching past bo'lsa unclear.

Faqat mana shu JSON formatda qaytar:
{"intent":"...","confidence":0.0}

Ruxsat etilgan intentlar:
greeting_positive, application_confirmed, application_denied, application_not_submitted, application_submitted, has_info, no_info, partial_info, ok_wait, read_offer, agree_bio, reject, later, price_question, card_question, expensive_question, explain_project, next_steps, questions_request, human_needed, unclear

Stage: ${stage}
User message: ${text}`;

    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      input: prompt,
      temperature: 0
    });

    const raw = (response.output_text || '').trim();
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
    const allowed = new Set(['greeting_positive', 'application_confirmed', 'application_denied', 'application_not_submitted', 'application_submitted', 'has_info', 'no_info', 'partial_info', 'ok_wait', 'read_offer', 'agree_bio', 'reject', 'later', 'price_question', 'card_question', 'expensive_question', 'explain_project', 'next_steps', 'questions_request', 'human_needed', 'unclear']);
    const intent = String(parsed.intent || '').toLowerCase().trim();
    const confidence = Number(parsed.confidence || 0);

    if (!allowed.has(intent)) return fallback;

    const aiResult = { intent, confidence: Math.max(0, Math.min(1, confidence)) };
    const forcedAfterAi = forceIntentByStage(text, stage, aiResult);
    if (forcedAfterAi.forced && forcedAfterAi.confidence >= 0.9) {
      return { intent: forcedAfterAi.intent, confidence: forcedAfterAi.confidence };
    }

    // Local aniq taniydigan signal bo'lsa, AI uni boshqa ma'noga burib yubormasin.
    if (fallback.forced && fallback.confidence >= 0.8) return { intent: fallback.intent, confidence: fallback.confidence };
    if (fallback.confidence >= 0.86 && confidence < 0.55) return fallback;
    return aiResult;
  } catch (err) {
    console.error('aiIntent fallback:', err.message);
    return fallback;
  }
}


// -------------------- Natural bridge replies --------------------

function stageReturnQuestion(lead) {
  const stage = lead?.stage;
  if (stage === STAGE.NEW || stage === STAGE.ASKED_APPLICATION) {
    return 'Siz “O‘zbekiston Lider Yoshlari Ensiklopediyasi”ga kirish uchun ariza qoldirgansiz. Shunaqami?';
  }
  if (stage === STAGE.WAITING_APPLICATION_SUBMIT) {
    return 'Arizani yuborganingizdan so‘ng shu chatga “ariza qoldirdim” deb yozing, keyin davom ettiramiz.';
  }
  if (stage === STAGE.ASKED_INFO) {
    return 'Siz bu loyiha foydali jihatlari haqida avval tanishganmisiz yoki batafsil tushuntirib beraymi?';
  }
  if (stage === STAGE.WAITING_OFFER_READ) {
    return 'Oferta va ma’lumot bilan tanishib chiqqach, “tanishdim” deb yozsangiz bo‘ladi.';
  }
  if (stage === STAGE.ASKED_BIO_CONFIRM) {
    return 'Sizga ham biografik maqola tayyorlashimizni xohlaysizmi?';
  }
  return 'Aniqlashtirib olay: loyiha bo‘yicha davom etamizmi?';
}

function localBridgeReply(lead, userText = '', intent = 'unclear') {
  const t = normalizeText(userText);

  if (intent === 'application_denied') {
    return `Tushunarli. Adashgan bo‘lsak, uzr. ${stageReturnQuestion(lead)}`;
  }

  if (hasAny(t, ['kimsan', 'kim siz', 'kim bu', 'tanimadim', 'tanimadim sizni', 'qayerdan oldingiz'])) {
    return `Tushunarli, avval aniqlik kiritib olay. Biz “O‘zbekiston Lider Yoshlari Ensiklopediyasi” loyihasi bo‘yicha murojaat qilgan edik. ${stageReturnQuestion(lead)}`;
  }

  if (hasAny(t, ['nima desam ekan', 'bilmadim nima deyishni', 'o‘ylab qoldim', 'oylab qoldim'])) {
    return `Mayli, shoshilmang. Sizga qulay bo‘lishi uchun oddiy qilib so‘rayman: ${stageReturnQuestion(lead)}`;
  }

  if (hasAny(t, ['hazillashdim', 'hazil', 'topgandik', 'adashdim', 'nima desam'])) {
    return `Tushunarli 😊 Unda aniqlashtirib olay: ${stageReturnQuestion(lead)}`;
  }

  if (lead?.stage === STAGE.WAITING_OFFER_READ) {
    return `Tushunarli. ${stageReturnQuestion(lead)}`;
  }

  return `Tushunarli. ${stageReturnQuestion(lead)}`;
}

async function aiBridgeReply(lead, userText = '', intent = 'unclear') {
  const fallback = localBridgeReply(lead, userText, intent);
  if (!openai) return fallback;

  try {
    const prompt = `Sen Telegram Business savdo yordamchisisan.

Vazifa: lidning noaniq yoki shablonga to'g'ri kelmagan gapiga TABIIY, MULОYIM, QISQA ko'prik javob yozish va suhbatni hozirgi savolga qaytarish.

Qoidalar:
- O'zbek lotinida yoz.
- 1-2 gapdan oshirma.
- Odamga o'xshab muloyim bo'l, robotcha yoki jinnicha javob yozma.
- Narx, karta raqam, kafolat, sertifikat, to'lov summasi kabi faktlarni o'zingdan yozma.
- Agar odam "kimsan/tanimadim" desa, qisqa tanishtir va aniqlashtir.
- Agar odam "nima desam ekan" desa, shoshirmasdan oddiy qilib savolga qaytar.
- Agar odam rad qilsa, lekin aniq "kerak emas/bezovta qilmang" demasa, yumshoq aniqlashtir.
- Har doim mana shu asosiy savolga qaytar: ${stageReturnQuestion(lead)}

Faqat JSON qaytar:
{"message":"..."}

Hozirgi stage: ${lead?.stage}
Lid xabari: ${userText}`;

    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      input: prompt,
      temperature: 0.35
    });

    const raw = (response.output_text || '').trim();
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
    const msg = safeBridgeText(parsed.message || '');
    if (!msg || msg.length < 10) return fallback;
    return msg;
  } catch (err) {
    console.error('aiBridgeReply fallback:', err.message);
    return fallback;
  }
}

async function sideQuestionReturnText(lead, sideType) {
  // Side savollar asosiy stage'ni buzmaydi. Javobdan keyin suhbatni o'sha savolga qaytaramiz.
  if (sideType === 'price') {
    return stageReturnQuestion(lead);
  }
  if (sideType === 'card') {
    if (lead?.stage === STAGE.WAITING_OFFER_READ) return 'To‘lovdan oldin oferta bilan tanishib chiqing. Tanishib chiqqach, “tanishdim” deb yozsangiz bo‘ladi.';
    return stageReturnQuestion(lead);
  }
  if (sideType === 'expensive') {
    return 'Xohlasangiz, avval loyiha sizga qanday foyda berishini sodda qilib tushuntirib beraman.';
  }
  return stageReturnQuestion(lead);
}

// -------------------- Lead flow --------------------


async function resolvePackageItems(items = []) {
  const resolved = [];
  for (const item of items) {
    if (item.text) {
      resolved.push({ text: safeBridgeText(item.text), templateKey: item.templateKey || 'bridge_text' });
    } else if (item.templateKey) {
      const body = await getTemplateBody(item.templateKey);
      if (!body) {
        await sendAdmin(`⚠️ Shablon topilmadi: <code>${htmlEscape(item.templateKey)}</code>`);
        continue;
      }
      resolved.push({ text: renderTemplate(body), templateKey: item.templateKey });
    }
  }
  return resolved.filter(x => x.text);
}


function shouldSuppressRepeatedSingleAction(lead, resolved = [], actionName = '') {
  if (!lead || !resolved.length) return false;
  if (!SAME_ACTION_COOLDOWN_MS || msSince(lead.last_bot_sent_at) > SAME_ACTION_COOLDOWN_MS) return false;

  const action = String(actionName || '');
  const firstKey = resolved[0]?.templateKey || '';
  // Narx/karta/qimmat kabi side-question paketlari 2 ta xabardan iborat bo'lishi mumkin.
  // Lekin shu mavzu yaqinda yuborilgan bo'lsa, bir xil paket qayta ketmasin.
  if (action.startsWith('side_') && lead.last_bot_template_key === firstKey) return true;

  if (resolved.length !== 1) return false;

  const key = firstKey;
  const repeatKeys = new Set([
    'return_waiting_offer_read',
    'return_asked_application',
    'return_asked_info',
    'return_waiting_application_submit',
    'return_asked_bio_confirm',
    'bridge_text'
  ]);

  if (repeatKeys.has(key) && lead.last_bot_template_key === key) return true;
  if (String(actionName || '').startsWith('return_') && lead.last_bot_template_key === key) return true;
  return false;
}

async function sendResponsePackage({ lead, turnId = 'manual', actionName, items = [], nextStage, stop = false, patch = {} }) {
  const packageId = stableHash(`${lead.chat_id}|${turnId}|${actionName}`);
  const resolved = await resolvePackageItems(items);
  if (resolved.length === 0) return lead;

  if (shouldSuppressRepeatedSingleAction(lead, resolved, actionName)) {
    await logEvent(lead.chat_id, `same_action_cooldown_skipped_${actionName}`, resolved[0]?.text || '');
    return lead;
  }

  const packageReserved = await ensureResponsePackage(packageId, lead.chat_id, turnId, actionName);
  if (!packageReserved) {
    await logEvent(lead.chat_id, `duplicate_package_skipped_${actionName}`, packageId);
    return lead;
  }

  let lastText = '';
  let lastTemplateKey = '';
  for (let i = 0; i < resolved.length; i++) {
    const item = resolved[i];
    const shouldSend = await reservePackageMessage(packageId, lead.chat_id, i, item.templateKey);
    if (!shouldSend) {
      // Shu paketdagi shu xabar oldin yuborilgan. Duplicate yubormaymiz.
      continue;
    }

    await sendBusinessMessage({
      chatId: lead.chat_id,
      businessConnectionId: lead.business_connection_id,
      text: item.text
    });

    lastText = item.text;
    lastTemplateKey = item.templateKey;
    await logEvent(lead.chat_id, `bot_package_${actionName}_${item.templateKey}_${i}`, item.text);

    if (i < resolved.length - 1 && PACKAGE_MESSAGE_DELAY_MS > 0) {
      await sleep(PACKAGE_MESSAGE_DELAY_MS);
    }
  }

  const combined = resolved.map(x => x.text).join('\n\n---\n\n');
  const templateKeys = resolved.map(x => x.templateKey);
  const schedulesOfferFollowup = (nextStage || lead.stage) === STAGE.WAITING_OFFER_READ && templateKeys.includes('offer_end');
  const update = {
    last_bot_message: combined,
    last_bot_sent_at: nowIso(),
    last_bot_template_key: lastTemplateKey || resolved.at(-1)?.templateKey || actionName,
    stage: nextStage || lead.stage,
    ...(schedulesOfferFollowup ? {
      offer_followup_due_at: addMsIso(OFFER_FOLLOWUP_MS),
      offer_followup_sent: false,
      offer_followup_sent_at: null
    } : {}),
    ...patch
  };

  if (stop) {
    update.status = STATUS.STOPPED;
    update.bot_enabled = false;
  }

  await markPackageComplete(packageId);
  const updated = await updateLead(lead.chat_id, update);
  return updated || { ...lead, ...update };
}

// Eski nom ayrim admin funksiyalarda ishlatilsa ham xavfsiz bo'lishi uchun qoldirildi.
async function sendTemplateToLead({ lead, templateKey, nextStage, stop = false, patch = {}, turnId = 'manual' }) {
  return sendResponsePackage({
    lead,
    turnId,
    actionName: `template_${templateKey}`,
    items: [{ templateKey }],
    nextStage,
    stop,
    patch
  });
}

async function moveToNeedsAdmin(lead, text, intentResult) {
  await updateLead(lead.chat_id, {
    status: STATUS.NEEDS_ADMIN,
    bot_enabled: false,
    review_stage: lead.stage,
    stage: STAGE.NEEDS_ADMIN,
    ai_intent: intentResult.intent,
    ai_confidence: intentResult.confidence
  });
  await logEvent(lead.chat_id, 'needs_admin', text);
}

async function pauseLead(lead, templateKey = 'later_reply', turnId = 'manual') {
  const updated = await sendResponsePackage({
    lead,
    turnId,
    actionName: 'pause_later',
    items: [{ templateKey }],
    nextStage: STAGE.PAUSED,
    patch: { status: STATUS.PAUSED, bot_enabled: false, review_stage: lead.stage }
  });
  await logEvent(lead.chat_id, 'lead_paused', lead.last_user_message || '');
  return updated;
}

async function stopLeadWithReject(lead, turnId = 'manual') {
  const updated = await sendResponsePackage({
    lead,
    turnId,
    actionName: 'reject_stop',
    items: [{ templateKey: 'reject_reply' }],
    nextStage: STAGE.STOPPED,
    stop: true
  });
  await logEvent(lead.chat_id, 'lead_rejected_or_stopped', lead.last_user_message || '');
  return updated;
}

async function sendFullExplanationFlow(lead, turnId = 'manual') {
  return sendResponsePackage({
    lead,
    turnId,
    actionName: 'full_explanation_flow',
    items: [
      { templateKey: 'explain_reply' },
      { templateKey: 'full_intro' },
      { templateKey: 'offer_end' }
    ],
    nextStage: STAGE.WAITING_OFFER_READ
  });
}

async function sendShortIntroFlow(lead, turnId = 'manual') {
  return sendResponsePackage({
    lead,
    turnId,
    actionName: 'short_intro_flow',
    items: [
      { templateKey: 'short_intro' },
      { templateKey: 'offer_end' }
    ],
    nextStage: STAGE.WAITING_OFFER_READ
  });
}

async function sendFullIntroFlow(lead, turnId = 'manual') {
  return sendResponsePackage({
    lead,
    turnId,
    actionName: 'full_intro_flow',
    items: [
      { templateKey: 'full_intro' },
      { templateKey: 'offer_end' }
    ],
    nextStage: STAGE.WAITING_OFFER_READ
  });
}

async function sendSideQuestionReply(lead, templateKey, sideType, turnId = 'manual') {
  const returnText = await sideQuestionReturnText(lead, sideType);
  return sendResponsePackage({
    lead,
    turnId,
    actionName: `side_${sideType}`,
    items: [
      { templateKey },
      { text: returnText, templateKey: `return_${lead.stage}` }
    ],
    nextStage: lead.stage,
    patch: { last_bot_template_key: templateKey, ai_intent: `side_${sideType}_sent` }
  });
}

async function sendBridgeToStage(lead, userText = '', intent = 'unclear', turnId = 'manual') {
  const bridge = await aiBridgeReply(lead, userText, intent);
  return sendResponsePackage({
    lead,
    turnId,
    actionName: `bridge_${intent}`,
    items: [{ text: bridge, templateKey: 'bridge_reply' }],
    nextStage: lead.stage
  });
}

async function sendBioQuestionsAndStop(lead, turnId = 'manual') {
  await sendResponsePackage({
    lead,
    turnId,
    actionName: 'bio_questions_stop',
    items: [{ templateKey: 'bio_questions' }],
    nextStage: STAGE.BIO_QUESTIONS_SENT,
    stop: true
  });
  await logEvent(lead.chat_id, 'bio_questions_reached', lead.last_user_message || '');
}

async function continueByIntent(lead, intentResult, userText = '', turnId = 'manual') {
  // Yakuniy himoya: AI noto'g'ri tushunsa ham stage-specific qoida yutadi.
  const forced = forceIntentByStage(userText, lead.stage, intentResult);
  const { intent, confidence } = forced;

  // Aniq rad bo'lsa to'xtaydi. Oddiy "yo'q" yoki "tanimadim" kabi gaplar bridge orqali aniqlashtiriladi.
  if (intent === 'reject') {
    await stopLeadWithReject(lead, turnId);
    return;
  }

  if (intent === 'human_needed') {
    await sendResponsePackage({
      lead,
      turnId,
      actionName: 'human_takeover',
      items: [{ templateKey: 'human_takeover_reply' }],
      nextStage: STAGE.HUMAN_NEEDED,
      patch: { status: STATUS.HUMAN_NEEDED, bot_enabled: false, review_stage: lead.stage, hot_lead: true }
    });
    await sendAdmin(`👤 Odam aralashishi kerak

Chat ID: <code>${htmlEscape(lead.chat_id)}</code>
Xabar: ${htmlEscape(clip(userText, 700))}`);
    return;
  }

  if (intent === 'application_not_submitted') {
    await sendResponsePackage({
      lead,
      turnId,
      actionName: 'application_link',
      items: [{ templateKey: 'application_link_reply' }],
      nextStage: STAGE.WAITING_APPLICATION_SUBMIT
    });
    return;
  }

  if (intent === 'application_submitted') {
    await sendResponsePackage({
      lead,
      turnId,
      actionName: 'ask_info_after_application_submit',
      items: [{ templateKey: 'ask_info' }],
      nextStage: STAGE.ASKED_INFO
    });
    return;
  }

  if (intent === 'application_denied') {
    // asked_application bosqichida oddiy rad/noaniqlik o'rniga ariza linkiga yo'naltiramiz.
    await sendResponsePackage({
      lead,
      turnId,
      actionName: 'application_link_from_denied',
      items: [{ templateKey: 'application_link_reply' }],
      nextStage: STAGE.WAITING_APPLICATION_SUBMIT
    });
    return;
  }

  if (intent === 'later') {
    await pauseLead(lead, 'later_reply', turnId);
    return;
  }

  // Yon savollar: narx/karta/qimmat asosiy stage'ni buzmaydi, javobdan keyin o'sha savolga qaytaradi.
  if (intent === 'price_question') {
    await sendSideQuestionReply(lead, 'price_reply', 'price', turnId);
    return;
  }

  if (intent === 'card_question') {
    await updateLead(lead.chat_id, { hot_lead: true });
    await sendSideQuestionReply(lead, 'card_reply', 'card', turnId);
    return;
  }

  if (intent === 'expensive_question') {
    await sendSideQuestionReply(lead, 'expensive_reply', 'expensive', turnId);
    return;
  }

  if (intent === 'explain_project') {
    await sendFullExplanationFlow(lead, turnId);
    return;
  }

  if (intent === 'next_steps') {
    if ([STAGE.NEW, STAGE.ASKED_APPLICATION, STAGE.ASKED_INFO].includes(lead.stage)) {
      await sendFullExplanationFlow(lead, turnId);
      return;
    }
    if (lead.stage === STAGE.WAITING_OFFER_READ) {
      await sendResponsePackage({
        lead,
        turnId,
        actionName: 'return_offer_instruction',
        items: [{ text: 'Oferta va ma’lumot bilan tanishib chiqing. Tanishib bo‘lgach, “tanishdim” deb yozsangiz, keyingi bosqichga o‘tamiz.', templateKey: 'return_waiting_offer_read' }],
        nextStage: STAGE.WAITING_OFFER_READ
      });
      return;
    }
    if (lead.stage === STAGE.ASKED_BIO_CONFIRM) {
      await sendBioQuestionsAndStop(lead, turnId);
      return;
    }
  }

  if (intent === 'questions_request') {
    await updateLead(lead.chat_id, { hot_lead: true });
    await sendBioQuestionsAndStop(lead, turnId);
    return;
  }

  if (lead.stage === STAGE.NEW && intent === 'greeting_positive') {
    await sendResponsePackage({
      lead,
      turnId,
      actionName: 'ask_application',
      items: [{ templateKey: 'ask_application' }],
      nextStage: STAGE.ASKED_APPLICATION
    });
    return;
  }

  if (lead.stage === STAGE.ASKED_APPLICATION && intent === 'application_confirmed') {
    await sendResponsePackage({
      lead,
      turnId,
      actionName: 'ask_info',
      items: [{ templateKey: 'ask_info' }],
      nextStage: STAGE.ASKED_INFO
    });
    return;
  }

  if (lead.stage === STAGE.ASKED_INFO && (intent === 'has_info' || intent === 'partial_info')) {
    await sendShortIntroFlow(lead, turnId);
    return;
  }

  if (lead.stage === STAGE.ASKED_INFO && intent === 'no_info') {
    await sendFullIntroFlow(lead, turnId);
    return;
  }

  if (lead.stage === STAGE.WAITING_OFFER_READ && intent === 'ok_wait') {
    await logEvent(lead.chat_id, 'ok_wait_no_reply', userText);
    return;
  }

  if (lead.stage === STAGE.WAITING_OFFER_READ && intent === 'read_offer') {
    await sendResponsePackage({
      lead,
      turnId,
      actionName: 'ask_bio_confirm',
      items: [{ templateKey: 'ask_bio_confirm' }],
      nextStage: STAGE.ASKED_BIO_CONFIRM
    });
    return;
  }

  if (lead.stage === STAGE.ASKED_BIO_CONFIRM && intent === 'agree_bio') {
    await updateLead(lead.chat_id, { hot_lead: true });
    await sendBioQuestionsAndStop(lead, turnId);
    return;
  }

  // AI tushunmasa yoki shablonga to'g'ri kelmasa: bitta tabiiy bridge yozadi, stage o'zgarmaydi.
  if (intent === 'unclear' || confidence < AI_CONFIDENCE_MIN) {
    await sendBridgeToStage(lead, userText, 'unclear', turnId);
    return;
  }

  await sendBridgeToStage(lead, userText, intent || 'unmatched', turnId);
}

function compactBatchTexts(texts = []) {
  const cleaned = texts
    .map(x => String(x || '').trim())
    .filter(Boolean)
    .slice(-MAX_BATCH_MESSAGES);
  const joined = cleaned.join('\n').slice(0, MAX_BATCH_CHARS).trim();
  return joined || '[empty]';
}

function isLikelyTrailingContinuation(text, lead) {
  if (!lead?.last_bot_sent_at) return false;
  if (msSince(lead.last_bot_sent_at) > TURN_COOLDOWN_MS) return false;

  const t = normalizeText(text);
  if (!t) return false;

  // Agar lid shu batchda aniq savol yoki aniq javob bersa, uni ignore qilmaymiz.
  const explicitSignals = [
    'yoq', "yo'q", 'yo‘q', 'bor', 'bilmayman', 'egaman', 'malumotim', "ma'lumotim", 'ma’lumotim',
    'pullik', 'narx', 'qancha', 'karta', 'qimmat', 'tanishdim', 'oqib chiqdim', "o'qib chiqdim", 'o‘qib chiqdim',
    'savollarni yuboring', 'savol yuboring', 'nima qilish kerak', 'nima bu', 'tushuntiring', 'ariza qoldirdim', 'qoldirdim', 'qoldirmaganman'
  ];
  if (hasAny(t, explicitSignals)) return false;

  const genericTrailing = [
    'shunaqa', 'ha shunaqa', 'xa shunaqa', 'ha shunday', 'xa shunday', 'shunday',
    'albatta', 'togri', "to'g'ri", 'to‘g‘ri', 'rost', 'ha endi', 'xa endi'
  ];

  // Masalan: bot "ma'lumotga egamisiz?" deb yubordi, lid esa 2-3 soniyadan keyin
  // "shunaqa" deb oldingi fikrini davom ettirdi. Buni keyingi bosqich javobi deb olmaymiz.
  if (lead.stage === STAGE.ASKED_INFO && lead.last_bot_template_key === 'ask_info') {
    return isExactAny(t, genericTrailing);
  }

  // Oferta yuborilgandan keyin "shunaqa/albatta" kabi gaplar ko'pincha eski fikr davomi bo'lishi mumkin.
  // "tanishdim" yoki "ho'p" explicitSignals orqali o'tib ketadi.
  if (lead.stage === STAGE.WAITING_OFFER_READ && lead.last_bot_template_key === 'offer_end') {
    return isExactAny(t, genericTrailing);
  }

  return false;
}


function enqueueBusinessTurn({ chatId, businessConnectionId, from, text, messageId }) {
  const key = str(chatId);
  let entry = businessTurnBuffers.get(key);

  if (!entry) {
    entry = {
      texts: [],
      messageIds: [],
      latest: null,
      timer: null,
      processing: false
    };
    businessTurnBuffers.set(key, entry);
  }

  entry.texts.push(text);
  entry.messageIds.push(messageId ? str(messageId) : stableHash(`${Date.now()}|${text}`));
  if (entry.texts.length > MAX_BATCH_MESSAGES) {
    entry.texts = entry.texts.slice(-MAX_BATCH_MESSAGES);
    entry.messageIds = entry.messageIds.slice(-MAX_BATCH_MESSAGES);
  }

  entry.latest = { chatId, businessConnectionId, from };

  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    drainBusinessTurnBuffer(key).catch(err => console.error('drainBusinessTurnBuffer:', err));
  }, MESSAGE_BUFFER_MS);
}

async function drainBusinessTurnBuffer(chatId) {
  const entry = businessTurnBuffers.get(str(chatId));
  if (!entry) return;

  if (entry.processing) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      drainBusinessTurnBuffer(chatId).catch(err => console.error('drainBusinessTurnBuffer:', err));
    }, MESSAGE_BUFFER_MS);
    return;
  }

  entry.processing = true;
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }

  const texts = entry.texts.splice(0, entry.texts.length);
  const messageIds = entry.messageIds.splice(0, entry.messageIds.length);
  const latest = entry.latest;
  const batchText = compactBatchTexts(texts);
  const turnId = `${chatId}:${messageIds.join('-') || stableHash(batchText)}`;

  try {
    if (latest && batchText && batchText !== '[empty]') {
      await processBusinessTurn({ ...latest, text: batchText, messageCount: texts.length, turnId });
    }
  } finally {
    entry.processing = false;

    // Agar bot javob berayotgan paytda yangi xabar kelgan bo'lsa, uni alohida keyingi turn qilib ishlaymiz.
    // Shu bilan bitta lid uchun parallel javoblar chiqmaydi.
    if (entry.texts.length > 0) {
      entry.timer = setTimeout(() => {
        drainBusinessTurnBuffer(chatId).catch(err => console.error('drainBusinessTurnBuffer:', err));
      }, MESSAGE_BUFFER_MS);
    } else {
      businessTurnBuffers.delete(str(chatId));
    }
  }
}


function userMessageAfterLastBot(lead) {
  if (!lead?.last_message_at) return false;
  if (!lead?.last_bot_sent_at) return true;
  const u = new Date(lead.last_message_at).getTime();
  const b = new Date(lead.last_bot_sent_at).getTime();
  if (!Number.isFinite(u) || !Number.isFinite(b)) return false;
  return u > b + 500;
}

function isRecentManualSync(lead) {
  if (!lead?.last_bot_sent_at) return false;
  const ai = String(lead.ai_intent || '');
  if (!ai.startsWith('outgoing_topic_')) return false;
  const key = String(lead.last_bot_template_key || '');
  // Admin savol bergan bo'lsa (ask_application/ask_info), lid javobini bot davom ettirishi mumkin.
  // Admin ma'lumot, oferta, karta, ariza link yoki bio savol yuborgan bo'lsa, bot takrorlamasligi uchun ehtiyot pauza ishlaydi.
  const manualKeys = [
    'full_intro', 'short_intro', 'explain_reply', 'offer_end', 'application_link_reply',
    'price_reply', 'card_reply', 'expensive_reply', 'bio_questions', 'manual_intro'
  ];
  if (!manualKeys.includes(key)) return false;
  const cooldown = ['price_reply', 'card_reply', 'expensive_reply', 'full_intro', 'short_intro', 'manual_intro'].includes(key)
    ? MANUAL_TOPIC_COOLDOWN_MS
    : ADMIN_TAKEOVER_PAUSE_MS;
  return msSince(lead.last_bot_sent_at) <= cooldown;
}

function shouldSkipForRecentManualSync(lead, text) {
  if (!isRecentManualSync(lead)) return false;
  const key = String(lead.last_bot_template_key || '');
  const check = forceIntentByStage(text, lead.stage, { intent: 'unclear', confidence: 0.35 });

  // Manual price/card yuborilgan bo'lsa, aynan shu mavzu qayta so'ralsa ham bot takrorlamaydi.
  if (key === 'price_reply' && ['price_question', 'unclear', 'next_steps'].includes(check.intent)) return true;
  if (key === 'card_reply' && ['card_question', 'unclear', 'next_steps'].includes(check.intent)) return true;
  if (key === 'expensive_reply' && ['expensive_question', 'unclear', 'next_steps'].includes(check.intent)) return true;

  // Admin ma'lumot/oferta/link yuborganidan keyin noaniq gapga bot aralashmaydi;
  // lekin kuchli yangi signal bo'lsa davom etishi mumkin.
  if (check.intent === 'reject' || check.intent === 'human_needed' || check.intent === 'application_submitted') return false;
  if (check.intent === 'read_offer') return false;
  if ((check.intent === 'questions_request' || check.intent === 'agree_bio') && lead.stage === STAGE.ASKED_BIO_CONFIRM) return false;
  if (check.intent === 'card_question' && key !== 'card_reply') return false;
  if (check.intent === 'price_question' && key !== 'price_reply') return false;
  if (check.intent === 'expensive_question' && key !== 'expensive_reply') return false;

  return true;
}

async function processBusinessTurn({ chatId, businessConnectionId, from, text, messageCount = 1, turnId = 'manual' }) {
  // DB lock: Render yoki Telegram retry sabab bitta chat ikki marta parallel ishlanmasin.
  let locked = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    locked = await acquireChatLock(chatId);
    if (locked) break;
    await sleep(Math.min(1500 + attempt * 1500, MESSAGE_BUFFER_MS));
  }

  if (!locked) {
    await logEvent(chatId, 'skipped_chat_locked', text);
    return;
  }

  try {
    let lead = await findOrCreateLead({
      chatId,
      businessConnectionId,
      from,
      text,
      status: STATUS.ACTIVE,
      botEnabled: true
    });
    if (!lead) return;

    if (!lead.bot_enabled || FINAL_STATUSES.has(lead.status) || STOP_STAGES.has(lead.stage)) {
      await updateLead(chatId, {
        last_user_message: text,
        last_message_at: nowIso(),
        business_connection_id: businessConnectionId || lead.business_connection_id
      });
      await logEvent(chatId, 'ignored_not_active_batch', text);
      return;
    }

    // Admin qo'lda ma'lumot/oferta/karta/link yuborgan bo'lsa, bot ayni xabarga takror javob berib yubormaydi.
    // Masalan lid "ha" dedi, admin botdan tezroq loyiha ma'lumotini yubordi — bot full_intro'ni qayta yubormaydi.
    if (shouldSkipForRecentManualSync(lead, text)) {
      await updateLead(chatId, {
        last_user_message: text,
        last_message_at: nowIso(),
        business_connection_id: businessConnectionId || lead.business_connection_id
      });
      await logEvent(chatId, 'skipped_recent_manual_admin_sync', text);
      return;
    }

    // Bot yangi savol yuborgandan keyingi juda qisqa "shunaqa/albatta" kabi davom-xabarlar
    // keyingi bosqich javobi deb olinmaydi. Bu screenshotdagi sakrash xatosini to'xtatadi.
    if (isLikelyTrailingContinuation(text, lead)) {
      await updateLead(chatId, {
        last_user_message: text,
        last_message_at: nowIso(),
        business_connection_id: businessConnectionId || lead.business_connection_id
      });
      await logEvent(chatId, 'ignored_trailing_continuation', text);
      return;
    }

    const intentResult = await aiIntent(text, lead.stage);
    await updateLead(chatId, {
      last_user_message: text,
      last_message_at: nowIso(),
      business_connection_id: businessConnectionId || lead.business_connection_id,
      ai_intent: intentResult.intent,
      ai_confidence: intentResult.confidence
    });
    await logEvent(chatId, `intent_${intentResult.intent}_${intentResult.confidence}_batch_${messageCount}`, text);

    lead = await getLead(chatId) || lead;
    await continueByIntent(lead, intentResult, text, turnId);
  } finally {
    await releaseChatLock(chatId);
  }
}

async function handleBusinessMessage(message) {
  const text = message?.text || message?.caption || '';
  const chatId = message?.chat?.id;
  const from = message?.from || {};
  const messageId = message?.message_id;
  const businessConnectionId = message?.business_connection_id || message?.business_connection?.id || null;

  if (!chatId) return;

  // Duplicate webhook protection.
  const firstTime = await markProcessed(chatId, messageId);
  if (!firstTime) return;

  // O'zimiz/admin yuborgan yoki botdan kelgan xabarlarni qayta ishlamaymiz.
  // Lekin Outreach Auto yoqilgan bo'lsa, admin yuborgan salomni eslab qolamiz.
  if (isIgnoredBusinessSender(message)) {
    // Telegram Business ayrim qo'lda yuborilgan outgoing xabarlarni from.id bilan emas, is_from_offline kabi flag bilan beradi.
    // Shuning uchun admin/business profil xabari ko'rinsa, uni ham chat mavzusi sifatida yozib olamiz.
    const isManualBusinessOutgoing = Boolean(message?.is_from_offline) && !message?.from?.is_bot && !message?.sender_business_bot;
    if (isOwnerBusinessSender(message) || isManualBusinessOutgoing) {
      // Avval aniq mavzuni yozib olamiz: admin qo'lda qaysi shablon/mavzuni yuborgan bo'lsa, bot shu stage'da davom etadi.
      const topicRecorded = await maybeRecordOutgoingTopic(message);
      if (!topicRecorded) await maybeRecordOutgoingOutreach(message);
    }
    await logEvent(chatId, 'ignored_owner_or_bot_message', text || '[non-text]');
    return;
  }

  const textForDb = text.trim() ? text.trim() : '[non-text message]';
  const existingLeadBeforeMessage = await getLead(chatId);

  // Outreach Auto faol bo'lsa, faqat bugun admin salom yuborgan chatlarni avto boshlaymiz.
  const outreachState = await getOutreachAutoState();
  if (existingLeadBeforeMessage?.status === STATUS.OUTREACH && outreachState.active) {
    await updateLead(chatId, {
      status: STATUS.ACTIVE,
      bot_enabled: true,
      stage: existingLeadBeforeMessage.stage === STAGE.DISABLED ? STAGE.NEW : (existingLeadBeforeMessage.stage || STAGE.NEW),
      last_user_message: textForDb,
      last_message_at: nowIso(),
      business_connection_id: businessConnectionId || existingLeadBeforeMessage.business_connection_id
    });
    await logEvent(chatId, 'outreach_auto_started_from_reply', textForDb);
  }

  if (!existingLeadBeforeMessage && outreachState.active && !AUTO_START_REQUIRE_OUTREACH) {
    // Zaxira rejim: outgoing ko'rinmasa ham vaqtli auto start. Xavfsizlik uchun default o'chirilgan.
  } else if (!existingLeadBeforeMessage && FIRST_CONTACT_MODE === 'silent_queue') {
    await createLead({
      chatId,
      businessConnectionId,
      from,
      text: textForDb,
      status: STATUS.PENDING,
      botEnabled: false
    });
    await logEvent(chatId, 'silent_queue_first_contact', textForDb);
    return;
  }

  if (!existingLeadBeforeMessage && FIRST_CONTACT_MODE === 'approval') {
    const lead = await createLead({
      chatId,
      businessConnectionId,
      from,
      text: textForDb,
      status: STATUS.PENDING,
      botEnabled: false
    });
    await logEvent(chatId, 'pending_first_contact_approval', textForDb);
    await sendAdmin(
      `🆕 Yangi/aniqlanmagan chat yozdi. Bot hozircha javob bermadi.\n\nChat ID: <code>${htmlEscape(chatId)}</code>\nIsm: ${htmlEscape(from.first_name || '')}\nUsername: ${from.username ? '@' + htmlEscape(from.username) : '-'}\n\nXabar: ${htmlEscape(clip(textForDb, 800))}`,
      { reply_markup: leadCardKeyboard({ ...(lead || {}), chat_id: str(chatId), status: STATUS.PENDING, stage: STAGE.NEW }) }
    );
    return;
  }

  if (!text.trim()) {
    const mediaKey = mediaTemplateKey(message);
    if (existingLeadBeforeMessage && existingLeadBeforeMessage.bot_enabled && !FINAL_STATUSES.has(existingLeadBeforeMessage.status) && !STOP_STAGES.has(existingLeadBeforeMessage.stage) && mediaKey) {
      await sendResponsePackage({
        lead: existingLeadBeforeMessage,
        turnId: `media:${chatId}:${messageId || Date.now()}`,
        actionName: `media_${mediaKey}`,
        items: [{ templateKey: mediaKey }, { text: stageReturnQuestion(existingLeadBeforeMessage), templateKey: `return_${existingLeadBeforeMessage.stage}` }],
        nextStage: existingLeadBeforeMessage.stage
      });
    }
    await logEvent(chatId, 'non_text_handled_or_ignored', textForDb);
    return;
  }

  if (isInsideQuietHours() && existingLeadBeforeMessage && existingLeadBeforeMessage.bot_enabled) {
    await updateLead(chatId, { status: STATUS.PAUSED, bot_enabled: false, review_stage: existingLeadBeforeMessage.stage, last_user_message: textForDb, last_message_at: nowIso() });
    await logEvent(chatId, 'quiet_hours_paused', textForDb);
    return;
  }

  // Pending/disabled/stopped chatlarda bot javob bermaydi, faqat oxirgi xabarni yangilab qo'yadi.
  if (existingLeadBeforeMessage && !(existingLeadBeforeMessage.status === STATUS.OUTREACH && outreachState.active) && (!existingLeadBeforeMessage.bot_enabled || FINAL_STATUSES.has(existingLeadBeforeMessage.status) || STOP_STAGES.has(existingLeadBeforeMessage.stage))) {
    await updateLead(chatId, {
      business_connection_id: businessConnectionId || existingLeadBeforeMessage.business_connection_id,
      first_name: from?.first_name || existingLeadBeforeMessage.first_name,
      username: from?.username || existingLeadBeforeMessage.username,
      last_user_message: textForDb,
      last_message_at: nowIso()
    });
    await logEvent(chatId, 'queued_or_inactive_updated_only', textForDb);
    return;
  }

  // Auto/active chatlar: darrov javob bermaymiz; avval per-chat turn queue'ga tushadi.
  enqueueBusinessTurn({ chatId, businessConnectionId, from, text: textForDb, messageId });
}

// -------------------- Reports and lists --------------------

async function buildReportText() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const queries = await Promise.all([
    supabase.from('business_leads').select('*', { count: 'exact', head: true }),
    supabase.from('business_leads').select('*', { count: 'exact', head: true }).eq('status', STATUS.PENDING),
    supabase.from('business_leads').select('*', { count: 'exact', head: true }).eq('status', STATUS.ACTIVE),
    supabase.from('business_leads').select('*', { count: 'exact', head: true }).eq('status', STATUS.PAUSED),
    supabase.from('business_leads').select('*', { count: 'exact', head: true }).eq('status', STATUS.NEEDS_ADMIN),
    supabase.from('business_leads').select('*', { count: 'exact', head: true }).eq('stage', STAGE.BIO_QUESTIONS_SENT),
    supabase.from('business_leads').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
    supabase.from('business_leads').select('*', { count: 'exact', head: true }).eq('status', STATUS.ACTIVE).eq('bot_enabled', true).in('stage', ACTIVE_STAGES)
  ]);

  const counts = queries.map(q => q.count || 0);
  return `📊 OLYE Bot Hisobot\n\nJami lidlar: ${counts[0]}\nBugungi yangi yozganlar: ${counts[6]}\nTasdiq kutayotganlar: ${counts[1]}\nFaol lidlar: ${counts[2]}\nKeyinroq/to‘xtatilgan: ${counts[3]}\nAI tushunmaganlar: ${counts[4]}\nSavollargacha yetganlar: ${counts[5]}\nChala jarayondagilar: ${counts[7]}`;
}

async function getLeadsByList(type) {
  let query = supabase
    .from('business_leads')
    .select('chat_id,first_name,username,status,stage,last_user_message,last_message_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(15);

  if (type === 'pending') query = query.in('status', [STATUS.PENDING, STATUS.OUTREACH]);
  else if (type === 'active') query = query.eq('status', STATUS.ACTIVE).eq('bot_enabled', true);
  else if (type === 'stalled') query = query.eq('status', STATUS.ACTIVE).eq('bot_enabled', true).in('stage', ACTIVE_STAGES).order('updated_at', { ascending: true });
  else if (type === 'needs_admin') query = query.in('status', [STATUS.NEEDS_ADMIN, STATUS.HUMAN_NEEDED]);
  else if (type === 'hot') query = query.eq('hot_lead', true);
  else if (type === 'reached') query = query.eq('stage', STAGE.BIO_QUESTIONS_SENT);
  else query = query.eq('status', STATUS.ACTIVE);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function listTitle(type) {
  return {
    pending: '🆕 Tasdiq kutayotganlar',
    active: '🟢 Faol lidlar',
    stalled: '🟡 Chala qolgan lidlar',
    needs_admin: '⚠️ AI/odam aralashishi kerak',
    hot: '🔥 Issiq lidlar',
    reached: '✅ Savollargacha yetganlar'
  }[type] || 'Lidlar';
}

async function showLeadList(chatId, type, edit = null) {
  const leads = await getLeadsByList(type);
  const title = listTitle(type);
  const text = leads.length
    ? `${title}\n\n${leads.map(leadShortLine).join('\n\n')}\n\nLid kartochkasini ochish uchun pastdagi tugmadan tanlang.`
    : `${title}\n\nHozircha bu ro‘yxatda lid yo‘q.`;

  const extra = { reply_markup: leadListKeyboard(leads, type) };
  if (edit?.messageId) return editMessage(chatId, edit.messageId, text, extra);
  return sendMessage(chatId, text, extra);
}

async function leadCardText(chatId) {
  const lead = await getLead(chatId);
  if (!lead) return { lead: null, text: `Chat ID ${chatId} bo‘yicha lid topilmadi.` };
  return {
    lead,
    text: `👤 Lid kartochkasi\n\nIsm: ${lead.first_name || '-'}\nUsername: ${lead.username ? '@' + lead.username : '-'}\nChat ID: ${lead.chat_id}\nStatus: ${lead.status}\nStage: ${lead.stage}\nOldingi stage: ${lead.review_stage || '-'}\nBot: ${lead.bot_enabled ? 'yoqilgan' : 'o‘chirilgan'}\nAI intent: ${lead.ai_intent || '-'}\nAI ishonch: ${lead.ai_confidence ?? '-'}\n\nOxirgi xabar:\n${lead.last_user_message || '-'}\n\nOxirgi bot javobi:\n${clip(lead.last_bot_message || '-', 700)}`
  };
}

async function showLeadCard(adminChatId, leadChatId, edit = null) {
  const { lead, text } = await leadCardText(leadChatId);
  const extra = { reply_markup: lead ? leadCardKeyboard(lead) : backMenuKeyboard() };
  if (edit?.messageId) return editMessage(adminChatId, edit.messageId, text, extra);
  return sendMessage(adminChatId, text, extra);
}


async function templateHealthText() {
  const required = Object.keys(TEMPLATE_TITLES);
  const rows = await listTemplates().catch(() => []);
  const have = new Set(rows.map(r => r.key));
  const missing = required.filter(k => !have.has(k));
  if (!missing.length) return `✅ Shablonlar joyida.\n\nJami kerakli: ${required.length}\nMavjud: ${rows.length}\n\nEslatma: supabase.sql endi eski tahrirlangan shablonlarni overwrite qilmaydi, faqat yetishmayotgan yangi shablonlarni qo‘shadi.`;
  return `⚠️ Yetishmayotgan shablonlar:\n\n${missing.map(k => `— ${k} (${TEMPLATE_TITLES[k]})`).join('\n')}\n\nSupabase SQL'ni qayta ishlating. Eski tahrirlangan shablonlar o‘zgarmaydi.`;
}

async function showOutreachMenu(chatId, edit = null) {
  const state = await getOutreachAutoState();
  const text = `📣 Outreach Auto\n\nHolat: ${state.active ? 'yoqilgan' : 'o‘chirilgan'}\nTugash vaqti: ${state.until || '-'}\nSession: ${state.session_id || '-'}\n\nQanday ishlaydi: siz Auto rejimni yoqasiz, keyin o‘zingiz yuborgan “Assalomu alaykum...” xabarlarini bot outreach deb eslab qoladi. Faqat shu chatlardan javob kelsa, avtomatik oqim boshlanadi.`;
  const kb = { inline_keyboard: [
    [{ text: '✅ 1 soat', callback_data: 'auto:on:1h' }, { text: '✅ 2 soat', callback_data: 'auto:on:2h' }],
    [{ text: '✅ 3 soat', callback_data: 'auto:on:3h' }, { text: '✅ Bugun oxirigacha', callback_data: 'auto:on:today' }],
    [{ text: '⛔ O‘chirish', callback_data: 'auto:off' }, { text: '📌 Holat', callback_data: 'menu:outreach' }],
    [{ text: '⬅️ Menyu', callback_data: 'menu:main' }]
  ] };
  if (edit?.messageId) return editMessage(chatId, edit.messageId, text, { reply_markup: kb });
  return sendMessage(chatId, text, { reply_markup: kb });
}

async function clearListByType(type) {
  let query = supabase.from('business_leads').update({ status: STATUS.DISABLED, stage: STAGE.DISABLED, bot_enabled: false, is_old_lead: true, updated_at: nowIso() });
  if (type === 'pending') query = query.in('status', [STATUS.PENDING, STATUS.OUTREACH]);
  else if (type === 'needs_admin') query = query.in('status', [STATUS.NEEDS_ADMIN, STATUS.HUMAN_NEEDED]);
  else if (type === 'stalled') query = query.eq('status', STATUS.ACTIVE).eq('bot_enabled', true).in('stage', ACTIVE_STAGES);
  else return 0;
  const { data, error } = await query.select('chat_id');
  if (error) throw error;
  return (data || []).length;
}

// -------------------- Admin handlers --------------------

async function showMainMenu(chatId, edit = null) {
  const text = `OLYE Business AI Bot v5 Lite\n\nBot vazifasi: lidni biografik savollargacha olib kelish.\n\nAdmin spam yo‘q: yangi chatlar va AI tushunmaganlar ro‘yxatda turadi. Kerakli bo‘limni tanlang:`;
  if (edit?.messageId) return editMessage(chatId, edit.messageId, text, { reply_markup: adminMenuKeyboard() });
  return sendMessage(chatId, text, { reply_markup: adminMenuKeyboard() });
}

async function showHelp(chatId, edit = null) {
  const text = `⚙️ Yordam\n\nAsosiy buyruqlar:\n/menu — tugmali menyu\n/report — hisobot\n/pending — tasdiq kutayotganlar\n/active — faol lidlar\n/stalled — chala lidlar\n/needsadmin — AI tushunmaganlar\n/reached — savollargacha yetganlar\n/templates — shablonlar\n/gettemplate key — shablonni ko‘rish\n/settemplate key matn — shablonni o‘zgartirish\n/status chat_id — lid kartochkasi\n/leadson chat_id — botni yoqish\n/leadsoff chat_id — botni o‘chirish\n/restart chat_id — oqimni boshidan boshlash\n\nMuhim: AI muhim joylarda shablondan chiqadi. Noaniq gaplarda esa faqat suhbatni shablonga qaytaradigan qisqa, muloyim ko‘prik javob yozadi.`;
  if (edit?.messageId) return editMessage(chatId, edit.messageId, text, { reply_markup: backMenuKeyboard() });
  return sendMessage(chatId, text, { reply_markup: backMenuKeyboard() });
}

async function showTemplates(chatId, edit = null) {
  const rows = await listTemplates().catch(() => []);
  const text = `✏️ Shablonlar\n\nKerakli shablonni tanlang.\n\nMavjud: ${rows.length || Object.keys(TEMPLATE_TITLES).length}`;
  if (edit?.messageId) return editMessage(chatId, edit.messageId, text, { reply_markup: templateListKeyboard() });
  return sendMessage(chatId, text, { reply_markup: templateListKeyboard() });
}

async function showTemplate(chatId, key, edit = null) {
  const tmpl = await getTemplate(key);
  const text = `✏️ ${TEMPLATE_TITLES[key] || key}\n\nKey: ${key}\n\n${tmpl?.body || 'Shablon topilmadi.'}`;
  if (edit?.messageId) return editMessage(chatId, edit.messageId, text, { reply_markup: templateViewKeyboard(key) });
  return sendMessage(chatId, text, { reply_markup: templateViewKeyboard(key) });
}

async function adminStartFlow(leadChatId, restart = false) {
  let lead = await getLead(leadChatId);
  if (!lead) return `Lid topilmadi: ${leadChatId}`;
  if (!lead.business_connection_id) return `Bu chatda business_connection_id yo‘q. Oqimni boshlay olmadim: ${leadChatId}`;

  if (restart) {
    const activeLead = await updateLead(leadChatId, {
      status: STATUS.ACTIVE,
      bot_enabled: true,
      stage: STAGE.NEW,
      review_stage: null,
      ai_intent: null,
      ai_confidence: null
    }) || lead;

    await sendTemplateToLead({
      lead: { ...activeLead, status: STATUS.ACTIVE, bot_enabled: true, stage: STAGE.NEW },
      templateKey: 'ask_application',
      nextStage: STAGE.ASKED_APPLICATION,
      turnId: 'admin_restart'
    });

    await logEvent(leadChatId, 'admin_restarted_flow', 'Admin restarted flow');
    return `🔁 Oqim qayta boshlandi: ${leadChatId}`;
  }

  // Smart Resume: oddiy “ruxsat berish” endi gapni boshidan boshlamaydi.
  // Avval mavjud stage, admin qo'lda yuborgan oxirgi mavzu va lidning oxirgi javobini tahlil qiladi.
  let stage = lead.stage;
  if ([STAGE.PAUSED, STAGE.NEEDS_ADMIN, STAGE.HUMAN_NEEDED].includes(stage) && lead.review_stage) {
    stage = lead.review_stage;
  }
  if ([STAGE.DISABLED, STAGE.STOPPED, STAGE.BIO_QUESTIONS_SENT].includes(stage)) {
    stage = STAGE.NEW;
  }

  // Agar adminning oxirgi xabari shablon/mavzu sifatida aniqlangan bo'lsa, o'sha stage'dan davom etamiz.
  const outgoingTopic = detectOutgoingTopicFromText(lead.last_bot_message || '');
  if (outgoingTopic && outgoingTopic.topic !== 'manual_greeting') {
    stage = outgoingTopic.stage;
  }

  lead = await updateLead(leadChatId, {
    status: STATUS.ACTIVE,
    bot_enabled: true,
    stage,
    review_stage: null
  }) || { ...lead, status: STATUS.ACTIVE, bot_enabled: true, stage };

  // Agar oldingi savol allaqachon yuborilgan va lid undan keyin javob bergan bo'lsa,
  // o'sha javobni stage bo'yicha davom ettiramiz. Bu ask_info/full_intro takrorini kamaytiradi.
  if (userMessageAfterLastBot(lead) && lead.last_user_message) {
    const intentResult = await aiIntent(lead.last_user_message, lead.stage);
    await updateLead(leadChatId, { ai_intent: intentResult.intent, ai_confidence: intentResult.confidence });
    await continueByIntent(lead, intentResult, lead.last_user_message, `admin_smart_resume:${leadChatId}:${Date.now()}`);
    await logEvent(leadChatId, 'admin_smart_resumed_from_last_user_message', lead.last_user_message);
    return `🤖 Mos joydan davom ettirildi: ${leadChatId}`;
  }

  // Agar chat yangi yoki faqat salom/outreach bo'lsa, birinchi asosiy savol yuboriladi.
  if (stage === STAGE.NEW || lead.last_bot_template_key === 'manual_outreach_greeting') {
    await sendTemplateToLead({
      lead: { ...lead, status: STATUS.ACTIVE, bot_enabled: true, stage: STAGE.NEW },
      templateKey: 'ask_application',
      nextStage: STAGE.ASKED_APPLICATION,
      turnId: `admin_smart_start:${leadChatId}:${Date.now()}`
    });
    await logEvent(leadChatId, 'admin_smart_started_ask_application', 'Smart start sent ask_application');
    return `✅ Oqim mos joydan boshlandi: ${leadChatId}`;
  }

  // Agar tegishli savol/ma'lumot allaqachon yuborilgan bo'lsa, qayta yubormaymiz.
  await logEvent(leadChatId, 'admin_smart_resume_enabled_no_duplicate', `stage=${stage}, last_bot_template=${lead.last_bot_template_key || '-'}`);
  return `✅ Bot yoqildi, mavjud stage saqlandi: ${leadChatId}\nStage: ${stage}\nQayta xabar yuborilmadi.`;
}

async function adminForceYes(leadChatId) {
  let lead = await getLead(leadChatId);
  if (!lead) return `Lid topilmadi: ${leadChatId}`;

  // needs_admin holatida oldingi real stage yo'qolmasligi uchun lead_eventsdan oxirgi active stage topish qiyin.
  // Shuning uchun last_bot_message va ai intentga qarab emas, statusni active qilib, so'nggi ma'lum stagega qaytarish kerak.
  // Agar stage needs_admin bo'lsa, oldingi stage sifatida pendingda qolmasligi uchun default asked_application ishlatiladi.
  let stage = lead.stage;
  if (stage === STAGE.NEEDS_ADMIN) {
    stage = lead.review_stage || STAGE.ASKED_APPLICATION;
  }

  lead = await updateLead(leadChatId, { status: STATUS.ACTIVE, bot_enabled: true, stage, review_stage: null }) || lead;

  if (stage === STAGE.ASKED_APPLICATION) {
    await sendTemplateToLead({ lead, templateKey: 'ask_info', nextStage: STAGE.ASKED_INFO });
    return `✅ Ha deb davom ettirildi: ${leadChatId}`;
  }
  if (stage === STAGE.ASKED_INFO) {
    const updated = await sendTemplateToLead({ lead, templateKey: 'short_intro', nextStage: STAGE.ASKED_INFO });
    await sendTemplateToLead({ lead: updated || lead, templateKey: 'offer_end', nextStage: STAGE.WAITING_OFFER_READ });
    return `✅ Qisqa tanishtiruv yuborildi: ${leadChatId}`;
  }
  if (stage === STAGE.WAITING_OFFER_READ) {
    await sendTemplateToLead({ lead, templateKey: 'ask_bio_confirm', nextStage: STAGE.ASKED_BIO_CONFIRM });
    return `✅ Maqola taklifi yuborildi: ${leadChatId}`;
  }
  if (stage === STAGE.ASKED_BIO_CONFIRM) {
    await sendTemplateToLead({ lead, templateKey: 'bio_questions', nextStage: STAGE.BIO_QUESTIONS_SENT, stop: true });
    return `✅ Bio savollar yuborildi: ${leadChatId}`;
  }

  return adminStartFlow(leadChatId, true);
}

async function handleAdminText(message) {
  const chatId = str(message.chat.id);
  const text = message.text || '';

  const session = await getAdminSession(chatId);
  if (session?.mode === 'editing_template') {
    const key = session.payload?.key;
    if (!key || !TEMPLATE_TITLES[key]) {
      await clearAdminSession(chatId);
      return sendMessage(chatId, 'Xatolik: shablon kaliti topilmadi. Qaytadan /templates bosing.');
    }
    await setTemplate(key, text);
    await clearAdminSession(chatId);
    return sendMessage(chatId, `✅ Shablon yangilandi: ${TEMPLATE_TITLES[key]}\n\nKey: ${key}`, { reply_markup: templateViewKeyboard(key) });
  }

  if (!text.startsWith('/')) return sendMessage(chatId, 'Buyruq yoki /menu yuboring.');

  const { cmd, args } = parseCommand(text);

  if (cmd === '/whoami') {
    return sendMessage(chatId, `Sizning Telegram user ID: ${message.from?.id}
Admin chat ID: ${message.chat?.id}

Render Environment'ga shuni qo'ying:
BUSINESS_OWNER_ID=${message.from?.id}
OWNER_TELEGRAM_ID=${message.from?.id}`);
  }

  if (cmd === '/start' || cmd === '/menu') return showMainMenu(chatId);
  if (cmd === '/help') return showHelp(chatId);
  if (cmd === '/report') return sendMessage(chatId, await buildReportText(), { reply_markup: backMenuKeyboard() });
  if (cmd === '/healthtemplates') return sendMessage(chatId, await templateHealthText(), { reply_markup: backMenuKeyboard() });
  if (cmd === '/autostatus') return showOutreachMenu(chatId);
  if (cmd === '/autooff') { await disableOutreachAuto(); return sendMessage(chatId, '⛔ Outreach Auto o‘chirildi.'); }
  if (cmd === '/auto') {
    const ms = parseDurationToMs(args || 'default');
    if (!ms) return sendMessage(chatId, 'Namuna: /auto 2h yoki /auto today');
    const r = await enableOutreachAuto(ms);
    return sendMessage(chatId, `✅ Outreach Auto yoqildi.\nTugash vaqti: ${r.until}\nSession: ${r.sessionId}`);
  }
  if (cmd === '/pending') return showLeadList(chatId, 'pending');
  if (cmd === '/active') return showLeadList(chatId, 'active');
  if (cmd === '/stalled') return showLeadList(chatId, 'stalled');
  if (cmd === '/needsadmin') return showLeadList(chatId, 'needs_admin');
  if (cmd === '/reached') return showLeadList(chatId, 'reached');
  if (cmd === '/templates') return showTemplates(chatId);

  if (cmd === '/gettemplate') {
    const key = args.trim();
    if (!key) return sendMessage(chatId, 'Namuna: /gettemplate full_intro');
    return showTemplate(chatId, key);
  }

  if (cmd === '/settemplate') {
    const [key, ...bodyParts] = args.split(/\s+/);
    const body = bodyParts.join(' ').trim();
    if (!key || !body) return sendMessage(chatId, 'Namuna: /settemplate offer_end Yangi matn');
    if (!TEMPLATE_TITLES[key]) return sendMessage(chatId, `Bunday key yo‘q: ${key}\n/templates orqali ko‘ring.`);
    await setTemplate(key, body);
    return sendMessage(chatId, `✅ Shablon yangilandi: ${key}`);
  }

  if (cmd === '/testintent') {
    const [stage, ...messageParts] = args.split(/\s+/);
    const sample = messageParts.join(' ').trim();
    if (!stage || !sample) return sendMessage(chatId, "Namuna: /testintent asked_info yo'q");
    const allowedStages = Object.values(STAGE);
    if (!allowedStages.includes(stage)) return sendMessage(chatId, `Stage noto‘g‘ri: ${stage}\nMavjud stage: ${allowedStages.join(', ')}`);
    const local = localIntent(sample, stage);
    const ai = await aiIntent(sample, stage);
    const final = forceIntentByStage(sample, stage, ai);
    return sendMessage(chatId, `🧠 Intent test\n\nStage: ${stage}\nMatn: ${sample}\n\nLocal: ${local.intent} (${local.confidence})${local.forced ? ' forced' : ''}\nAI/final: ${ai.intent} (${ai.confidence})\nYakuniy: ${final.intent} (${final.confidence})${final.forced ? ' forced' : ''}`);
  }

  if (cmd === '/status') {
    const id = args.trim();
    if (!id) return sendMessage(chatId, 'Namuna: /status 123456789');
    return showLeadCard(chatId, id);
  }

  if (cmd === '/leadson') {
    const id = args.trim();
    if (!id) return sendMessage(chatId, 'Namuna: /leadson 123456789');
    const lead = await getLead(id);
    const stage = [STAGE.PAUSED, STAGE.NEEDS_ADMIN].includes(lead?.stage) ? (lead?.review_stage || STAGE.ASKED_APPLICATION) : lead?.stage;
    await updateLead(id, { status: STATUS.ACTIVE, bot_enabled: true, stage, review_stage: null });
    return sendMessage(chatId, `✅ Bot yoqildi: ${id}`);
  }

  if (cmd === '/leadsoff') {
    const id = args.trim();
    if (!id) return sendMessage(chatId, 'Namuna: /leadsoff 123456789');
    await updateLead(id, { status: STATUS.DISABLED, bot_enabled: false, stage: STAGE.DISABLED, is_old_lead: true });
    return sendMessage(chatId, `🔕 Bot o‘chirildi: ${id}`);
  }

  if (cmd === '/restart') {
    const id = args.trim();
    if (!id) return sendMessage(chatId, 'Namuna: /restart 123456789');
    return sendMessage(chatId, await adminStartFlow(id, true));
  }

  return sendMessage(chatId, 'Noma’lum buyruq. /menu bosing.');
}

async function handleCallback(query) {
  const data = query.data || '';
  const msg = query.message;
  const chatId = str(msg?.chat?.id);
  const messageId = msg?.message_id;

  if (!isAdminMessage(msg)) {
    await answerCallbackQuery(query.id, 'Ruxsat yo‘q');
    return;
  }

  await answerCallbackQuery(query.id);

  if (data === 'menu:main') return showMainMenu(chatId, { messageId });
  if (data === 'menu:help') return showHelp(chatId, { messageId });
  if (data === 'menu:outreach') return showOutreachMenu(chatId, { messageId });
  if (data === 'menu:report') return editMessage(chatId, messageId, await buildReportText(), { reply_markup: backMenuKeyboard() });

  if (data.startsWith('auto:on:')) {
    const arg = data.split(':')[2];
    const ms = parseDurationToMs(arg);
    const r = await enableOutreachAuto(ms || DEFAULT_OUTREACH_HOURS * 60 * 60 * 1000);
    await answerCallbackQuery(query.id, 'Outreach Auto yoqildi');
    return showOutreachMenu(chatId, { messageId });
  }
  if (data === 'auto:off') {
    await disableOutreachAuto();
    await answerCallbackQuery(query.id, 'O‘chirildi');
    return showOutreachMenu(chatId, { messageId });
  }

  if (data.startsWith('clear:confirm:')) {
    const type = data.split(':')[2];
    const leads = await getLeadsByList(type);
    const kb = { inline_keyboard: [
      [{ text: `✅ Ha, ${leads.length} tasini disabled qilish`, callback_data: `clear:do:${type}` }],
      [{ text: '❌ Bekor qilish', callback_data: `list:${type}` }]
    ] };
    return editMessage(chatId, messageId, `🧹 ${listTitle(type)} tozalanadi.\n\n${leads.length} ta lid disabled qilinadi. Tasdiqlaysizmi?`, { reply_markup: kb });
  }
  if (data.startsWith('clear:do:')) {
    const type = data.split(':')[2];
    const count = await clearListByType(type);
    return editMessage(chatId, messageId, `✅ Tozalandi: ${count} ta lid disabled qilindi.`, { reply_markup: backMenuKeyboard() });
  }

  if (data.startsWith('list:')) {
    const type = data.split(':')[1];
    return showLeadList(chatId, type, { messageId });
  }

  if (data === 'tmpl:list') return showTemplates(chatId, { messageId });
  if (data.startsWith('tmpl:view:')) {
    const key = data.split(':')[2];
    return showTemplate(chatId, key, { messageId });
  }
  if (data.startsWith('tmpl:edit:')) {
    const key = data.split(':')[2];
    await setAdminSession(chatId, 'editing_template', { key });
    return editMessage(chatId, messageId, `✏️ ${TEMPLATE_TITLES[key] || key}\n\nYangi matnni oddiy xabar qilib yuboring.\nBekor qilish uchun /menu bosing.`);
  }

  if (data.startsWith('lead:view:')) {
    const leadChatId = data.split(':')[2];
    return showLeadCard(chatId, leadChatId, { messageId });
  }

  if (data.startsWith('lead:start:')) {
    const leadChatId = data.split(':')[2];
    await adminStartFlow(leadChatId, false);
    return showLeadCard(chatId, leadChatId, { messageId });
  }

  if (data.startsWith('lead:restart:')) {
    const leadChatId = data.split(':')[2];
    await adminStartFlow(leadChatId, true);
    return showLeadCard(chatId, leadChatId, { messageId });
  }

  if (data.startsWith('lead:send_app:')) {
    const leadChatId = data.split(':')[2];
    const lead = await getLead(leadChatId);
    if (lead) await sendResponsePackage({ lead: { ...lead, bot_enabled: true }, turnId: 'admin_send_app', actionName: 'admin_application_link', items: [{ templateKey: 'application_link_reply' }], nextStage: STAGE.WAITING_APPLICATION_SUBMIT, patch: { status: STATUS.ACTIVE, bot_enabled: true } });
    return showLeadCard(chatId, leadChatId, { messageId });
  }

  if (data.startsWith('lead:send_info:')) {
    const leadChatId = data.split(':')[2];
    const lead = await getLead(leadChatId);
    if (lead) await sendFullExplanationFlow({ ...lead, status: STATUS.ACTIVE, bot_enabled: true }, 'admin_send_info');
    return showLeadCard(chatId, leadChatId, { messageId });
  }

  if (data.startsWith('lead:pause:')) {
    const leadChatId = data.split(':')[2];
    const lead = await getLead(leadChatId);
    await updateLead(leadChatId, { status: STATUS.PAUSED, bot_enabled: false, review_stage: lead?.stage || null, stage: STAGE.PAUSED });
    return showLeadCard(chatId, leadChatId, { messageId });
  }

  if (data.startsWith('lead:off:')) {
    const leadChatId = data.split(':')[2];
    await updateLead(leadChatId, { status: STATUS.DISABLED, bot_enabled: false, stage: STAGE.DISABLED, is_old_lead: true });
    return showLeadCard(chatId, leadChatId, { messageId });
  }

  if (data.startsWith('lead:on:')) {
    const leadChatId = data.split(':')[2];
    const lead = await getLead(leadChatId);
    const stage = [STAGE.PAUSED, STAGE.NEEDS_ADMIN].includes(lead?.stage) ? (lead?.review_stage || STAGE.ASKED_APPLICATION) : lead?.stage;
    await updateLead(leadChatId, { status: STATUS.ACTIVE, bot_enabled: true, stage, review_stage: null });
    return showLeadCard(chatId, leadChatId, { messageId });
  }

  if (data.startsWith('lead:force_yes:')) {
    const leadChatId = data.split(':')[2];
    await adminForceYes(leadChatId);
    return showLeadCard(chatId, leadChatId, { messageId });
  }

  if (data.startsWith('lead:force_no:')) {
    const leadChatId = data.split(':')[2];
    const lead = await getLead(leadChatId);
    if (lead) await stopLeadWithReject({ ...lead, status: STATUS.ACTIVE, bot_enabled: true });
    return showLeadCard(chatId, leadChatId, { messageId });
  }
}


// -------------------- Scheduled follow-ups --------------------

let followupTickRunning = false;

async function processOfferFollowups(limit = 20) {
  if (followupTickRunning) return { ok: true, skipped: 'already_running' };
  followupTickRunning = true;
  let sent = 0;
  try {
    const { data, error } = await supabase
      .from('business_leads')
      .select('*')
      .eq('status', STATUS.ACTIVE)
      .eq('bot_enabled', true)
      .eq('stage', STAGE.WAITING_OFFER_READ)
      .eq('offer_followup_sent', false)
      .lte('offer_followup_due_at', nowIso())
      .order('offer_followup_due_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('processOfferFollowups select:', error);
      return { ok: false, error: error.message };
    }

    for (const lead of data || []) {
      try {
        // Yana bir marta tekshiramiz: agar shu orada stage o'zgargan bo'lsa, yubormaymiz.
        const fresh = await getLead(lead.chat_id);
        if (!fresh || fresh.status !== STATUS.ACTIVE || !fresh.bot_enabled || fresh.stage !== STAGE.WAITING_OFFER_READ || fresh.offer_followup_sent) continue;

        await sendResponsePackage({
          lead: fresh,
          turnId: `offer_followup:${fresh.chat_id}:${fresh.offer_followup_due_at || Date.now()}`,
          actionName: 'offer_followup_once',
          items: [{ templateKey: 'offer_followup' }],
          nextStage: STAGE.WAITING_OFFER_READ,
          patch: {
            offer_followup_sent: true,
            offer_followup_sent_at: nowIso()
          }
        });
        sent += 1;
        await logEvent(fresh.chat_id, 'offer_followup_sent_once', fresh.last_user_message || '');
      } catch (err) {
        console.error('processOfferFollowups item:', err.message);
      }
    }
    return { ok: true, sent, checked: (data || []).length };
  } finally {
    followupTickRunning = false;
  }
}

// -------------------- Express routes --------------------

app.get('/', (req, res) => {
  res.json({ ok: true, name: 'OLYE Business AI Bot v5 Lite', mode: FIRST_CONTACT_MODE, port: PORT });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, time: nowIso() });
});

app.get('/tick', async (req, res) => {
  try {
    const result = await processOfferFollowups();
    res.json({ ok: true, time: nowIso(), followups: result });
  } catch (err) {
    console.error('tick route error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/webhook', (req, res) => {
  res.json({ ok: true, message: "Webhook endpoint ishlayapti. Telegram update'larni POST orqali yuboradi.", method: 'POST /webhook' });
});

app.get('/set-webhook', async (req, res) => {
  try {
    const host = req.get('host');
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const webhookUrl = process.env.WEBHOOK_URL || `${proto}://${host}/webhook`;
    const payload = {
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query', 'business_message']
    };
    if (WEBHOOK_SECRET) payload.secret_token = WEBHOOK_SECRET;
    const result = await tg('setWebhook', payload);
    res.json({ ok: true, message: 'Webhook ulandi.', webhook_url: webhookUrl, allowed_updates: payload.allowed_updates, result });
  } catch (err) {
    console.error('set-webhook route error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/webhook-info', async (req, res) => {
  try {
    const result = await tg('getWebhookInfo', {});
    res.json({ ok: true, result });
  } catch (err) {
    console.error('webhook-info route error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/webhook', async (req, res) => {
  try {
    if (WEBHOOK_SECRET) {
      const got = req.headers['x-telegram-bot-api-secret-token'];
      if (got !== WEBHOOK_SECRET) return res.status(401).json({ ok: false, error: 'bad secret' });
    }

    const update = req.body;
    res.json({ ok: true });

    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return;
    }

    if (update.message) {
      if (isAdminMessage(update.message)) await handleAdminText(update.message);
      return;
    }

    if (update.business_message) {
      await handleBusinessMessage(update.business_message);
      return;
    }
  } catch (err) {
    console.error('webhook handler error:', err);
    try { await sendAdmin(`⚠️ Bot xatosi: ${htmlEscape(err.message)}`); } catch {}
  }
});

app.listen(PORT, () => {
  console.log(`OLYE Business AI Bot v5 Lite running on port ${PORT}`);
  if (FOLLOWUP_TICK_MS > 0) {
    setInterval(() => {
      processOfferFollowups().catch(err => console.error('followup interval error:', err.message));
    }, FOLLOWUP_TICK_MS);
  }
});
