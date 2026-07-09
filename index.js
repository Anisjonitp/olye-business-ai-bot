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
// approval = yangi ko'rinmagan chatlarda avval admin tasdiqlaydi. auto = eski holat, darrov oqim boshlaydi.
const FIRST_CONTACT_MODE = (process.env.FIRST_CONTACT_MODE || 'approval').toLowerCase();

if (!BOT_TOKEN) throw new Error('BOT_TOKEN missing');
if (!SUPABASE_URL) throw new Error('SUPABASE_URL missing');
if (!SUPABASE_KEY) throw new Error('SUPABASE key missing');
if (!ADMIN_CHAT_ID) console.warn('ADMIN_CHAT_ID missing. Admin menu and alerts will not work.');

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
  STOPPED: 'stopped',
  DISABLED: 'disabled'
});

const STOP_STAGES = new Set([STAGE.BIO_QUESTIONS_SENT, STAGE.STOPPED, STAGE.DISABLED]);
const FINAL_STATUSES = new Set(['stopped', 'disabled']);

const TEMPLATE_TITLES = {
  ask_application: 'Ariza qoldirganini so‘rash',
  ask_info: 'Ma’lumot bor-yo‘qligini so‘rash',
  short_intro: 'Qisqa tanishtiruv',
  full_intro: 'To‘liq tanishtiruv',
  offer_end: 'Oferta oxiri',
  ask_bio_confirm: 'Biografik maqola taklifi',
  bio_questions: 'Biografik savollar',
  discount_message: 'Chegirma xabari'
};

// -------------------- General helpers --------------------

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

function isAdminMessage(msg) {
  const chatId = str(msg?.chat?.id);
  const fromId = str(msg?.from?.id);
  if (OWNER_TELEGRAM_ID && fromId === OWNER_TELEGRAM_ID) return true;
  if (ADMIN_CHAT_ID && chatId === ADMIN_CHAT_ID) return true;
  return false;
}

function parseCommand(text = '') {
  const trimmed = String(text || '').trim();
  const [cmdRaw, ...rest] = trimmed.split(/\s+/);
  const cmd = (cmdRaw || '').split('@')[0].toLowerCase();
  const args = trimmed.slice(cmdRaw.length).trim();
  return { cmd, args };
}

// -------------------- Telegram API helpers --------------------

async function tg(method, payload = {}) {
  const res = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    console.error('Telegram API error:', method, JSON.stringify(data));
    throw new Error(`Telegram API error: ${method}`);
  }
  return data.result;
}

async function sendMessage(chatId, text, extra = {}) {
  return tg('sendMessage', {
    chat_id: chatId,
    text: clip(text, 4096),
    ...extra
  });
}

async function editMessage(chatId, messageId, text, extra = {}) {
  return tg('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: clip(text, 4096),
    ...extra
  });
}

async function answerCallbackQuery(callbackQueryId, text = '') {
  try {
    await tg('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text
    });
  } catch (err) {
    console.error('answerCallbackQuery:', err.message);
  }
}

async function sendAdmin(text, extra = {}) {
  if (!ADMIN_CHAT_ID) return;
  try {
    await sendMessage(ADMIN_CHAT_ID, text, { parse_mode: 'HTML', ...extra });
  } catch (err) {
    console.error('sendAdmin:', err.message);
  }
}

async function sendBusinessMessage({ chatId, businessConnectionId, text, replyMarkup }) {
  if (!businessConnectionId) {
    console.warn('No business_connection_id for chat:', chatId);
    return null;
  }
  return tg('sendMessage', {
    chat_id: chatId,
    business_connection_id: businessConnectionId,
    text: clip(text, 4096),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  });
}

function adminMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 Hisobot', callback_data: 'menu:report' },
        { text: '🟡 Chala lidlar', callback_data: 'menu:stalled' }
      ],
      [
        { text: '✏️ Shablonlar', callback_data: 'tmpl:list' },
        { text: '🎁 Chegirma', callback_data: 'discount:preview' }
      ],
      [
        { text: '🧾 Bo‘lib to‘lashlar', callback_data: 'installments:due' },
        { text: '⚙️ Yordam', callback_data: 'menu:help' }
      ]
    ]
  };
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

function leadActionKeyboard(chatId) {
  return {
    inline_keyboard: [
      [
        { text: '🔕 Botni o‘chirish', callback_data: `lead:off:${chatId}` },
        { text: '🔔 Botni yoqish', callback_data: `lead:on:${chatId}` }
      ],
      [{ text: '📌 Status', callback_data: `lead:status:${chatId}` }]
    ]
  };
}

function firstContactApprovalKeyboard(chatId) {
  return {
    inline_keyboard: [
      [{ text: '✅ Oqimni boshlash', callback_data: `lead:start:${chatId}` }],
      [{ text: '🔕 Eski chat / botni o‘chirish', callback_data: `lead:off:${chatId}` }],
      [{ text: '📌 Status', callback_data: `lead:status:${chatId}` }]
    ]
  };
}

// -------------------- Supabase helpers --------------------

async function dbOne(queryPromise, label) {
  const { data, error } = await queryPromise;
  if (error) {
    console.error(label, error);
    throw error;
  }
  return data;
}

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
  return data;
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

async function createLead({ chatId, businessConnectionId, from, text }) {
  const payload = {
    chat_id: str(chatId),
    business_connection_id: businessConnectionId || null,
    first_name: from?.first_name || null,
    username: from?.username || null,
    status: 'active',
    stage: STAGE.NEW,
    bot_enabled: true,
    is_old_lead: false,
    last_user_message: text || '',
    last_message_at: nowIso(),
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
  return data;
}

async function findOrCreateLead({ chatId, businessConnectionId, from, text }) {
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
  return createLead({ chatId, businessConnectionId, from, text });
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

function localIntent(text, stage) {
  const t = normalizeText(text);
  if (!t) return 'unclear';

  const greetings = [
    'assalomu alaykum', 'assalom', 'salom', 'va alaykum', 'valaykum',
    'yaxshi', 'ha yaxshi', 'rahmat yaxshi', 'yaxshiman', 'alhamdulillah'
  ];

  if (stage === STAGE.NEW) {
    if (greetings.some(w => t.includes(w))) return 'greeting_positive';
  }

  const yesLike = [
    'ha', 'xa', 'haa', 'haaa', 'ok', 'mayli', 'boladi', "bo'ladi", 'togri', "to'g'ri",
    'shunaqa', 'qoldirgandim', 'ariza qoldirganman', 'ariza berganman'
  ];
  const noLike = ['yoq', "yo'q", 'yoq rahmat', 'kerak emas', 'xohlamayman', 'qiziq emas'];

  if (stage === STAGE.ASKED_APPLICATION) {
    if (noLike.some(w => t.includes(w))) return 'no';
    if (yesLike.some(w => t === w || t.includes(w))) return 'yes';
  }

  if (stage === STAGE.ASKED_INFO) {
    if (
      t.includes('egaman') ||
      t.includes('bilaman') ||
      t.includes('xabardorman') ||
      t.includes("ma'lumotim bor") ||
      t.includes('malumotim bor') ||
      t.includes('ha bor') ||
      t === 'ha'
    ) return 'has_info';

    if (
      t.includes('bilmayman') ||
      t.includes("ma'lumotim yo") ||
      t.includes('malumotim yo') ||
      t.includes('xabardor emasman') ||
      t.includes('tushuntiring') ||
      t.includes('bilmadim') ||
      t.includes('yoq') ||
      t.includes("yo'q")
    ) return 'no_info';
  }

  if (stage === STAGE.WAITING_OFFER_READ) {
    if (
      t.includes('tanishdim') ||
      t.includes('oqib chiqdim') ||
      t.includes("o'qib chiqdim") ||
      t.includes('korib chiqdim') ||
      t.includes("ko'rib chiqdim") ||
      t.includes('tushunarli')
    ) return 'read_offer';

    if (t.includes('hop') || t.includes("ho'p") || t.includes('mayli') || t === 'ok' || t === 'boladi' || t === "bo'ladi") {
      return 'ok_wait';
    }
  }

  if (stage === STAGE.ASKED_BIO_CONFIRM) {
    if (noLike.some(w => t.includes(w))) return 'no';
    if (
      t === 'ha' || t === 'xa' || t.includes('ha yoz') || t.includes('yozing') ||
      t.includes('maqola yoz') || t.includes('boshlayver') || t.includes('qilavering') ||
      t.includes('roziman') || t.includes('mayli')
    ) return 'agree_bio';
  }

  return 'unclear';
}

async function aiIntent(text, stage) {
  const fallback = localIntent(text, stage);

  if (!openai) return fallback;

  try {
    const prompt = `Sen Telegram savdo botidagi intent-classifier bo'lib ishlaysan.

Qoidalar:
- O'zbek, rus, ingliz, lotin/kirill aralash javoblarni tushun.
- Faqat quyidagi intentlardan bittasini qaytar:
greeting_positive, yes, has_info, no_info, ok_wait, read_offer, agree_bio, no, unclear
- Hech qanday izoh, markdown yoki qo'shimcha matn yozma.
- Stage juda muhim. "ha" stage'ga qarab boshqa ma'no beradi.

Stage: ${stage}
User message: ${text}`;

    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      input: prompt,
      temperature: 0
    });

    const out = (response.output_text || '').trim().toLowerCase();
    const allowed = new Set(['greeting_positive', 'yes', 'has_info', 'no_info', 'ok_wait', 'read_offer', 'agree_bio', 'no', 'unclear']);
    return allowed.has(out) ? out : fallback;
  } catch (err) {
    console.error('aiIntent fallback:', err.message);
    return fallback;
  }
}

// -------------------- Lead flow --------------------

async function sendTemplateToLead({ lead, templateKey, nextStage, stop = false }) {
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

  const patch = {
    last_bot_message: body,
    stage: nextStage || lead.stage
  };
  if (stop) {
    patch.status = 'stopped';
    patch.bot_enabled = false;
  }

  const updated = await updateLead(lead.chat_id, patch);
  await logEvent(lead.chat_id, `bot_sent_${templateKey}`, body);
  return updated;
}

async function handleBusinessMessage(message) {
  const text = message?.text || message?.caption || '';
  const chatId = message?.chat?.id;
  const from = message?.from || {};
  const businessConnectionId = message?.business_connection_id || message?.business_connection?.id || null;

  if (!chatId) return;

  // O'zimiz yuborgan yoki botdan kelgan xabarlarni qayta ishlamaymiz.
  if (from?.is_bot) return;
  if (OWNER_TELEGRAM_ID && str(from?.id) === OWNER_TELEGRAM_ID) return;

  if (!text.trim()) {
    const lead = await findOrCreateLead({ chatId, businessConnectionId, from, text: '[non-text message]' });
    if (lead && STOP_STAGES.has(lead.stage)) {
      await sendAdmin(
        `📩 To‘xtatilgan chatdan fayl/rasm keldi\n\nChat ID: <code>${htmlEscape(chatId)}</code>\nIsm: ${htmlEscape(lead.first_name || '')}`,
        { reply_markup: leadActionKeyboard(chatId) }
      );
    }
    return;
  }

  const existingLeadBeforeMessage = await getLead(chatId);
  let lead = await findOrCreateLead({ chatId, businessConnectionId, from, text });
  if (!lead) return;

  // Eski Telegram yozishmalar muammosi uchun xavfsiz rejim:
  // bot tarixni ko'ra olmaydi, shuning uchun DB'da yo'q chatni avtomatik boshlamaymiz.
  // Admin "Oqimni boshlash" tugmasini bossagina mijozga birinchi shablon ketadi.
  if (!existingLeadBeforeMessage && FIRST_CONTACT_MODE !== 'auto') {
    lead = await updateLead(chatId, {
      status: 'pending_approval',
      bot_enabled: false,
      stage: STAGE.NEW
    }) || lead;

    await logEvent(chatId, 'pending_first_contact_approval', text);
    await sendAdmin(
      `🆕 Yangi/aniqlanmagan chat yozdi. Bot hozircha javob bermadi.\n\nChat ID: <code>${htmlEscape(chatId)}</code>\nIsm: ${htmlEscape(from.first_name || '')}\nUsername: ${from.username ? '@' + htmlEscape(from.username) : '-'}\n\nXabar: ${htmlEscape(clip(text, 800))}\n\nAgar bu yangi lid bo‘lsa — <b>Oqimni boshlash</b> tugmasini bosing. Agar eski yozishma bo‘lsa — <b>Eski chat / botni o‘chirish</b> tugmasini bosing.`,
      { reply_markup: firstContactApprovalKeyboard(chatId) }
    );
    return;
  }

  if (!lead.bot_enabled || FINAL_STATUSES.has(lead.status) || STOP_STAGES.has(lead.stage)) {
    await logEvent(chatId, 'ignored_stopped_or_disabled', text);
    await sendAdmin(
      `📩 Bot jim turgan chatdan xabar keldi\n\nChat ID: <code>${htmlEscape(chatId)}</code>\nIsm: ${htmlEscape(lead.first_name || '')}\nUsername: ${lead.username ? '@' + htmlEscape(lead.username) : '-'}\nStage: <code>${htmlEscape(lead.stage)}</code>\n\nXabar: ${htmlEscape(clip(text, 800))}`,
      { reply_markup: leadActionKeyboard(chatId) }
    );
    return;
  }

  const intent = await aiIntent(text, lead.stage);
  await logEvent(chatId, `intent_${intent}`, text);

  if (lead.stage === STAGE.NEW && intent === 'greeting_positive') {
    const updated = await sendTemplateToLead({ lead, templateKey: 'ask_application', nextStage: STAGE.ASKED_APPLICATION });
    await sendAdmin(
      `🆕 Yangi lid oqimi boshlandi\n\nChat ID: <code>${htmlEscape(chatId)}</code>\nIsm: ${htmlEscape(from.first_name || '')}\nUsername: ${from.username ? '@' + htmlEscape(from.username) : '-'}\nIntent: <code>${intent}</code>`,
      { reply_markup: leadActionKeyboard(chatId) }
    );
    lead = updated || lead;
    return;
  }

  if (lead.stage === STAGE.ASKED_APPLICATION && intent === 'yes') {
    await sendTemplateToLead({ lead, templateKey: 'ask_info', nextStage: STAGE.ASKED_INFO });
    return;
  }

  if (lead.stage === STAGE.ASKED_APPLICATION && intent === 'no') {
    await updateLead(chatId, { status: 'stopped', bot_enabled: false, stage: STAGE.STOPPED });
    await sendAdmin(
      `⛔ Lid arizani tasdiqlamadi. Bot to‘xtadi.\n\nChat ID: <code>${htmlEscape(chatId)}</code>\nXabar: ${htmlEscape(text)}`,
      { reply_markup: leadActionKeyboard(chatId) }
    );
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
    await logEvent(chatId, 'ok_wait_no_reply', text);
    await sendAdmin(
      `⏳ Lid oferta bilan tanishmoqchi. Bot jim turdi.\n\nChat ID: <code>${htmlEscape(chatId)}</code>\nXabar: ${htmlEscape(text)}`,
      { reply_markup: leadActionKeyboard(chatId) }
    );
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
    await sendAdmin(
      `✅ Lid biografik savollargacha yetib keldi\n\nChat ID: <code>${htmlEscape(chatId)}</code>\nIsm: ${htmlEscape(lead.first_name || '')}\nUsername: ${lead.username ? '@' + htmlEscape(lead.username) : '-'}\n\nEndi qolganini qo‘lda davom ettirasiz.`,
      { reply_markup: leadActionKeyboard(chatId) }
    );
    return;
  }

  if (lead.stage === STAGE.ASKED_BIO_CONFIRM && intent === 'no') {
    await updateLead(chatId, { status: 'stopped', bot_enabled: false, stage: STAGE.STOPPED });
    await sendAdmin(
      `⛔ Lid biografik maqolaga rozi bo‘lmadi. Bot to‘xtadi.\n\nChat ID: <code>${htmlEscape(chatId)}</code>\nXabar: ${htmlEscape(text)}`,
      { reply_markup: leadActionKeyboard(chatId) }
    );
    return;
  }

  await sendAdmin(
    `❓ Bot aniqlay olmadi, javob bermadi\n\nChat ID: <code>${htmlEscape(chatId)}</code>\nStage: <code>${htmlEscape(lead.stage)}</code>\nIntent: <code>${htmlEscape(intent)}</code>\nXabar: ${htmlEscape(clip(text, 800))}`,
    { reply_markup: leadActionKeyboard(chatId) }
  );
}

// -------------------- Reports / stalled / discount / installments --------------------

async function buildReportText() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [{ count: total }, { count: active }, { count: stopped }, { count: disabled }, { count: bio }, { count: todayNew }, { count: stalled }] = await Promise.all([
    supabase.from('business_leads').select('*', { count: 'exact', head: true }),
    supabase.from('business_leads').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('business_leads').select('*', { count: 'exact', head: true }).eq('status', 'stopped'),
    supabase.from('business_leads').select('*', { count: 'exact', head: true }).eq('status', 'disabled'),
    supabase.from('business_leads').select('*', { count: 'exact', head: true }).eq('stage', STAGE.BIO_QUESTIONS_SENT),
    supabase.from('business_leads').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
    supabase.from('business_leads').select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('bot_enabled', true)
      .in('stage', [STAGE.ASKED_APPLICATION, STAGE.ASKED_INFO, STAGE.WAITING_OFFER_READ, STAGE.ASKED_BIO_CONFIRM])
  ]);

  return `📊 OLYE Bot Hisobot\n\nJami lidlar: ${total || 0}\nBugungi yangi lidlar: ${todayNew || 0}\nActive: ${active || 0}\nStopped: ${stopped || 0}\nDisabled: ${disabled || 0}\nBio savollar yuborilgan: ${bio || 0}\nChala qolganlar: ${stalled || 0}`;
}

async function buildStalledText() {
  const { data, error } = await supabase
    .from('business_leads')
    .select('chat_id,first_name,username,stage,last_user_message,last_message_at,updated_at')
    .eq('status', 'active')
    .eq('bot_enabled', true)
    .in('stage', [STAGE.ASKED_APPLICATION, STAGE.ASKED_INFO, STAGE.WAITING_OFFER_READ, STAGE.ASKED_BIO_CONFIRM])
    .order('updated_at', { ascending: true })
    .limit(20);

  if (error) throw error;
  if (!data?.length) return '🟡 Chala qolgan lidlar yo‘q.';

  const lines = data.map((l, i) => {
    const name = l.first_name || '-';
    const username = l.username ? `@${l.username}` : '-';
    return `${i + 1}. ${name} ${username}\nChat ID: ${l.chat_id}\nStage: ${l.stage}\nOxirgi xabar: ${clip(l.last_user_message || '-', 120)}`;
  });

  return `🟡 Chala qolgan lidlar\n\n${lines.join('\n\n')}`;
}

async function getDiscountTargets() {
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('business_leads')
    .select('chat_id,business_connection_id,first_name,username,stage,updated_at')
    .eq('status', 'active')
    .eq('bot_enabled', true)
    .in('stage', [STAGE.WAITING_OFFER_READ, STAGE.ASKED_BIO_CONFIRM])
    .lte('updated_at', tenDaysAgo)
    .limit(50);
  if (error) throw error;
  return data || [];
}

async function createDiscountPreview() {
  const targets = await getDiscountTargets();
  const template = await getTemplateBody('discount_message');
  const { data, error } = await supabase.from('pending_actions').insert({
    action_type: 'discount_broadcast',
    status: 'pending',
    payload: {
      template_key: 'discount_message',
      template_body: template,
      target_chat_ids: targets.map(t => t.chat_id),
      created_at: nowIso()
    }
  }).select().single();
  if (error) throw error;

  const preview = targets.slice(0, 15).map((t, i) => `${i + 1}. ${t.first_name || '-'} ${t.username ? '@' + t.username : ''}\nChat ID: ${t.chat_id}\nStage: ${t.stage}`).join('\n\n');

  return {
    action: data,
    text: `🎁 Chegirma yuborish preview\n\nTopilgan lidlar: ${targets.length}\nPending action ID: ${data.id}\n\nYuboriladigan matn:\n${template || 'discount_message shabloni topilmadi'}\n\nKimlarga:\n${preview || 'Mos lid topilmadi'}\n\nTasdiqlash: /discount_confirm ${data.id}\nBekor qilish: /discount_cancel ${data.id}`
  };
}

async function confirmDiscount(actionId) {
  const { data: action, error } = await supabase
    .from('pending_actions')
    .select('*')
    .eq('id', Number(actionId))
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throw error;
  if (!action) return { sent: 0, text: 'Pending action topilmadi yoki allaqachon ishlatilgan.' };

  const targetIds = action.payload?.target_chat_ids || [];
  const templateBody = action.payload?.template_body || await getTemplateBody(action.payload?.template_key || 'discount_message');
  if (!targetIds.length) return { sent: 0, text: 'Yuboriladigan lid yo‘q.' };
  if (!templateBody) return { sent: 0, text: 'Chegirma shabloni topilmadi.' };

  const { data: leads, error: leadsError } = await supabase
    .from('business_leads')
    .select('chat_id,business_connection_id')
    .in('chat_id', targetIds);
  if (leadsError) throw leadsError;

  let sent = 0;
  for (const lead of leads || []) {
    try {
      await sendBusinessMessage({
        chatId: lead.chat_id,
        businessConnectionId: lead.business_connection_id,
        text: templateBody
      });
      sent += 1;
      await logEvent(lead.chat_id, 'discount_sent', templateBody);
    } catch (err) {
      console.error('discount send error:', lead.chat_id, err.message);
    }
  }

  await supabase.from('pending_actions').update({ status: 'confirmed', confirmed_at: nowIso() }).eq('id', Number(actionId));
  return { sent, text: `✅ Chegirma yuborildi. Yuborilgan: ${sent}` };
}

async function cancelDiscount(actionId) {
  const { error } = await supabase
    .from('pending_actions')
    .update({ status: 'canceled', canceled_at: nowIso() })
    .eq('id', Number(actionId))
    .eq('status', 'pending');
  if (error) throw error;
  return '✅ Chegirma yuborish bekor qilindi.';
}

async function createInstallment(chatId, amount) {
  const start = new Date();
  const d5 = new Date(start.getTime() + 5 * 24 * 60 * 60 * 1000);
  const d10 = new Date(start.getTime() + 10 * 24 * 60 * 60 * 1000);
  const d14 = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  const { error } = await supabase.from('installments').insert({
    chat_id: str(chatId),
    initial_amount: Number(amount || 0),
    started_at: start.toISOString(),
    day5_at: d5.toISOString(),
    day10_at: d10.toISOString(),
    day14_at: d14.toISOString(),
    status: 'active'
  });
  if (error) throw error;
  return `✅ Bo‘lib to‘lash qayd qilindi.\nChat ID: ${chatId}\nBoshlang‘ich to‘lov: ${amount}\n\nEslatma: avtomatik yuborilmaydi. /installments_due orqali ko‘rasiz.`;
}

async function installmentsDueText() {
  const now = nowIso();
  const { data, error } = await supabase
    .from('installments')
    .select('id,chat_id,initial_amount,status,day5_at,day10_at,day14_at')
    .eq('status', 'active')
    .or(`day5_at.lte.${now},day10_at.lte.${now},day14_at.lte.${now}`)
    .limit(30);
  if (error) throw error;
  if (!data?.length) return '🧾 Hozircha eslatma muddati kelgan bo‘lib to‘lash yo‘q.';
  return '🧾 Eslatma muddati kelgan bo‘lib to‘lashlar\n\n' + data.map((x, i) => `${i + 1}. ID: ${x.id}\nChat ID: ${x.chat_id}\nBoshlang‘ich: ${x.initial_amount}\n5-kun: ${x.day5_at}\n10-kun: ${x.day10_at}\n14-kun: ${x.day14_at}`).join('\n\n');
}

// -------------------- Admin handlers --------------------

async function showMainMenu(chatId, edit = null) {
  const text = 'OLYE Business AI Bot v5 Lite\n\nBot vazifasi: yangi lidlarni biografik savollargacha olib kelish.\n\nKerakli bo‘limni tanlang:';
  if (edit?.messageId) {
    return editMessage(chatId, edit.messageId, text, { reply_markup: adminMenuKeyboard() });
  }
  return sendMessage(chatId, text, { reply_markup: adminMenuKeyboard() });
}

async function showHelp(chatId, edit = null) {
  const text = `⚙️ Yordam\n\nBuyruqlar:\n/menu — tugmali menyu\n/report — hisobot\n/stalled — chala lidlar\n/templates — shablonlar\n/gettemplate key — shablonni ko‘rish\n/settemplate key matn — shablonni o‘zgartirish\n/leadson chat_id — chatda botni yoqish\n/leadsoff chat_id — chatda botni o‘chirish\n/status chat_id — lid holati\n/discount_preview — chegirma preview\n/discount_confirm ID — tasdiqlab yuborish\n/discount_cancel ID — bekor qilish\n/installment chat_id amount — bo‘lib to‘lashni qayd qilish\n/installments_due — eslatma muddati kelganlar\n\nMuhim: mijozga AI erkin yozmaydi. Faqat shablondan javob chiqadi.`;
  if (edit?.messageId) {
    return editMessage(chatId, edit.messageId, text, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Menyu', callback_data: 'menu:main' }]] } });
  }
  return sendMessage(chatId, text);
}

async function showTemplates(chatId, edit = null) {
  const rows = await listTemplates().catch(() => []);
  const text = `✏️ Shablonlar\n\nKerakli shablonni tanlang.\n\nMavjud: ${rows.length || Object.keys(TEMPLATE_TITLES).length}`;
  if (edit?.messageId) {
    return editMessage(chatId, edit.messageId, text, { reply_markup: templateListKeyboard() });
  }
  return sendMessage(chatId, text, { reply_markup: templateListKeyboard() });
}

async function showTemplate(chatId, key, edit = null) {
  const tmpl = await getTemplate(key);
  const text = `✏️ ${TEMPLATE_TITLES[key] || key}\n\nKey: ${key}\n\n${tmpl?.body || 'Shablon topilmadi.'}`;
  if (edit?.messageId) {
    return editMessage(chatId, edit.messageId, text, { reply_markup: templateViewKeyboard(key) });
  }
  return sendMessage(chatId, text, { reply_markup: templateViewKeyboard(key) });
}

async function leadStatusText(chatId) {
  const lead = await getLead(chatId);
  if (!lead) return `Chat ID ${chatId} bo‘yicha lid topilmadi.`;
  return `📌 Lid status\n\nChat ID: ${lead.chat_id}\nIsm: ${lead.first_name || '-'}\nUsername: ${lead.username ? '@' + lead.username : '-'}\nStatus: ${lead.status}\nStage: ${lead.stage}\nBot enabled: ${lead.bot_enabled ? 'ha' : 'yo‘q'}\nOxirgi xabar: ${lead.last_user_message || '-'}`;
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

  if (!text.startsWith('/')) {
    return sendMessage(chatId, 'Buyruq yoki /menu yuboring.');
  }

  const { cmd, args } = parseCommand(text);

  if (cmd === '/start' || cmd === '/menu') return showMainMenu(chatId);
  if (cmd === '/help') return showHelp(chatId);
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

  if (cmd === '/report') {
    return sendMessage(chatId, await buildReportText());
  }

  if (cmd === '/stalled') {
    return sendMessage(chatId, await buildStalledText());
  }

  if (cmd === '/leadson') {
    const id = args.trim();
    if (!id) return sendMessage(chatId, 'Namuna: /leadson 123456789');
    await updateLead(id, { status: 'active', bot_enabled: true });
    return sendMessage(chatId, `✅ Bot yoqildi: ${id}`);
  }

  if (cmd === '/leadsoff') {
    const id = args.trim();
    if (!id) return sendMessage(chatId, 'Namuna: /leadsoff 123456789');
    await updateLead(id, { status: 'disabled', bot_enabled: false, stage: STAGE.DISABLED });
    return sendMessage(chatId, `🔕 Bot o‘chirildi: ${id}`);
  }

  if (cmd === '/status') {
    const id = args.trim();
    if (!id) return sendMessage(chatId, 'Namuna: /status 123456789');
    return sendMessage(chatId, await leadStatusText(id));
  }

  if (cmd === '/discount_preview') {
    const preview = await createDiscountPreview();
    return sendMessage(chatId, preview.text);
  }

  if (cmd === '/discount_confirm') {
    const id = args.trim();
    if (!id) return sendMessage(chatId, 'Namuna: /discount_confirm 1');
    const result = await confirmDiscount(id);
    return sendMessage(chatId, result.text);
  }

  if (cmd === '/discount_cancel') {
    const id = args.trim();
    if (!id) return sendMessage(chatId, 'Namuna: /discount_cancel 1');
    return sendMessage(chatId, await cancelDiscount(id));
  }

  if (cmd === '/installment') {
    const [leadChatId, amount] = args.split(/\s+/);
    if (!leadChatId || !amount) return sendMessage(chatId, 'Namuna: /installment 123456789 50000');
    return sendMessage(chatId, await createInstallment(leadChatId, amount));
  }

  if (cmd === '/installments_due') {
    return sendMessage(chatId, await installmentsDueText());
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
  if (data === 'menu:report') return editMessage(chatId, messageId, await buildReportText(), { reply_markup: { inline_keyboard: [[{ text: '⬅️ Menyu', callback_data: 'menu:main' }]] } });
  if (data === 'menu:stalled') return editMessage(chatId, messageId, await buildStalledText(), { reply_markup: { inline_keyboard: [[{ text: '⬅️ Menyu', callback_data: 'menu:main' }]] } });

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

  if (data.startsWith('lead:start:')) {
    const leadChatId = data.split(':')[2];
    const lead = await getLead(leadChatId);
    if (!lead) return sendMessage(chatId, `Lid topilmadi: ${leadChatId}`);
    if (!lead.business_connection_id) return sendMessage(chatId, `Bu chatda business_connection_id yo‘q. Oqimni boshlay olmadim: ${leadChatId}`);

    const activeLead = await updateLead(leadChatId, {
      status: 'active',
      bot_enabled: true,
      stage: STAGE.NEW
    }) || lead;

    await sendTemplateToLead({
      lead: { ...activeLead, status: 'active', bot_enabled: true, stage: STAGE.NEW },
      templateKey: 'ask_application',
      nextStage: STAGE.ASKED_APPLICATION
    });

    await logEvent(leadChatId, 'admin_started_flow', 'Admin approved first contact');
    return sendMessage(chatId, `✅ Oqim boshlandi: ${leadChatId}`);
  }

  if (data.startsWith('lead:off:')) {
    const leadChatId = data.split(':')[2];
    await updateLead(leadChatId, { status: 'disabled', bot_enabled: false, stage: STAGE.DISABLED, is_old_lead: true });
    return sendMessage(chatId, `🔕 Bot o‘chirildi: ${leadChatId}`);
  }

  if (data.startsWith('lead:on:')) {
    const leadChatId = data.split(':')[2];
    await updateLead(leadChatId, { status: 'active', bot_enabled: true });
    return sendMessage(chatId, `🔔 Bot yoqildi: ${leadChatId}`);
  }

  if (data.startsWith('lead:status:')) {
    const leadChatId = data.split(':')[2];
    return sendMessage(chatId, await leadStatusText(leadChatId));
  }

  if (data === 'discount:preview') {
    const preview = await createDiscountPreview();
    return editMessage(chatId, messageId, preview.text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Tasdiqlash', callback_data: `discount:confirm:${preview.action.id}` }],
          [{ text: '❌ Bekor qilish', callback_data: `discount:cancel:${preview.action.id}` }],
          [{ text: '⬅️ Menyu', callback_data: 'menu:main' }]
        ]
      }
    });
  }

  if (data.startsWith('discount:confirm:')) {
    const id = data.split(':')[2];
    const result = await confirmDiscount(id);
    return editMessage(chatId, messageId, result.text, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Menyu', callback_data: 'menu:main' }]] } });
  }

  if (data.startsWith('discount:cancel:')) {
    const id = data.split(':')[2];
    const text = await cancelDiscount(id);
    return editMessage(chatId, messageId, text, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Menyu', callback_data: 'menu:main' }]] } });
  }

  if (data === 'installments:due') {
    return editMessage(chatId, messageId, await installmentsDueText(), { reply_markup: { inline_keyboard: [[{ text: '⬅️ Menyu', callback_data: 'menu:main' }]] } });
  }
}

// -------------------- Express routes --------------------

app.get('/', (req, res) => {
  res.json({ ok: true, name: 'OLYE Business AI Bot v5 Lite', port: PORT });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, time: nowIso() });
});

app.post('/webhook', async (req, res) => {
  try {
    if (WEBHOOK_SECRET) {
      const got = req.headers['x-telegram-bot-api-secret-token'];
      if (got !== WEBHOOK_SECRET) {
        return res.status(401).json({ ok: false, error: 'bad secret' });
      }
    }

    const update = req.body;
    res.json({ ok: true });

    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return;
    }

    if (update.message) {
      if (isAdminMessage(update.message)) {
        await handleAdminText(update.message);
      }
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
