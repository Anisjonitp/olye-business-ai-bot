import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? String(process.env.ADMIN_CHAT_ID) : '';
const OWNER_TELEGRAM_ID = process.env.OWNER_TELEGRAM_ID ? String(process.env.OWNER_TELEGRAM_ID) : '';
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

if (!BOT_TOKEN) throw new Error('BOT_TOKEN missing');
if (!SUPABASE_URL) throw new Error('SUPABASE_URL missing');
if (!SUPABASE_KEY) throw new Error('SUPABASE key missing');
if (!ADMIN_CHAT_ID) console.warn('ADMIN_CHAT_ID missing. Admin menu will not work.');

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const STAGE = Object.freeze({
  NEW: 'new',
  ASKED_APPLICATION: 'asked_application',
  ASKED_INFO: 'asked_info',
  WAITING_OFFER_READ: 'waiting_offer_read',
  ASKED_BIO_CONFIRM: 'asked_bio_confirm',
  BIO_QUESTIONS_SENT: 'bio_questions_sent',
  PAUSED: 'paused',
  NEEDS_ADMIN: 'needs_admin',
  STOPPED: 'stopped',
  DISABLED: 'disabled'
});

const STATUS = Object.freeze({
  PENDING: 'pending_approval',
  ACTIVE: 'active',
  PAUSED: 'paused',
  NEEDS_ADMIN: 'needs_admin',
  STOPPED: 'stopped',
  DISABLED: 'disabled'
});

const FINAL_STATUSES = new Set([STATUS.STOPPED, STATUS.DISABLED]);
const STOP_STAGES = new Set([STAGE.BIO_QUESTIONS_SENT, STAGE.STOPPED, STAGE.DISABLED, STAGE.PAUSED, STAGE.NEEDS_ADMIN]);
const ACTIVE_STAGES = [STAGE.ASKED_APPLICATION, STAGE.ASKED_INFO, STAGE.WAITING_OFFER_READ, STAGE.ASKED_BIO_CONFIRM];

const TEMPLATE_TITLES = {
  ask_application: 'Ariza/qiziqishni tasdiqlash',
  ask_info: 'Ma’lumot bor-yo‘qligini so‘rash',
  short_intro: 'Qisqa tanishtiruv',
  full_intro: 'To‘liq tanishtiruv',
  offer_end: 'Oferta oxiri',
  ask_bio_confirm: 'Biografik maqola taklifi',
  bio_questions: 'Biografik savollar',
  price_reply: 'Narx/badal savoliga javob',
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
  if (OWNER_TELEGRAM_ID && fromId === OWNER_TELEGRAM_ID) return true;
  if (ADMIN_CHAT_ID && chatId === ADMIN_CHAT_ID) return true;
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
        { text: '⚠️ AI tushunmaganlar', callback_data: 'list:needs_admin' },
        { text: '✅ Savollargacha yetganlar', callback_data: 'list:reached' }
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
  rows.push([{ text: '⬅️ Menyu', callback_data: 'menu:main' }]);
  return { inline_keyboard: rows };
}

function leadCardKeyboard(lead) {
  const chatId = lead.chat_id;
  const rows = [];

  if (lead.status === STATUS.PENDING || lead.stage === STAGE.NEW) {
    rows.push([{ text: '▶️ Oqimni boshlash', callback_data: `lead:start:${chatId}` }]);
  }

  if (lead.status === STATUS.NEEDS_ADMIN || lead.stage === STAGE.NEEDS_ADMIN) {
    rows.push([
      { text: '✅ Ha deb davom ettirish', callback_data: `lead:force_yes:${chatId}` },
      { text: '❌ Yo‘q/to‘xtatish', callback_data: `lead:force_no:${chatId}` }
    ]);
  }

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
    'endi yozmang', 'spam qilmang'
  ];
  if (hasAny(t, hardReject)) return { intent: 'reject', confidence: 0.99, forced: true };

  const laterWords = ['keyinroq', 'hozir bandman', 'vaqtim yoq', "vaqtim yo'q", 'ertaga', 'kechqurun', 'keyin yozing', 'keyin gaplashamiz', 'boshqa payt'];
  if (hasAny(t, laterWords)) return { intent: 'later', confidence: 0.96, forced: true };

  const priceWords = ['narx', 'qancha', 'pullikmi', 'pullik', 'tolov', "to'lov", 'to‘lov', 'badal', 'necha pul', 'sum', "so'm", 'so‘m', 'som'];
  if (hasAny(t, priceWords)) return { intent: 'price_question', confidence: 0.96, forced: true };

  if (stage === STAGE.NEW) {
    const greetings = ['assalomu alaykum', 'assalom', 'salom', 'va alaykum', 'valaykum', 'yaxshi', 'ha yaxshi', 'rahmat yaxshi', 'yaxshiman', 'alhamdulillah'];
    if (hasAny(t, greetings)) return { intent: 'greeting_positive', confidence: 0.95, forced: true };
  }

  if (stage === STAGE.ASKED_APPLICATION) {
    const applicationYes = [
      'qoldirdim', 'qoldirgandim', 'ariza', 'anketa', 'forma', 'google form',
      'instagramda', 'instagram', 'instada', 'reklamadan', 'reklamada', 'ko\'rdim', 'ko‘rdim',
      'yozgandim', 'yozgan edim', 'yozganman', 'murojaat qilgandim',
      'dostim aytdi', "do'stim aytdi", 'do‘stim aytdi', 'tanishim aytdi', 'ustozim aytdi',
      'aytishgandi', 'ko\'rgandim', 'ko‘rgandim', 'qiziqib yozgandim', 'qiziqdim',
      'malumot olmoqchi', "ma'lumot olmoqchi", 'ma’lumot olmoqchi', 'bilmoqchi edim'
    ];
    const applicationNo = ['qanaqa ariza', 'men yozmadim', 'ariza qoldirmadim', 'adashdingiz', 'adashdingiz shekilli'];

    if (isExactAny(t, plainYes) || hasAny(t, applicationYes)) return { intent: 'application_confirmed', confidence: 0.98, forced: true };
    if (hasAny(t, applicationNo) || isExactAny(t, plainNo)) return { intent: 'application_denied', confidence: 0.92, forced: true };
  }

  if (stage === STAGE.ASKED_INFO) {
    const hasInfo = ['egaman', 'bilaman', 'xabardorman', "ma'lumotim bor", 'ma’lumotim bor', 'malumotim bor', 'ha bor', 'bor', 'tushunaman'];
    const noInfo = ['bilmayman', "ma'lumotim yo", 'ma’lumotim yo', 'malumotim yo', 'xabardor emasman', 'tushuntiring', 'bilmadim', 'ma\'lumot bering', 'malumot bering', 'berolasizmi malumot'];

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
- "keyinroq", "hozir bandman" kabi javoblar later.
- "kerak emas", "qiziq emas", "bezovta qilmang" kabi aniq rad javoblar reject.
- Oddiy "yo'q"ni avtomatik reject qilma. Stage asked_info bo'lsa "yo'q" = no_info.
- Stage asked_info savoli: "ma'lumotga egamisiz?". Bu bosqichda "yo'q", "bilmayman", "ma'lumotim yo'q" => no_info, bot to'liq ma'lumot yuboradi.
- Stage asked_application bosqichida "instagramda qoldirdim", "do'stim aytdi", "yozgandim", "qiziqib yozgandim" => application_confirmed.
- Ishonching past bo'lsa unclear.

Faqat mana shu JSON formatda qaytar:
{"intent":"...","confidence":0.0}

Ruxsat etilgan intentlar:
greeting_positive, application_confirmed, application_denied, has_info, no_info, ok_wait, read_offer, agree_bio, reject, later, price_question, unclear

Stage: ${stage}
User message: ${text}`;

    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      input: prompt,
      temperature: 0
    });

    const raw = (response.output_text || '').trim();
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
    const allowed = new Set(['greeting_positive', 'application_confirmed', 'application_denied', 'has_info', 'no_info', 'ok_wait', 'read_offer', 'agree_bio', 'reject', 'later', 'price_question', 'unclear']);
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

// -------------------- Lead flow --------------------

async function sendTemplateToLead({ lead, templateKey, nextStage, stop = false, patch = {} }) {
  const body = await getTemplateBody(templateKey);
  if (!body) {
    await sendAdmin(`⚠️ Shablon topilmadi: <code>${htmlEscape(templateKey)}</code>`);
    return null;
  }

  await sendBusinessMessage({
    chatId: lead.chat_id,
    businessConnectionId: lead.business_connection_id,
    text: body
  });

  const update = {
    last_bot_message: body,
    stage: nextStage || lead.stage,
    ...patch
  };
  if (stop) {
    update.status = STATUS.STOPPED;
    update.bot_enabled = false;
  }

  const updated = await updateLead(lead.chat_id, update);
  await logEvent(lead.chat_id, `bot_sent_${templateKey}`, body);
  return updated;
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

async function pauseLead(lead, templateKey = 'later_reply') {
  const updated = await sendTemplateToLead({
    lead,
    templateKey,
    nextStage: STAGE.PAUSED,
    patch: { status: STATUS.PAUSED, bot_enabled: false, review_stage: lead.stage }
  });
  await logEvent(lead.chat_id, 'lead_paused', lead.last_user_message || '');
  return updated;
}

async function stopLeadWithReject(lead) {
  const updated = await sendTemplateToLead({
    lead,
    templateKey: 'reject_reply',
    nextStage: STAGE.STOPPED,
    stop: true
  });
  await logEvent(lead.chat_id, 'lead_rejected_or_stopped', lead.last_user_message || '');
  return updated;
}

async function continueByIntent(lead, intentResult, userText = '') {
  // Yakuniy himoya: AI noto'g'ri tushunsa ham stage-specific qoida yutadi.
  const forced = forceIntentByStage(userText, lead.stage, intentResult);
  const { intent, confidence } = forced;

  if (intent === 'unclear' || confidence < AI_CONFIDENCE_MIN) {
    await moveToNeedsAdmin(lead, userText, intentResult);
    return;
  }

  if (intent === 'reject' || intent === 'application_denied') {
    await stopLeadWithReject(lead);
    return;
  }

  if (intent === 'later') {
    await pauseLead(lead);
    return;
  }

  if (intent === 'price_question') {
    await sendTemplateToLead({ lead, templateKey: 'price_reply', nextStage: lead.stage });
    return;
  }

  if (lead.stage === STAGE.NEW && intent === 'greeting_positive') {
    await sendTemplateToLead({ lead, templateKey: 'ask_application', nextStage: STAGE.ASKED_APPLICATION });
    return;
  }

  if (lead.stage === STAGE.ASKED_APPLICATION && intent === 'application_confirmed') {
    await sendTemplateToLead({ lead, templateKey: 'ask_info', nextStage: STAGE.ASKED_INFO });
    return;
  }

  if (lead.stage === STAGE.ASKED_INFO && intent === 'has_info') {
    const updated = await sendTemplateToLead({ lead, templateKey: 'short_intro', nextStage: STAGE.ASKED_INFO });
    await sendTemplateToLead({ lead: updated || lead, templateKey: 'offer_end', nextStage: STAGE.WAITING_OFFER_READ });
    return;
  }

  if (lead.stage === STAGE.ASKED_INFO && intent === 'no_info') {
    const updated = await sendTemplateToLead({ lead, templateKey: 'full_intro', nextStage: STAGE.ASKED_INFO });
    await sendTemplateToLead({ lead: updated || lead, templateKey: 'offer_end', nextStage: STAGE.WAITING_OFFER_READ });
    return;
  }

  if (lead.stage === STAGE.WAITING_OFFER_READ && intent === 'ok_wait') {
    await logEvent(lead.chat_id, 'ok_wait_no_reply', userText);
    return;
  }

  if (lead.stage === STAGE.WAITING_OFFER_READ && intent === 'read_offer') {
    await sendTemplateToLead({ lead, templateKey: 'ask_bio_confirm', nextStage: STAGE.ASKED_BIO_CONFIRM });
    return;
  }

  if (lead.stage === STAGE.ASKED_BIO_CONFIRM && intent === 'agree_bio') {
    await sendTemplateToLead({
      lead,
      templateKey: 'bio_questions',
      nextStage: STAGE.BIO_QUESTIONS_SENT,
      stop: true
    });
    await logEvent(lead.chat_id, 'bio_questions_reached', userText);
    return;
  }

  await moveToNeedsAdmin(lead, userText, intentResult);
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

  // O'zimiz yuborgan yoki botdan kelgan xabarlarni qayta ishlamaymiz.
  if (from?.is_bot) return;
  if (OWNER_TELEGRAM_ID && str(from?.id) === OWNER_TELEGRAM_ID) return;

  const textForDb = text.trim() ? text : '[non-text message]';
  const existingLeadBeforeMessage = await getLead(chatId);

  // DB'da yo'q chat: default silent_queue. Bot ham, admin ham spam qilmaydi.
  if (!existingLeadBeforeMessage && FIRST_CONTACT_MODE === 'silent_queue') {
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

  let lead = await findOrCreateLead({
    chatId,
    businessConnectionId,
    from,
    text: textForDb,
    status: FIRST_CONTACT_MODE === 'approval' ? STATUS.PENDING : STATUS.ACTIVE,
    botEnabled: FIRST_CONTACT_MODE !== 'approval'
  });
  if (!lead) return;

  if (!existingLeadBeforeMessage && FIRST_CONTACT_MODE === 'approval') {
    await updateLead(chatId, { status: STATUS.PENDING, bot_enabled: false, stage: STAGE.NEW });
    await logEvent(chatId, 'pending_first_contact_approval', textForDb);
    await sendAdmin(
      `🆕 Yangi/aniqlanmagan chat yozdi. Bot hozircha javob bermadi.\n\nChat ID: <code>${htmlEscape(chatId)}</code>\nIsm: ${htmlEscape(from.first_name || '')}\nUsername: ${from.username ? '@' + htmlEscape(from.username) : '-'}\n\nXabar: ${htmlEscape(clip(textForDb, 800))}`,
      { reply_markup: leadCardKeyboard({ ...lead, chat_id: str(chatId), status: STATUS.PENDING, stage: STAGE.NEW }) }
    );
    return;
  }

  if (!text.trim()) {
    await logEvent(chatId, 'non_text_ignored', textForDb);
    return;
  }

  if (!lead.bot_enabled || FINAL_STATUSES.has(lead.status) || STOP_STAGES.has(lead.stage)) {
    await logEvent(chatId, 'ignored_not_active', textForDb);
    return;
  }

  const intentResult = await aiIntent(text, lead.stage);
  await updateLead(chatId, {
    ai_intent: intentResult.intent,
    ai_confidence: intentResult.confidence
  });
  await logEvent(chatId, `intent_${intentResult.intent}_${intentResult.confidence}`, text);

  lead = await getLead(chatId) || lead;
  await continueByIntent(lead, intentResult, text);
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

  if (type === 'pending') query = query.eq('status', STATUS.PENDING);
  else if (type === 'active') query = query.eq('status', STATUS.ACTIVE).eq('bot_enabled', true);
  else if (type === 'stalled') query = query.eq('status', STATUS.ACTIVE).eq('bot_enabled', true).in('stage', ACTIVE_STAGES).order('updated_at', { ascending: true });
  else if (type === 'needs_admin') query = query.eq('status', STATUS.NEEDS_ADMIN);
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
    needs_admin: '⚠️ AI tushunmaganlar',
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

// -------------------- Admin handlers --------------------

async function showMainMenu(chatId, edit = null) {
  const text = `OLYE Business AI Bot v5 Lite\n\nBot vazifasi: lidni biografik savollargacha olib kelish.\n\nAdmin spam yo‘q: yangi chatlar va AI tushunmaganlar ro‘yxatda turadi. Kerakli bo‘limni tanlang:`;
  if (edit?.messageId) return editMessage(chatId, edit.messageId, text, { reply_markup: adminMenuKeyboard() });
  return sendMessage(chatId, text, { reply_markup: adminMenuKeyboard() });
}

async function showHelp(chatId, edit = null) {
  const text = `⚙️ Yordam\n\nAsosiy buyruqlar:\n/menu — tugmali menyu\n/report — hisobot\n/pending — tasdiq kutayotganlar\n/active — faol lidlar\n/stalled — chala lidlar\n/needsadmin — AI tushunmaganlar\n/reached — savollargacha yetganlar\n/templates — shablonlar\n/gettemplate key — shablonni ko‘rish\n/settemplate key matn — shablonni o‘zgartirish\n/status chat_id — lid kartochkasi\n/leadson chat_id — botni yoqish\n/leadsoff chat_id — botni o‘chirish\n/restart chat_id — oqimni boshidan boshlash\n\nMuhim: AI mijozga erkin javob yozmaydi. U faqat intent aniqlaydi. Javoblar faqat shablondan chiqadi.`;
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
  const lead = await getLead(leadChatId);
  if (!lead) return `Lid topilmadi: ${leadChatId}`;
  if (!lead.business_connection_id) return `Bu chatda business_connection_id yo‘q. Oqimni boshlay olmadim: ${leadChatId}`;

  const activeLead = await updateLead(leadChatId, {
    status: STATUS.ACTIVE,
    bot_enabled: true,
    stage: STAGE.NEW,
    ai_intent: null,
    ai_confidence: null
  }) || lead;

  await sendTemplateToLead({
    lead: { ...activeLead, status: STATUS.ACTIVE, bot_enabled: true, stage: STAGE.NEW },
    templateKey: 'ask_application',
    nextStage: STAGE.ASKED_APPLICATION
  });

  await logEvent(leadChatId, restart ? 'admin_restarted_flow' : 'admin_started_flow', 'Admin started flow');
  return restart ? `🔁 Oqim qayta boshlandi: ${leadChatId}` : `✅ Oqim boshlandi: ${leadChatId}`;
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

  if (cmd === '/start' || cmd === '/menu') return showMainMenu(chatId);
  if (cmd === '/help') return showHelp(chatId);
  if (cmd === '/report') return sendMessage(chatId, await buildReportText(), { reply_markup: backMenuKeyboard() });
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
  if (data === 'menu:report') return editMessage(chatId, messageId, await buildReportText(), { reply_markup: backMenuKeyboard() });

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

// -------------------- Express routes --------------------

app.get('/', (req, res) => {
  res.json({ ok: true, name: 'OLYE Business AI Bot v5 Lite', mode: FIRST_CONTACT_MODE, port: PORT });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, time: nowIso() });
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
});
