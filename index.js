const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const XLSX = require('xlsx');
const FormData = require('form-data');
const axios = require('axios');
const { DEFAULT_TEMPLATES } = require('./templates');

const app = express();
app.use(express.json({ limit: '12mb' }));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || '0');
const BUSINESS_OWNER_ID = String(process.env.BUSINESS_OWNER_ID || '0');
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || 'secret';
const AUTO_REPLY_ENABLED = String(process.env.AUTO_REPLY_ENABLED || 'true') === 'true';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || OPENAI_MODEL;
const DAILY_REPORT_HOUR = Number(process.env.DAILY_REPORT_HOUR || 21);
const TOTAL_AMOUNT = Number(process.env.TOTAL_AMOUNT || 100000);
const INITIAL_PAYMENT_AMOUNT = Number(process.env.INITIAL_PAYMENT_AMOUNT || 40000);
const TZ = process.env.TZ || 'Asia/Tashkent';

if (!BOT_TOKEN) console.warn('BOT_TOKEN is missing');

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const STAGE = {
  NEW: 'new',
  WAIT_APP: 'waiting_application_confirm',
  WAIT_INFO: 'waiting_info_confirm',
  INFO_KNOWN: 'info_known_sent',
  INFO_UNKNOWN: 'info_unknown_sent',
  OFFER_WAITING: 'offer_waiting',
  WAIT_ACCEPT: 'waiting_accept',
  QUESTIONS_SENT: 'biography_questions_sent',
  BIO_ANSWERS: 'bio_answers_received',
  PAYMENT_WAITING: 'payment_waiting',
  INSTALLMENT_REQUESTED: 'installment_requested',
  INSTALLMENT_TERMS_SENT: 'installment_terms_sent',
  TERMS_ACCEPTED: 'installment_terms_accepted',
  INITIAL_PAYMENT_WAITING: 'initial_payment_waiting',
  INITIAL_PAYMENT_PAID: 'initial_payment_paid',
  DAY5_WAITING: 'day5_40_waiting',
  DAY10_WAITING: 'day10_80_waiting',
  DAY14_WAITING: 'day14_100_waiting',
  PAID_FULL: 'paid_full',
  ARTICLE_WRITING: 'article_writing',
  ARTICLE_REVIEW: 'article_review',
  ARTICLE_NOT_CONFIRMED: 'article_not_confirmed',
  ARTICLE_CONFIRMED: 'article_confirmed',
  SITE_PUBLISHED: 'site_published',
  POST_PUBLISHED: 'post_published',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  DISCOUNT_SENT: 'discount_sent',
  DISCOUNT_RESPONDED: 'discount_responded',
  BLACKLIST: 'blacklist',
  MANUAL: 'manual'
};

const STAGE_LABELS = {
  new: 'Yangi lid',
  waiting_application_confirm: 'Ariza tasdig‘i kutilmoqda',
  waiting_info_confirm: 'Ma’lumot egasi yoki yo‘qligi kutilmoqda',
  info_known_sent: 'Qisqa ma’lumot yuborildi',
  info_unknown_sent: 'To‘liq ma’lumot yuborildi',
  offer_waiting: 'Oferta bilan tanishish kutilmoqda',
  waiting_accept: 'Maqola yozishga rozilik kutilmoqda',
  biography_questions_sent: 'Biografik savollar yuborildi',
  bio_answers_received: 'Savollarga javob keldi',
  payment_waiting: 'To‘lov kutilmoqda',
  installment_requested: '14 kunlik so‘radi',
  installment_terms_sent: '14 kunlik shart yuborildi',
  installment_terms_accepted: 'Rozilik yozdi',
  initial_payment_waiting: 'Boshlang‘ich to‘lov kutilmoqda',
  initial_payment_paid: 'Boshlang‘ich to‘lov to‘landi',
  day5_40_waiting: '5-kun 40% kutilmoqda',
  day10_80_waiting: '10-kun 80% kutilmoqda',
  day14_100_waiting: '14-kun 100% kutilmoqda',
  paid_full: 'To‘liq to‘landi',
  article_writing: 'Maqola yozilmoqda',
  article_review: 'Maqola tekshiruvda',
  article_not_confirmed: 'Maqola tasdiqlanmadi',
  article_confirmed: 'Maqola tasdiqlandi',
  site_published: 'Saytga joylandi',
  post_published: 'Instagram post chiqdi',
  completed: 'Yakunlandi',
  rejected: 'Rad etdi',
  discount_sent: 'Chegirma yuborildi',
  discount_responded: 'Chegirmadan qaytdi',
  blacklist: 'Blacklist',
  manual: 'Qo‘lda davom ettirilmoqda'
};

const TEMPLATE_GROUPS = {
  sales: 'Savdo',
  payment: 'To‘lov',
  reminder: 'Eslatma',
  discount: 'Chegirma',
  article: 'Maqola',
  system: 'Tizim'
};

function nowIso() { return new Date().toISOString(); }
function safeJson(x, fallback = {}) { try { return JSON.parse(x); } catch { return fallback; } }
function money(n) { return `${Number(n || 0).toLocaleString('uz-UZ')} so‘m`; }
function labelStage(stage) { return STAGE_LABELS[stage] || stage || 'Noma’lum'; }
function displayUser(lead = {}) {
  if (lead.username) return `@${lead.username}`;
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
  return name || lead.chat_id || 'Noma’lum';
}
function isAdminChat(chatId) { return ADMIN_CHAT_ID !== '0' && String(chatId) === ADMIN_CHAT_ID; }
function fmtDate(d) {
  if (!d) return '—';
  try { return new Intl.DateTimeFormat('uz-UZ', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(d)); }
  catch { return String(d); }
}

function normalize(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[’ʻ`´]/g, "'")
    .replace(/ў/g, "o'")
    .replace(/ғ/g, "g'")
    .replace(/қ/g, 'q')
    .replace(/ҳ/g, 'h')
    .replace(/ё/g, 'yo')
    .replace(/й/g, 'y')
    .replace(/ц/g, 's')
    .replace(/у/g, 'u')
    .replace(/к/g, 'k')
    .replace(/е/g, 'e')
    .replace(/н/g, 'n')
    .replace(/г/g, 'g')
    .replace(/ш/g, 'sh')
    .replace(/з/g, 'z')
    .replace(/х/g, 'x')
    .replace(/ъ/g, '')
    .replace(/ф/g, 'f')
    .replace(/ы/g, 'i')
    .replace(/в/g, 'v')
    .replace(/а/g, 'a')
    .replace(/п/g, 'p')
    .replace(/р/g, 'r')
    .replace(/о/g, 'o')
    .replace(/л/g, 'l')
    .replace(/д/g, 'd')
    .replace(/ж/g, 'j')
    .replace(/э/g, 'e')
    .replace(/я/g, 'ya')
    .replace(/ч/g, 'ch')
    .replace(/с/g, 's')
    .replace(/м/g, 'm')
    .replace(/и/g, 'i')
    .replace(/т/g, 't')
    .replace(/ь/g, '')
    .replace(/б/g, 'b')
    .replace(/ю/g, 'yu')
    .replace(/[^a-z0-9'\s%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function includesAny(text, words) { return words.some(w => text.includes(normalize(w))); }
function isYes(text) {
  const t = normalize(text);
  if (!t) return false;
  if (['ha', 'xa', 'haa', 'xaaa', 'hop', "ho'p", 'albatta', 'mayli', 'ok', 'tushunarli'].includes(t)) return true;
  return includesAny(t, ['ha shunday', 'xa shunday', 'qoldirganman', 'qoldirgandim', 'qoldirgan edim', 'ariza qoldirgan', 'shunaqa', 'togri', "to'g'ri", 'roziman', 'maqul', "ma'qul", 'yaxshi', 'boladi', "bo'ladi", 'qiling', 'yozing', 'kiriting', 'davom etaman']);
}
function isNo(text) {
  const t = normalize(text);
  if (!t) return false;
  if (["yo'q", 'yoq', 'yog', 'yuq', 'no'].includes(t)) return true;
  return includesAny(t, ["yo'q", 'yoq', 'yog', 'yuq', 'kerak emas', 'qiziqmadim', 'istamayman', 'xohlamayman', 'rad']);
}
function isGreetingOrPositiveStart(text) {
  const t = normalize(text);
  return includesAny(t, ['assalomu', 'asalomu', 'salom', 'alaykum', 'valaykum', 'va alaykum', 'yaxshiman', 'ha yaxshi', 'xa yaxshi', 'rahmat yaxshi', 'raxmat yaxshi']) || isYes(t);
}
function isPrice(text) { return includesAny(normalize(text), ['pullik', 'pul', 'narx', 'narxi', 'qancha', 'tolov', "to'lov", 'badal', '100', 'necha som', "necha so'm", 'karta', 'kartaga']); }
function isInstallment(text) { return includesAny(normalize(text), ['14 kun', "bo'lib", 'bolib', 'bo lib', 'qismga', 'qism qism', 'boshlangich', 'muddatli']); }
function isDiscount(text) { return includesAny(normalize(text), ['chegirma', 'skidka', 'discount', '%']); }
function isReadConfirmed(text) { return includesAny(normalize(text), ['tanishdim', 'oqidim', "o'qidim", 'tanishib chiqdim', 'korib chiqdim', "ko'rib chiqdim", 'tushundim', 'oferta bilan tanishdim']); }
function isAckOnly(text) { return ['hop', "ho'p", 'mayli', 'ok', 'xo p', 'xop', 'boladi', "bo'ladi", 'tushunarli'].includes(normalize(text)); }
function wantsQuestions(text) { return includesAny(normalize(text), ['savollar', 'savol', 'anketa', 'yubor', 'jonating', "jo'nating"]); }
function isHotIntent(text) { return includesAny(normalize(text), ['karta tashlang', 'tolov qilaman', "to'lov qilaman", 'qanday tolayman', 'qanday to layman', 'karta', 'men roziman', 'davom etaman', 'maqola qachon chiqadi']); }
function isConsent(text) { return normalize(text) === normalize('MEN YAKUNIY SHARTLARGA ROZIMAN'); }
function looksLikeBioAnswers(text) {
  const s = String(text || '');
  const numbered = (s.match(/(^|\n)\s*\d{1,2}[).]/g) || []).length;
  return numbered >= 3 || s.length > 350;
}

async function tg(method, payload) {
  const res = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) console.error('Telegram error', method, data);
  return data;
}
async function tgFile(method, form) {
  try {
    const res = await axios.post(`${TG_API}/${method}`, form, { headers: form.getHeaders() });
    if (!res.data?.ok) console.error('Telegram file error', method, res.data);
    return res.data;
  } catch (e) {
    console.error('Telegram file exception', method, e.response?.data || e.message);
    return { ok: false };
  }
}
function splitMessage(text, maxLen = 3900) {
  const parts = [];
  let s = String(text || '');
  while (s.length > maxLen) {
    let cut = s.lastIndexOf('\n', maxLen);
    if (cut < 500) cut = maxLen;
    parts.push(s.slice(0, cut));
    s = s.slice(cut).trimStart();
  }
  if (s.trim()) parts.push(s);
  return parts;
}
async function sendBotMessage(chatId, text, opts = {}) {
  if (!chatId || !text) return;
  const chunks = splitMessage(text);
  let last;
  for (const chunk of chunks) last = await tg('sendMessage', { chat_id: chatId, text: chunk, ...opts });
  return last;
}
async function editBotMessage(chatId, messageId, text, opts = {}) {
  if (!chatId || !messageId) return sendBotMessage(chatId, text, opts);
  const payload = { chat_id: chatId, message_id: messageId, text, ...opts };
  const data = await tg('editMessageText', payload);
  if (!data.ok) return sendBotMessage(chatId, text, opts);
  return data;
}
async function answerCallback(id, text = '') { return tg('answerCallbackQuery', { callback_query_id: id, text, show_alert: false }); }
async function sendBusinessMessage(businessConnectionId, chatId, text) {
  if (!businessConnectionId || !chatId || !text) return;
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    await tg('sendMessage', { business_connection_id: businessConnectionId, chat_id: chatId, text: chunk });
  }
}
async function sendBusinessPhotoText(businessConnectionId, chatId, text) { return sendBusinessMessage(businessConnectionId, chatId, text); }

function inline(rows) { return { reply_markup: { inline_keyboard: rows } }; }
function btn(text, data) { return { text, callback_data: data }; }
function adminKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '📊 Hisobot' }, { text: '👥 Lidlar' }],
        [{ text: '💰 To‘lovlar' }, { text: '⏰ Eslatmalar' }],
        [{ text: '📝 Shablonlar' }, { text: '🧩 Ssenariy qurish' }],
        [{ text: '💳 Chek tekshirish' }, { text: '📋 Maqola jarayoni' }],
        [{ text: '⚠️ Chala qolganlar' }, { text: '📥 Excel' }],
        [{ text: '⚙️ Sozlamalar' }]
      ],
      resize_keyboard: true
    }
  };
}

async function db(table) {
  if (!supabase) throw new Error('Supabase ulanmagan');
  return supabase.from(table);
}
async function logEvent(chatId, event_type, detail = {}) {
  if (!supabase) return;
  const { error } = await supabase.from('events').insert({ chat_id: chatId ? String(chatId) : null, event_type, detail });
  if (error) console.error('event error', error.message);
}
async function getSetting(key, fallback) {
  if (!supabase) return fallback;
  const { data, error } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
  if (error || data?.value === undefined) return fallback;
  return data.value;
}
async function setSetting(key, value) {
  if (!supabase) return false;
  const { error } = await supabase.from('settings').upsert({ key, value, updated_at: nowIso() }, { onConflict: 'key' });
  if (error) console.error('setting error', error.message);
  return !error;
}
async function getTemplate(key) {
  if (!key) return '';
  if (supabase) {
    const { data, error } = await supabase.from('reply_templates').select('body').eq('key', key).maybeSingle();
    if (!error && data?.body !== undefined) return data.body;
  }
  return DEFAULT_TEMPLATES[key]?.body || '';
}
async function getTemplateMeta(key) {
  const def = DEFAULT_TEMPLATES[key] || { title: key, category: 'general', body: '' };
  if (!supabase) return { key, ...def };
  const { data } = await supabase.from('reply_templates').select('*').eq('key', key).maybeSingle();
  return { key, title: data?.title || def.title || key, category: data?.category || def.category || 'general', body: data?.body ?? def.body ?? '' };
}
async function setTemplate(key, body) {
  if (!supabase) return false;
  const def = DEFAULT_TEMPLATES[key] || { title: key, category: 'custom' };
  const { error } = await supabase.from('reply_templates').upsert({ key, title: def.title || key, category: def.category || 'custom', body, updated_at: nowIso() }, { onConflict: 'key' });
  if (error) console.error('setTemplate error', error);
  return !error;
}
async function ensureDefaultTemplates() {
  if (!supabase) return;
  for (const [key, obj] of Object.entries(DEFAULT_TEMPLATES)) {
    const { data, error } = await supabase.from('reply_templates').select('key').eq('key', key).maybeSingle();
    if (error) { console.error('template check error', error.message); return; }
    if (!data) {
      await supabase.from('reply_templates').insert({ key, title: obj.title, category: obj.category, body: obj.body, updated_at: nowIso() });
    } else {
      await supabase.from('reply_templates').update({ title: obj.title, category: obj.category }).eq('key', key);
    }
  }
}
async function getLead(chatId) {
  const id = String(chatId);
  if (!supabase) return { chat_id: id, stage: STAGE.NEW, bot_enabled: true, final_stopped: false, is_blacklisted: false, total_amount: TOTAL_AMOUNT, paid_amount: 0 };
  const { data, error } = await supabase.from('leads').select('*').eq('chat_id', id).maybeSingle();
  if (error) console.error('getLead error', error.message);
  return data || { chat_id: id, stage: STAGE.NEW, bot_enabled: true, final_stopped: false, is_blacklisted: false, total_amount: TOTAL_AMOUNT, paid_amount: 0, payment_plan: 'none', payment_status: 'unpaid' };
}
async function saveLead(partial) {
  if (!supabase) return;
  const row = { ...partial, chat_id: String(partial.chat_id), updated_at: nowIso() };
  const { error } = await supabase.from('leads').upsert(row, { onConflict: 'chat_id' });
  if (error) console.error('saveLead error', error.message, row);
}
async function updateLead(chatId, partial) { return saveLead({ chat_id: String(chatId), ...partial }); }
async function listLeads(filter = {}, limit = 20) {
  if (!supabase) return [];
  let q = supabase.from('leads').select('*').order('updated_at', { ascending: false }).limit(limit);
  if (filter.stage) q = q.eq('stage', filter.stage);
  if (filter.bot_enabled !== undefined) q = q.eq('bot_enabled', filter.bot_enabled);
  if (filter.is_hot !== undefined) q = q.eq('is_hot', filter.is_hot);
  if (filter.is_blacklisted !== undefined) q = q.eq('is_blacklisted', filter.is_blacklisted);
  if (filter.payment_plan) q = q.eq('payment_plan', filter.payment_plan);
  const { data, error } = await q;
  if (error) { console.error('listLeads error', error.message); return []; }
  return data || [];
}
async function getSession(adminChatId) {
  if (!supabase) return null;
  const { data } = await supabase.from('admin_sessions').select('*').eq('admin_chat_id', String(adminChatId)).maybeSingle();
  return data;
}
async function setSession(adminChatId, mode, payload = {}) {
  if (!supabase) return;
  await supabase.from('admin_sessions').upsert({ admin_chat_id: String(adminChatId), mode, payload, updated_at: nowIso() }, { onConflict: 'admin_chat_id' });
}
async function clearSession(adminChatId) {
  if (!supabase) return;
  await supabase.from('admin_sessions').delete().eq('admin_chat_id', String(adminChatId));
}

async function classifyWithAI(stage, text) {
  if (!openai) return 'unknown';
  try {
    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      max_tokens: 12,
      messages: [
        { role: 'system', content: 'Classify Uzbek Telegram sales message. Return only one label: greeting, yes, no, price, installment, read_confirmed, ack, wants_questions, discount, hot, unknown.' },
        { role: 'user', content: `Stage: ${stage}\nMessage: ${text}` }
      ]
    });
    const label = normalize(resp.choices?.[0]?.message?.content || '').split(' ')[0];
    const allowed = ['greeting', 'yes', 'no', 'price', 'installment', 'read_confirmed', 'ack', 'wants_questions', 'discount', 'hot', 'unknown'];
    return allowed.includes(label) ? label : 'unknown';
  } catch (e) {
    console.error('AI classify error', e.message);
    return 'unknown';
  }
}
async function classify(stage, text) {
  if (isConsent(text)) return 'consent';
  if (isInstallment(text)) return 'installment';
  if (isPrice(text)) return 'price';
  if (isDiscount(text)) return 'discount';
  if (isHotIntent(text)) return 'hot';
  if (isReadConfirmed(text)) return 'read_confirmed';
  if (wantsQuestions(text)) return 'wants_questions';
  if (isAckOnly(text)) return 'ack';
  if (isNo(text)) return 'no';
  if (isGreetingOrPositiveStart(text)) return 'greeting_or_yes';
  if (isYes(text)) return 'yes';
  const ai = await classifyWithAI(stage, text);
  if (ai === 'greeting') return 'greeting_or_yes';
  return ai;
}

async function sendTemplateToBusiness(lead, key, replacements = {}, newStage = null, opts = {}) {
  let body = await getTemplate(key);
  for (const [k, v] of Object.entries(replacements)) body = body.replaceAll(`{${k}}`, String(v));
  if (!body) return;
  await sendBusinessMessage(lead.business_connection_id, lead.chat_id, body);
  const patch = { last_template: key, last_message: body };
  if (newStage) patch.stage = newStage;
  if (opts.final_stopped !== undefined) patch.final_stopped = opts.final_stopped;
  if (opts.bot_enabled !== undefined) patch.bot_enabled = opts.bot_enabled;
  await updateLead(lead.chat_id, patch);
  await logEvent(lead.chat_id, 'template_sent', { key, newStage, opts });
}

async function loadCustomScenarios(stage) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('custom_scenarios').select('*').eq('is_active', true).eq('trigger_stage', stage).order('id', { ascending: true });
  if (error) { console.error('scenario load error', error.message); return []; }
  return data || [];
}
async function runCustomScenarioIfAny(lead, text) {
  const scenarios = await loadCustomScenarios(lead.stage || STAGE.NEW);
  const t = normalize(text);
  for (const sc of scenarios) {
    if (sc.keyword && !t.includes(normalize(sc.keyword))) continue;
    const message = sc.template_key ? await getTemplate(sc.template_key) : sc.message;
    if (message) await sendBusinessMessage(lead.business_connection_id, lead.chat_id, message);
    await updateLead(lead.chat_id, {
      stage: sc.next_stage || lead.stage,
      bot_enabled: sc.stop_after ? false : lead.bot_enabled,
      final_stopped: sc.stop_after ? true : lead.final_stopped,
      last_template: sc.template_key || `scenario_${sc.id}`,
      last_message: message || ''
    });
    await logEvent(lead.chat_id, 'custom_scenario_run', { id: sc.id, name: sc.name });
    return true;
  }
  return false;
}

async function adminNotifyNewLead(lead, text) {
  if (!ADMIN_CHAT_ID || ADMIN_CHAT_ID === '0') return;
  const msg = `🆕 Yangi lid\n\nIsm: ${displayUser(lead)}\nUsername: ${lead.username ? '@' + lead.username : '—'}\nChat ID: ${lead.chat_id}\nStatus: ${labelStage(lead.stage)}\n\nXabar: ${text || '—'}`;
  await sendBotMessage(ADMIN_CHAT_ID, msg, inline([
    [btn('🤖 Bot boshlasin', `lead_start:${lead.chat_id}`), btn('⏸ Boshlamasin', `lead_off:${lead.chat_id}`)],
    [btn('👤 O‘zim yozaman', `lead_manual:${lead.chat_id}`), btn('🚫 Blacklist', `lead_blacklist:${lead.chat_id}`)],
    [btn('👁 Kartani ochish', `lead_view:${lead.chat_id}`)]
  ]));
}
async function adminNotifyOldLead(lead, text) {
  if (!ADMIN_CHAT_ID || ADMIN_CHAT_ID === '0') return;
  const last = lead.last_admin_notified_at ? new Date(lead.last_admin_notified_at).getTime() : 0;
  if (Date.now() - last < 1000 * 60 * 15) return;
  await updateLead(lead.chat_id, { last_admin_notified_at: nowIso() });
  await sendBotMessage(ADMIN_CHAT_ID, `🔔 Eski nomzod qayta yozdi\n\n${displayUser(lead)}\nStatus: ${labelStage(lead.stage)}\nBot: ${lead.bot_enabled ? 'yoqilgan' : 'o‘chirilgan'}\n\nXabar: ${text || '—'}`, inline([
    [btn('👤 O‘zim javob beraman', `lead_manual:${lead.chat_id}`), btn('🤖 Botni yoqish', `lead_on:${lead.chat_id}`)],
    [btn('📩 To‘lov eslatmasi', `lead_payment_remind:${lead.chat_id}`), btn('👁 Kartani ochish', `lead_view:${lead.chat_id}`)]
  ]));
}
async function adminNotifyHotLead(lead, text) {
  await updateLead(lead.chat_id, { is_hot: true });
  if (!ADMIN_CHAT_ID || ADMIN_CHAT_ID === '0') return;
  await sendBotMessage(ADMIN_CHAT_ID, `🔥 Issiq lid\n\n${displayUser(lead)} to‘lovga yaqin bo‘lishi mumkin.\nStatus: ${labelStage(lead.stage)}\n\nXabar: ${text}`, inline([
    [btn('💳 To‘lov ma’lumotini yuborish', `send_price:${lead.chat_id}`), btn('📆 14 kunlik', `send_installment:${lead.chat_id}`)],
    [btn('👤 O‘zim yozaman', `lead_manual:${lead.chat_id}`), btn('👁 Kartani ochish', `lead_view:${lead.chat_id}`)]
  ]));
}
async function adminNotifyBioAnswers(lead, text) {
  if (!ADMIN_CHAT_ID || ADMIN_CHAT_ID === '0') return;
  await sendBotMessage(ADMIN_CHAT_ID, `📋 Biografik savollarga javob keldi\n\n${displayUser(lead)}\nChat ID: ${lead.chat_id}\n\nBot javob bermadi, siz davom ettirasiz.`, inline([
    [btn('💰 To‘lovga o‘tkazish', `lead_payment_wait:${lead.chat_id}`), btn('📆 14 kunlik kelishuv', `send_installment:${lead.chat_id}`)],
    [btn('📄 Hujjat so‘rash', `send_passport:${lead.chat_id}`), btn('👁 Kartani ochish', `lead_view:${lead.chat_id}`)]
  ]));
}

async function createInstallmentReminders(chatId) {
  if (!supabase) return;
  const base = new Date();
  const plans = [
    { type: '5d_40', days: 5, template_key: 'reminder_5d' },
    { type: '10d_80', days: 10, template_key: 'reminder_10d' },
    { type: '14d_100', days: 14, template_key: 'reminder_14d' }
  ];
  for (const p of plans) {
    const due = new Date(base.getTime() + p.days * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('reminders').insert({ chat_id: String(chatId), type: p.type, due_at: due, template_key: p.template_key, status: 'pending_admin' });
  }
}

async function handleSalesFlow(lead, msg, text) {
  const stage = lead.stage || STAGE.NEW;
  const label = await classify(stage, text);

  if (label === 'hot') await adminNotifyHotLead(lead, text);

  if (label === 'consent') {
    await supabase?.from('consents').insert({ chat_id: lead.chat_id, consent_text: text, payment_plan: 'installment14' });
    await updateLead(lead.chat_id, { stage: STAGE.INITIAL_PAYMENT_WAITING, payment_plan: 'installment14', terms_accepted_at: nowIso(), bot_enabled: true });
    await createInstallmentReminders(lead.chat_id);
    await sendTemplateToBusiness({ ...lead, stage }, 'consent_accepted_reply', {}, STAGE.INITIAL_PAYMENT_WAITING);
    await sendBotMessage(ADMIN_CHAT_ID, `✅ 14 kunlik rozilik qabul qilindi\n\n${displayUser(lead)}\nStatus: Boshlang‘ich to‘lov kutilmoqda`, inline([[btn('👁 Kartani ochish', `lead_view:${lead.chat_id}`)]]));
    return;
  }

  if (label === 'discount' && [STAGE.BIO_ANSWERS, STAGE.PAYMENT_WAITING, STAGE.DISCOUNT_SENT].includes(stage)) {
    await adminNotifyHotLead(lead, text);
    return;
  }

  if (label === 'installment') {
    await updateLead(lead.chat_id, { stage: STAGE.INSTALLMENT_TERMS_SENT, payment_plan: 'installment14' });
    await sendTemplateToBusiness(lead, 'installment_terms', {}, STAGE.INSTALLMENT_TERMS_SENT);
    return;
  }

  if (label === 'price') {
    await sendTemplateToBusiness(lead, 'price_info', {}, stage);
    return;
  }

  if (await runCustomScenarioIfAny(lead, text)) return;

  if (stage === STAGE.NEW) {
    if (label === 'greeting_or_yes' || label === 'yes') {
      await sendTemplateToBusiness(lead, 'start_application_check', {}, STAGE.WAIT_APP);
      return;
    }
    return;
  }

  if (stage === STAGE.WAIT_APP) {
    if (label === 'yes' || label === 'greeting_or_yes') {
      await sendTemplateToBusiness(lead, 'application_yes', {}, STAGE.WAIT_INFO);
      return;
    }
    if (label === 'no') {
      await sendTemplateToBusiness(lead, 'decline', {}, STAGE.REJECTED, { final_stopped: true, bot_enabled: false });
      return;
    }
    return;
  }

  if (stage === STAGE.WAIT_INFO) {
    if (label === 'yes' || label === 'greeting_or_yes') {
      await sendTemplateToBusiness(lead, 'info_for_known_user', {}, STAGE.OFFER_WAITING);
      return;
    }
    if (label === 'no') {
      await sendTemplateToBusiness(lead, 'info_for_unknown_user', {}, STAGE.OFFER_WAITING);
      return;
    }
    return;
  }

  if (stage === STAGE.OFFER_WAITING || stage === STAGE.INFO_KNOWN || stage === STAGE.INFO_UNKNOWN) {
    if (label === 'ack') return;
    if (label === 'read_confirmed') {
      await sendTemplateToBusiness(lead, 'ask_acceptable', {}, STAGE.WAIT_ACCEPT);
      return;
    }
    if (label === 'no') {
      await sendTemplateToBusiness(lead, 'decline', {}, STAGE.REJECTED, { final_stopped: true, bot_enabled: false });
      return;
    }
    return;
  }

  if (stage === STAGE.WAIT_ACCEPT) {
    if (label === 'yes' || label === 'greeting_or_yes' || label === 'wants_questions') {
      await sendTemplateToBusiness(lead, 'biography_questions', {}, STAGE.QUESTIONS_SENT);
      await updateLead(lead.chat_id, { final_stopped: false, bot_enabled: true, article_status: 'questions_waiting' });
      return;
    }
    if (label === 'no') {
      await sendTemplateToBusiness(lead, 'decline', {}, STAGE.REJECTED, { final_stopped: true, bot_enabled: false });
      return;
    }
    return;
  }

  if (stage === STAGE.QUESTIONS_SENT) {
    if (looksLikeBioAnswers(text)) {
      await updateLead(lead.chat_id, { stage: STAGE.BIO_ANSWERS, article_status: 'answers_received', bot_enabled: false, final_stopped: false });
      await adminNotifyBioAnswers({ ...lead, stage: STAGE.BIO_ANSWERS }, text);
    } else {
      await adminNotifyOldLead(lead, text);
    }
    return;
  }

  if ([STAGE.BIO_ANSWERS, STAGE.PAYMENT_WAITING, STAGE.MANUAL, STAGE.COMPLETED, STAGE.REJECTED, STAGE.PAID_FULL].includes(stage)) {
    await adminNotifyOldLead(lead, text);
    return;
  }
}

function extractBusinessMessage(update) {
  if (update.business_message) return update.business_message;
  if (update.edited_business_message) return update.edited_business_message;
  return null;
}
function getMessageText(msg) {
  return msg.text || msg.caption || '';
}
function getUserFromMsg(msg) {
  return msg.from || msg.sender_chat || {};
}
function getBestPhoto(msg) {
  if (Array.isArray(msg.photo) && msg.photo.length) return msg.photo[msg.photo.length - 1];
  if (msg.document && String(msg.document.mime_type || '').startsWith('image/')) return msg.document;
  return null;
}
async function upsertLeadFromBusinessMessage(msg) {
  const chatId = String(msg.chat?.id);
  const from = getUserFromMsg(msg);
  const old = await getLead(chatId);
  const isNew = !old.created_at;
  const patch = {
    chat_id: chatId,
    business_connection_id: msg.business_connection_id,
    username: from.username || old.username || null,
    first_name: from.first_name || old.first_name || null,
    last_name: from.last_name || old.last_name || null,
    total_amount: old.total_amount || TOTAL_AMOUNT,
    last_customer_message: getMessageText(msg) || old.last_customer_message || null,
    last_customer_message_at: nowIso()
  };
  if (!old.stage) patch.stage = STAGE.NEW;
  await saveLead({ ...old, ...patch });
  return { ...old, ...patch, isFresh: old.stage ? false : true };
}

async function analyzeReceiptImage(fileId) {
  const result = { amount: null, currency: null, transaction_id: null, receiver: null, date: null, confidence: 0, risk: 'unknown', notes: 'AI ulanmagan yoki rasm o‘qilmadi.' };
  if (!openai || !fileId) return result;
  try {
    const gf = await tg('getFile', { file_id: fileId });
    const path = gf?.result?.file_path;
    if (!path) return result;
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${path}`;
    const imgRes = await fetch(fileUrl);
    const arrayBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mime = path.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const resp = await openai.chat.completions.create({
      model: OPENAI_VISION_MODEL,
      temperature: 0,
      max_tokens: 500,
      messages: [
        { role: 'system', content: 'You read Uzbek bank/payment receipt screenshots. Return ONLY valid JSON. Extract amount in UZS integer, currency, date, receiver, transaction_id, card_last4 if visible, confidence 0..1, risk low/medium/high, reasons array. Do not invent.' },
        { role: 'user', content: [
          { type: 'text', text: 'Analyze this receipt image and return JSON only.' },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } }
        ] }
      ]
    });
    const raw = resp.choices?.[0]?.message?.content || '{}';
    return safeJson(raw.replace(/^```json/i, '').replace(/```$/i, '').trim(), result);
  } catch (e) {
    console.error('receipt AI error', e.message);
    return result;
  }
}

async function handleReceipt(lead, msg) {
  const photo = getBestPhoto(msg);
  if (!photo) return false;
  await sendTemplateToBusiness(lead, 'payment_received_hold', {}, lead.stage || STAGE.PAYMENT_WAITING);
  const fileId = photo.file_id;
  const fileUniqueId = photo.file_unique_id;
  let duplicate = null;
  if (supabase && fileUniqueId) {
    const { data } = await supabase.from('receipts').select('*').eq('file_unique_id', fileUniqueId).maybeSingle();
    duplicate = data;
  }
  const ai = await analyzeReceiptImage(fileId);
  const amount = Number(ai.amount || 0) || null;
  const txid = ai.transaction_id || ai.transactionId || null;
  if (supabase && txid) {
    const { data } = await supabase.from('receipts').select('*').eq('transaction_id', txid).maybeSingle();
    if (data) duplicate = data;
  }
  let receipt = null;
  if (supabase) {
    const { data, error } = await supabase.from('receipts').insert({
      chat_id: lead.chat_id,
      file_id: fileId,
      file_unique_id: fileUniqueId,
      ai_json: ai,
      amount,
      currency: ai.currency || 'UZS',
      transaction_id: txid,
      risk: duplicate ? 'high' : (ai.risk || 'unknown'),
      confidence: ai.confidence || null,
      status: 'pending'
    }).select('*').single();
    if (error) console.error('receipt insert error', error.message);
    receipt = data;
  }
  if (ADMIN_CHAT_ID !== '0') {
    const risk = duplicate ? 'high — oldin ishlatilgan bo‘lishi mumkin' : (ai.risk || 'unknown');
    const text = `💳 Chek tahlil qilindi\n\nNomzod: ${displayUser(lead)}\nChat ID: ${lead.chat_id}\nSumma: ${amount ? money(amount) : 'aniqlanmadi'}\nSana: ${ai.date || '—'}\nQabul qiluvchi: ${ai.receiver || '—'}\nTranzaksiya ID: ${txid || '—'}\nAI ishonchi: ${ai.confidence ?? '—'}\nRisk: ${risk}\n\nOxirgi tasdiq siz tomondan bo‘ladi.`;
    const rid = receipt?.id || 0;
    await sendBotMessage(ADMIN_CHAT_ID, text, inline([
      [btn('✅ 40 000', `receipt_confirm:${rid}:40000`), btn('✅ 80 000', `receipt_confirm:${rid}:80000`), btn('✅ 100 000', `receipt_confirm:${rid}:100000`)],
      [btn('✍️ Boshqa summa', `receipt_other:${rid}`), btn('❌ Rad etish', `receipt_reject:${rid}`)],
      [btn('👁 Lid kartasi', `lead_view:${lead.chat_id}`)]
    ]));
  }
  return true;
}

async function handleBusinessMessage(update) {
  const msg = extractBusinessMessage(update);
  if (!msg?.chat?.id) return;
  if (String(msg.from?.id || '') === BUSINESS_OWNER_ID) {
    await updateLead(msg.chat.id, { stage: STAGE.MANUAL, bot_enabled: false });
    return;
  }
  const lead = await upsertLeadFromBusinessMessage(msg);
  const text = getMessageText(msg);

  if (!lead.created_at && ADMIN_CHAT_ID !== '0') await adminNotifyNewLead(lead, text);

  if (lead.is_blacklisted || lead.stage === STAGE.BLACKLIST) return;
  if (!AUTO_REPLY_ENABLED) return;

  const photo = getBestPhoto(msg);
  if (photo) {
    const done = await handleReceipt(lead, msg);
    if (done) return;
  }

  if (!text) return;

  if (!lead.bot_enabled && lead.stage !== STAGE.NEW) {
    await adminNotifyOldLead(lead, text);
    return;
  }
  if (lead.final_stopped && lead.stage !== STAGE.QUESTIONS_SENT) {
    await adminNotifyOldLead(lead, text);
    return;
  }

  await handleSalesFlow(lead, msg, text);
}

async function getCounts() {
  if (!supabase) return {};
  const { data } = await supabase.from('leads').select('stage,payment_plan,payment_status,paid_amount,created_at,updated_at,is_hot,is_blacklisted');
  const rows = data || [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayRows = rows.filter(r => new Date(r.created_at || r.updated_at) >= today);
  const sum = arr => arr.reduce((a, r) => a + Number(r.paid_amount || 0), 0);
  return {
    total: rows.length,
    today: todayRows.length,
    hot: rows.filter(r => r.is_hot).length,
    blacklist: rows.filter(r => r.is_blacklisted || r.stage === STAGE.BLACKLIST).length,
    questions: rows.filter(r => r.stage === STAGE.QUESTIONS_SENT || r.stage === STAGE.BIO_ANSWERS).length,
    sales: rows.filter(r => ['paid_full', 'initial_payment_paid', 'day5_40_waiting', 'day10_80_waiting', 'day14_100_waiting'].includes(r.stage)).length,
    installments: rows.filter(r => r.payment_plan === 'installment14').length,
    paidFull: rows.filter(r => r.payment_status === 'paid_full' || r.stage === STAGE.PAID_FULL).length,
    incomeToday: sum(todayRows),
    incomeTotal: sum(rows)
  };
}
async function showMainMenu(chatId) {
  const counts = await getCounts();
  const text = `OLYE Business AI CRM Bot v5\n\n📊 Bugun yangi lidlar: ${counts.today || 0}\n👥 Jami lidlar: ${counts.total || 0}\n🔥 Issiq lidlar: ${counts.hot || 0}\n💰 Jami tasdiqlangan tushum: ${money(counts.incomeTotal || 0)}\n\nQuyidagi menyudan tanlang.`;
  return sendBotMessage(chatId, text, { ...adminKeyboard(), ...inline([[btn('📊 Hisobot', 'menu_report'), btn('👥 Lidlar', 'menu_leads')], [btn('💰 To‘lovlar', 'menu_payments'), btn('⏰ Eslatmalar', 'menu_reminders')], [btn('📝 Shablonlar', 'menu_templates'), btn('🧩 Ssenariy qurish', 'menu_scenarios')], [btn('💳 Chek tekshirish', 'menu_receipts'), btn('⚠️ Chala qolganlar', 'menu_stalled')], [btn('📋 Maqola jarayoni', 'menu_articles'), btn('📥 Excel', 'export_excel')], [btn('⚙️ Sozlamalar', 'menu_settings')]]) });
}
async function showReport(chatId, messageId = null) {
  const c = await getCounts();
  const text = `📊 Hisobot\n\nBugungi yangi lidlar: ${c.today || 0}\nJami lidlar: ${c.total || 0}\n🔥 Issiq lidlar: ${c.hot || 0}\n📋 Savollar bosqichida: ${c.questions || 0}\n💰 Sotuv/to‘lov bosqichi: ${c.sales || 0}\n📆 14 kunliklar: ${c.installments || 0}\n✅ To‘liq to‘laganlar: ${c.paidFull || 0}\n🚫 Blacklist: ${c.blacklist || 0}\n\nJami tasdiqlangan tushum: ${money(c.incomeTotal || 0)}`;
  const opts = inline([[btn('🔥 Issiq lidlar', 'leads_filter:hot'), btn('⚠️ Chala qolganlar', 'menu_stalled')], [btn('📆 14 kunliklar', 'leads_filter:installment'), btn('🔙 Menyu', 'menu_home')]]);
  return messageId ? editBotMessage(chatId, messageId, text, opts) : sendBotMessage(chatId, text, opts);
}
async function showLeadList(chatId, filterName = 'all', page = 0, messageId = null) {
  let rows = [];
  if (filterName === 'hot') rows = await listLeads({ is_hot: true }, 15);
  else if (filterName === 'installment') rows = await listLeads({ payment_plan: 'installment14' }, 15);
  else if (filterName === 'blacklist') rows = await listLeads({ is_blacklisted: true }, 15);
  else if (filterName.startsWith('stage_')) rows = await listLeads({ stage: filterName.slice(6) }, 15);
  else rows = await listLeads({}, 15);
  const text = `👥 Lidlar (${filterName})\n\n` + (rows.length ? rows.map((r, i) => `${i + 1}. ${displayUser(r)} — ${labelStage(r.stage)} — ${r.bot_enabled ? '🤖' : '⏸'}`).join('\n') : 'Lid topilmadi.');
  const kb = rows.map(r => [btn(`${displayUser(r)} — ${labelStage(r.stage)}`.slice(0, 55), `lead_view:${r.chat_id}`)]);
  kb.push([btn('🔥 Issiq', 'leads_filter:hot'), btn('📆 14 kunlik', 'leads_filter:installment')]);
  kb.push([btn('📋 Savollar', `leads_filter:stage_${STAGE.QUESTIONS_SENT}`), btn('💰 To‘lov kutilyapti', `leads_filter:stage_${STAGE.PAYMENT_WAITING}`)]);
  kb.push([btn('🔙 Menyu', 'menu_home')]);
  const opts = inline(kb);
  return messageId ? editBotMessage(chatId, messageId, text, opts) : sendBotMessage(chatId, text, opts);
}
async function showLeadCard(adminChatId, leadChatId, messageId = null) {
  const lead = await getLead(leadChatId);
  const text = `👤 ${displayUser(lead)}\n\nChat ID: ${lead.chat_id}\nUsername: ${lead.username ? '@' + lead.username : '—'}\nStatus: ${labelStage(lead.stage)}\nBot: ${lead.bot_enabled ? '🤖 yoqilgan' : '⏸ o‘chirilgan'}\nBlacklist: ${lead.is_blacklisted ? 'ha' : 'yo‘q'}\n\nTo‘lov rejasi: ${lead.payment_plan || 'none'}\nTo‘langan: ${money(lead.paid_amount || 0)}\nQolgan: ${money(Math.max(0, (lead.total_amount || TOTAL_AMOUNT) - (lead.paid_amount || 0)))}\nChegirma: ${lead.discount_percent || 0}%\n\nMaqola statusi: ${lead.article_status || 'not_started'}\nOxirgi xabar: ${lead.last_customer_message || '—'}\nYangilandi: ${fmtDate(lead.updated_at)}`;
  const opts = inline([
    [btn('🤖 Yoqish', `lead_on:${lead.chat_id}`), btn('⏸ O‘chirish', `lead_off:${lead.chat_id}`)],
    [btn('👤 O‘zim davom', `lead_manual:${lead.chat_id}`), btn('🔁 Boshidan', `lead_restart:${lead.chat_id}`)],
    [btn('💰 To‘lov kutilyapti', `lead_payment_wait:${lead.chat_id}`), btn('📆 14 kunlik', `send_installment:${lead.chat_id}`)],
    [btn('🎁 Chegirma', `discount_one:${lead.chat_id}`), btn('💳 Narx yuborish', `send_price:${lead.chat_id}`)],
    [btn('✅ 40k', `pay_add:${lead.chat_id}:40000`), btn('✅ 80k', `pay_add:${lead.chat_id}:80000`), btn('✅ 100k', `pay_add:${lead.chat_id}:100000`)],
    [btn('📄 Hujjat so‘rash', `send_passport:${lead.chat_id}`), btn('🚫 Blacklist', `lead_blacklist:${lead.chat_id}`)],
    [btn('📋 Maqola statuslari', `article_card:${lead.chat_id}`), btn('🔙 Lidlar', 'menu_leads')]
  ]);
  return messageId ? editBotMessage(adminChatId, messageId, text, opts) : sendBotMessage(adminChatId, text, opts);
}
async function showTemplates(chatId, category = 'all', messageId = null) {
  let metas = Object.keys(DEFAULT_TEMPLATES).map(k => ({ key: k, ...DEFAULT_TEMPLATES[k] }));
  if (supabase) {
    const { data } = await supabase.from('reply_templates').select('*').order('category').order('key');
    if (data?.length) metas = data.map(d => ({ key: d.key, title: d.title || d.key, category: d.category || 'general', body: d.body || '' }));
  }
  if (category !== 'all') metas = metas.filter(m => m.category === category);
  const text = `📝 Shablonlar\n\nKategoriya: ${category === 'all' ? 'hammasi' : (TEMPLATE_GROUPS[category] || category)}\nTahrirlash uchun shablonni tanlang.`;
  const kb = metas.slice(0, 40).map(m => [btn(`${m.title || m.key}`.slice(0, 58), `tpl_view:${m.key}`)]);
  kb.push([btn('Savdo', 'tpl_cat:sales'), btn('To‘lov', 'tpl_cat:payment'), btn('Eslatma', 'tpl_cat:reminder')]);
  kb.push([btn('Chegirma', 'tpl_cat:discount'), btn('Maqola', 'tpl_cat:article'), btn('Hammasi', 'tpl_cat:all')]);
  kb.push([btn('🔙 Menyu', 'menu_home')]);
  return messageId ? editBotMessage(chatId, messageId, text, inline(kb)) : sendBotMessage(chatId, text, inline(kb));
}
async function showTemplateCard(chatId, key, messageId = null) {
  const m = await getTemplateMeta(key);
  const body = m.body || '';
  const preview = body.length > 2500 ? body.slice(0, 2500) + '\n\n...kesildi' : body;
  const text = `📝 ${m.title}\n\nKalit: ${key}\nKategoriya: ${m.category}\n\nHozirgi matn:\n\n${preview || '—'}`;
  const opts = inline([[btn('✏️ Tahrirlash', `tpl_edit:${key}`)], [btn('🔙 Shablonlar', 'menu_templates')]]);
  return messageId ? editBotMessage(chatId, messageId, text, opts) : sendBotMessage(chatId, text, opts);
}
async function showStalled(chatId, messageId = null) {
  const groups = await getStalledGroups();
  const lines = Object.entries(groups).map(([k, v], i) => `${i + 1}. ${v.title} — ${v.rows.length} ta`);
  const text = `⚠️ Chala qolganlar\n\n${lines.join('\n') || 'Chala lid topilmadi.'}`;
  const kb = Object.entries(groups).map(([k, v]) => [btn(`${v.title} (${v.rows.length})`.slice(0, 58), `stalled_group:${k}`)]);
  kb.push([btn('🔙 Menyu', 'menu_home')]);
  return messageId ? editBotMessage(chatId, messageId, text, inline(kb)) : sendBotMessage(chatId, text, inline(kb));
}
async function getStalledGroups() {
  const rows = await listLeads({}, 1000);
  const olderThan = days => new Date(Date.now() - days * 86400000);
  const old10 = olderThan(10);
  const groups = {
    info_no_read: { title: 'Ma’lumot olgan, tanishdim demagan', rows: rows.filter(r => r.stage === STAGE.OFFER_WAITING) },
    no_accept: { title: 'Tanishdim degan, maqolaga rozi bo‘lmagan', rows: rows.filter(r => r.stage === STAGE.WAIT_ACCEPT) },
    questions_no_answers: { title: 'Savollar yuborilgan, javob kelmagan', rows: rows.filter(r => r.stage === STAGE.QUESTIONS_SENT) },
    answers_no_payment: { title: 'Savollarga javob bergan, to‘lov qilmagan', rows: rows.filter(r => r.stage === STAGE.BIO_ANSWERS || r.stage === STAGE.PAYMENT_WAITING) },
    installment_no_consent: { title: '14 kunlik so‘ragan, rozilik yozmagan', rows: rows.filter(r => r.stage === STAGE.INSTALLMENT_TERMS_SENT) },
    consent_no_initial: { title: 'Rozilik yozgan, boshlang‘ich to‘lov qilmagan', rows: rows.filter(r => r.stage === STAGE.INITIAL_PAYMENT_WAITING) },
    silent_10d: { title: '10 kundan beri jim', rows: rows.filter(r => r.updated_at && new Date(r.updated_at) < old10 && ![STAGE.COMPLETED, STAGE.REJECTED, STAGE.BLACKLIST, STAGE.PAID_FULL].includes(r.stage)) },
    article_not_confirmed: { title: 'Maqolasi tasdiqlanmay qolgan', rows: rows.filter(r => r.stage === STAGE.ARTICLE_NOT_CONFIRMED || r.article_status === 'not_confirmed') }
  };
  return groups;
}
async function showStalledGroup(chatId, key, messageId = null) {
  const groups = await getStalledGroups();
  const group = groups[key];
  if (!group) return showStalled(chatId, messageId);
  const text = `⚠️ ${group.title}\n\n${group.rows.length ? group.rows.slice(0, 20).map((r, i) => `${i + 1}. ${displayUser(r)} — ${labelStage(r.stage)}`).join('\n') : 'Lid topilmadi.'}\n\nBu guruhga chegirma yoki eslatma yuborishingiz mumkin.`;
  const opts = inline([
    [btn('🎁 40% chegirma', `discount_group:${key}:40`), btn('🎁 Boshqa foiz', `discount_group_custom:${key}`)],
    [btn('👁 Oldindan ko‘rish', `discount_preview:${key}:40`), btn('🔙 Chala qolganlar', 'menu_stalled')]
  ]);
  return messageId ? editBotMessage(chatId, messageId, text, opts) : sendBotMessage(chatId, text, opts);
}
async function sendDiscountToGroup(key, percent, adminChatId) {
  const groups = await getStalledGroups();
  const group = groups[key];
  if (!group) return sendBotMessage(adminChatId, 'Guruh topilmadi.');
  const tpl = await getTemplate('discount_offer');
  let count = 0;
  for (const lead of group.rows) {
    if (!lead.business_connection_id || lead.discount_sent_at) continue;
    const msg = tpl.replaceAll('{discount}', String(percent));
    await sendBusinessMessage(lead.business_connection_id, lead.chat_id, msg);
    await updateLead(lead.chat_id, { stage: STAGE.DISCOUNT_SENT, discount_percent: Number(percent), discount_sent_at: nowIso(), bot_enabled: true, final_stopped: false });
    count++;
    await new Promise(r => setTimeout(r, 350));
  }
  await sendBotMessage(adminChatId, `✅ ${count} ta lidga ${percent}% chegirma yuborildi.`);
}
async function showPayments(chatId, messageId = null) {
  const rows = await listLeads({}, 1000);
  const full = rows.filter(r => r.payment_status === 'paid_full' || r.stage === STAGE.PAID_FULL);
  const inst = rows.filter(r => r.payment_plan === 'installment14');
  const waiting = rows.filter(r => ['payment_waiting', 'initial_payment_waiting', 'day5_40_waiting', 'day10_80_waiting', 'day14_100_waiting'].includes(r.stage));
  const text = `💰 To‘lovlar\n\n✅ To‘liq to‘laganlar: ${full.length}\n📆 14 kunliklar: ${inst.length}\n⏳ To‘lov kutilyapti: ${waiting.length}\n\nJami tasdiqlangan: ${money(rows.reduce((a, r) => a + Number(r.paid_amount || 0), 0))}`;
  const opts = inline([[btn('✅ To‘liq to‘laganlar', `leads_filter:stage_${STAGE.PAID_FULL}`), btn('📆 14 kunliklar', 'leads_filter:installment')], [btn('⏳ To‘lov kutilyapti', `leads_filter:stage_${STAGE.PAYMENT_WAITING}`), btn('💳 Cheklar', 'menu_receipts')], [btn('🔙 Menyu', 'menu_home')]]);
  return messageId ? editBotMessage(chatId, messageId, text, opts) : sendBotMessage(chatId, text, opts);
}
async function showReminders(chatId, messageId = null) {
  if (!supabase) return sendBotMessage(chatId, 'Supabase ulanmagan.');
  const { data } = await supabase.from('reminders').select('*, leads(username, first_name, last_name, stage)').in('status', ['pending_admin', 'ready']).order('due_at', { ascending: true }).limit(20);
  const rows = data || [];
  const text = `⏰ Eslatmalar\n\n${rows.length ? rows.map((r, i) => `${i + 1}. ${r.leads?.username ? '@' + r.leads.username : r.chat_id} — ${r.type} — ${fmtDate(r.due_at)} — ${r.status}`).join('\n') : 'Hozircha eslatma yo‘q.'}`;
  const kb = rows.map(r => [btn(`${r.type} — ${r.leads?.username ? '@' + r.leads.username : r.chat_id}`.slice(0, 55), `reminder_view:${r.id}`)]);
  kb.push([btn('🔄 Tekshirish', 'reminders_check'), btn('🔙 Menyu', 'menu_home')]);
  return messageId ? editBotMessage(chatId, messageId, text, inline(kb)) : sendBotMessage(chatId, text, inline(kb));
}
async function showReceipts(chatId, messageId = null) {
  if (!supabase) return sendBotMessage(chatId, 'Supabase ulanmagan.');
  const { data } = await supabase.from('receipts').select('*, leads(username, first_name, last_name)').eq('status', 'pending').order('received_at', { ascending: false }).limit(20);
  const rows = data || [];
  const text = `💳 Chek tekshirish\n\n${rows.length ? rows.map((r, i) => `${i + 1}. ${r.leads?.username ? '@' + r.leads.username : r.chat_id} — ${r.amount ? money(r.amount) : 'summa yo‘q'} — risk: ${r.risk || '—'}`).join('\n') : 'Tekshiriladigan chek yo‘q.'}`;
  const kb = rows.map(r => [btn(`${r.leads?.username ? '@' + r.leads.username : r.chat_id} — ${r.amount ? money(r.amount) : 'summa yo‘q'}`.slice(0, 55), `receipt_view:${r.id}`)]);
  kb.push([btn('🔙 Menyu', 'menu_home')]);
  return messageId ? editBotMessage(chatId, messageId, text, inline(kb)) : sendBotMessage(chatId, text, inline(kb));
}
async function showArticles(chatId, messageId = null) {
  const rows = await listLeads({}, 1000);
  const statuses = ['questions_waiting', 'answers_received', 'photo_waiting', 'document_waiting', 'writing', 'review', 'not_confirmed', 'confirmed', 'site_published', 'post_published', 'completed'];
  const lines = statuses.map(s => `${s}: ${rows.filter(r => r.article_status === s).length}`);
  const text = `📋 Maqola jarayoni\n\n${lines.join('\n')}`;
  const opts = inline([[btn('Savollar kutilmoqda', `leads_article:questions_waiting`), btn('Javoblar kelgan', `leads_article:answers_received`)], [btn('Maqola yozilmoqda', `leads_article:writing`), btn('Tasdiqlanmagan', `leads_article:not_confirmed`)], [btn('🔙 Menyu', 'menu_home')]]);
  return messageId ? editBotMessage(chatId, messageId, text, opts) : sendBotMessage(chatId, text, opts);
}
async function showScenarios(chatId, messageId = null) {
  let rows = [];
  if (supabase) {
    const { data } = await supabase.from('custom_scenarios').select('*').order('id', { ascending: false }).limit(10);
    rows = data || [];
  }
  const text = `🧩 AI Ssenariy Quruvchi\n\nBu bo‘limda oddiy tilda yangi qadam qo‘shasiz. Masalan:\n“Savollardan keyin pasportini yuborishini so‘rasin.”\n\nMavjud qoidalar:\n${rows.length ? rows.map(r => `${r.id}. ${r.name} — ${r.trigger_stage} → ${r.next_stage || '—'} ${r.is_active ? '✅' : '❌'}`).join('\n') : 'Hali qoida yo‘q.'}`;
  const opts = inline([[btn('➕ Yangi qadam qo‘shish', 'scenario_add')], [btn('🔙 Menyu', 'menu_home')]]);
  return messageId ? editBotMessage(chatId, messageId, text, opts) : sendBotMessage(chatId, text, opts);
}
async function showSettings(chatId, messageId = null) {
  const onlyNew = await getSetting('only_new_leads', true);
  const oldNoReply = await getSetting('old_leads_no_reply', true);
  const remindersAdmin = await getSetting('reminders_need_admin', true);
  const text = `⚙️ Sozlamalar\n\nFaqat yangi lidlarga ishlash: ${onlyNew ? '✅' : '❌'}\nEski lidlarga javob bermaslik: ${oldNoReply ? '✅' : '❌'}\nEslatmalarni faqat tasdiq bilan yuborish: ${remindersAdmin ? '✅' : '❌'}\nAI faqat shablon tanlaydi: ✅`;
  const opts = inline([[btn(`${onlyNew ? '❌' : '✅'} Faqat yangi lidlar`, 'toggle:only_new_leads')], [btn(`${oldNoReply ? '❌' : '✅'} Eski lidlarga javob`, 'toggle:old_leads_no_reply')], [btn(`${remindersAdmin ? '❌' : '✅'} Eslatma tasdiq`, 'toggle:reminders_need_admin')], [btn('🔙 Menyu', 'menu_home')]]);
  return messageId ? editBotMessage(chatId, messageId, text, opts) : sendBotMessage(chatId, text, opts);
}

async function addPayment(chatId, amount, source = 'manual', receiptId = null) {
  const lead = await getLead(chatId);
  const paid = Number(lead.paid_amount || 0) + Number(amount || 0);
  const total = Number(lead.total_amount || TOTAL_AMOUNT);
  let stage = lead.stage;
  let paymentStatus = 'partial';
  if (paid >= total) { stage = STAGE.PAID_FULL; paymentStatus = 'paid_full'; }
  else if (lead.payment_plan === 'installment14') {
    if (paid >= INITIAL_PAYMENT_AMOUNT && !lead.initial_payment_paid_at) stage = STAGE.INITIAL_PAYMENT_PAID;
    if (paid >= total * 0.8) stage = STAGE.DAY14_WAITING;
    else if (paid >= total * 0.4) stage = STAGE.DAY10_WAITING;
    else stage = STAGE.INITIAL_PAYMENT_WAITING;
  } else {
    stage = STAGE.PAYMENT_WAITING;
  }
  if (supabase) await supabase.from('payments').insert({ chat_id: String(chatId), amount: Number(amount), source, receipt_id: receiptId, note: source });
  await updateLead(chatId, { paid_amount: paid, payment_status: paymentStatus, stage, initial_payment_paid_at: paid >= INITIAL_PAYMENT_AMOUNT && !lead.initial_payment_paid_at ? nowIso() : lead.initial_payment_paid_at });
  return { paid, stage };
}

async function exportExcel(chatId) {
  if (!supabase) return sendBotMessage(chatId, 'Supabase ulanmagan.');
  const { data } = await supabase.from('leads').select('*').order('updated_at', { ascending: false });
  const rows = (data || []).map(r => ({
    Ism: [r.first_name, r.last_name].filter(Boolean).join(' '),
    Username: r.username ? '@' + r.username : '',
    Chat_ID: r.chat_id,
    Status: labelStage(r.stage),
    Bot: r.bot_enabled ? 'Yoqilgan' : 'O‘chirilgan',
    Tolov_rejasi: r.payment_plan,
    Tolangan_summa: r.paid_amount || 0,
    Qolgan_summa: Math.max(0, (r.total_amount || TOTAL_AMOUNT) - (r.paid_amount || 0)),
    Chegirma: r.discount_percent || 0,
    Rozilik_vaqti: r.terms_accepted_at || '',
    Maqola_statusi: r.article_status || '',
    Oxirgi_bosqich: r.stage,
    Yaratilgan: r.created_at,
    Yangilangan: r.updated_at
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Lidlar');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', '📥 Lidlar Excel eksport');
  form.append('document', buf, { filename: `olye_lidlar_${new Date().toISOString().slice(0, 10)}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return tgFile('sendDocument', form);
}

async function parseScenarioInstruction(text) {
  const t = normalize(text);
  // Deterministic common case first.
  if (includesAny(t, ['pasport', 'passport', 'hujjat'])) {
    return {
      name: 'Savollardan keyin hujjat so‘rash',
      trigger_stage: STAGE.BIO_ANSWERS,
      trigger_event: 'user_replied',
      keyword: null,
      template_key: 'passport_request',
      message: null,
      next_stage: 'document_waiting',
      stop_after: true
    };
  }
  if (!openai) return null;
  try {
    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      max_tokens: 450,
      messages: [
        { role: 'system', content: `You convert Uzbek bot feature instructions into JSON scenario. Use trigger_stage from: biography_questions_sent,bio_answers_received,payment_waiting,offer_waiting,waiting_accept,installment_terms_sent. Return JSON only with fields name, trigger_stage, keyword, message, next_stage, stop_after. Never create code.` },
        { role: 'user', content: text }
      ]
    });
    const raw = resp.choices?.[0]?.message?.content || '{}';
    const obj = safeJson(raw.replace(/^```json/i, '').replace(/```$/i, '').trim(), null);
    if (!obj?.name || !obj?.trigger_stage) return null;
    return { name: obj.name, trigger_stage: obj.trigger_stage, trigger_event: 'user_replied', keyword: obj.keyword || null, template_key: null, message: obj.message || '', next_stage: obj.next_stage || null, stop_after: !!obj.stop_after };
  } catch (e) {
    console.error('scenario AI error', e.message);
    return null;
  }
}

async function handleAdminText(msg) {
  const chatId = String(msg.chat.id);
  const text = getMessageText(msg);
  const session = await getSession(chatId);
  if (session?.mode === 'edit_template') {
    const key = session.payload?.key;
    const ok = await setTemplate(key, text);
    await clearSession(chatId);
    await sendBotMessage(chatId, ok ? `✅ Shablon yangilandi: ${key}` : '❌ Shablonni saqlashda xato.', adminKeyboard());
    return showTemplateCard(chatId, key);
  }
  if (session?.mode === 'scenario_add') {
    const scenario = await parseScenarioInstruction(text);
    if (!scenario) {
      await sendBotMessage(chatId, 'Tushunmadim. Iltimos, qadamni aniqroq yozing. Masalan: “Savollardan keyin pasportini yuborishini so‘rasin.”');
      return;
    }
    await setSession(chatId, 'scenario_confirm', { scenario });
    const preview = `🧩 Yangi qoida tayyorlandi\n\nNomi: ${scenario.name}\nQachon ishlaydi: ${labelStage(scenario.trigger_stage)} dan keyin odam yozsa\nKalit so‘z: ${scenario.keyword || 'shart emas'}\nYuboriladigan shablon: ${scenario.template_key || 'yo‘q'}\nYuboriladigan matn: ${scenario.message || (scenario.template_key ? await getTemplate(scenario.template_key) : '—')}\nKeyingi status: ${scenario.next_stage || 'o‘zgarmaydi'}\nBot to‘xtaydimi: ${scenario.stop_after ? 'Ha' : 'Yo‘q'}\n\nTasdiqlaysizmi?`;
    await sendBotMessage(chatId, preview, inline([[btn('✅ Qo‘shish', 'scenario_confirm_add'), btn('❌ Bekor qilish', 'scenario_cancel')]]));
    return;
  }
  if (session?.mode === 'receipt_other') {
    const rid = session.payload?.receipt_id;
    const amount = Number(String(text).replace(/[^0-9]/g, ''));
    await clearSession(chatId);
    if (!amount) return sendBotMessage(chatId, 'Summa topilmadi.');
    return confirmReceipt(chatId, rid, amount);
  }
  if (session?.mode === 'discount_custom_group') {
    const group = session.payload?.group;
    const percent = Number(String(text).replace(/[^0-9]/g, ''));
    await clearSession(chatId);
    if (!percent) return sendBotMessage(chatId, 'Foiz topilmadi.');
    return sendDiscountToGroup(group, percent, chatId);
  }

  if (text === '/start' || text === '🏠 Menyu') return showMainMenu(chatId);
  if (text === '/resetall') {
    await supabase?.from('leads').update({ stage: STAGE.NEW, bot_enabled: true, final_stopped: false, is_hot: false }).neq('chat_id', '');
    return sendBotMessage(chatId, 'Test uchun barcha lidlar boshidan qilindi.', adminKeyboard());
  }
  const map = {
    '📊 Hisobot': showReport,
    '👥 Lidlar': showLeadList,
    '💰 To‘lovlar': showPayments,
    '⏰ Eslatmalar': showReminders,
    '📝 Shablonlar': showTemplates,
    '🧩 Ssenariy qurish': showScenarios,
    '💳 Chek tekshirish': showReceipts,
    '📋 Maqola jarayoni': showArticles,
    '⚠️ Chala qolganlar': showStalled,
    '📥 Excel': exportExcel,
    '⚙️ Sozlamalar': showSettings
  };
  if (map[text]) return map[text](chatId);
  return showMainMenu(chatId);
}

async function confirmReceipt(adminChatId, receiptId, amount) {
  if (!supabase) return sendBotMessage(adminChatId, 'Supabase ulanmagan.');
  const { data: receipt } = await supabase.from('receipts').select('*').eq('id', receiptId).maybeSingle();
  if (!receipt) return sendBotMessage(adminChatId, 'Chek topilmadi.');
  await supabase.from('receipts').update({ status: 'confirmed', amount, reviewed_at: nowIso() }).eq('id', receiptId);
  const res = await addPayment(receipt.chat_id, amount, `receipt:${receiptId}`, receiptId);
  const lead = await getLead(receipt.chat_id);
  await sendTemplateToBusiness(lead, 'payment_confirmed', {}, res.stage);
  return sendBotMessage(adminChatId, `✅ Chek tasdiqlandi: ${money(amount)}\n${displayUser(lead)}\nYangi status: ${labelStage(res.stage)}`, inline([[btn('👁 Lid kartasi', `lead_view:${receipt.chat_id}`)]]));
}
async function rejectReceipt(adminChatId, receiptId) {
  if (!supabase) return sendBotMessage(adminChatId, 'Supabase ulanmagan.');
  const { data: receipt } = await supabase.from('receipts').select('*').eq('id', receiptId).maybeSingle();
  if (!receipt) return sendBotMessage(adminChatId, 'Chek topilmadi.');
  await supabase.from('receipts').update({ status: 'rejected', reviewed_at: nowIso() }).eq('id', receiptId);
  const lead = await getLead(receipt.chat_id);
  await sendTemplateToBusiness(lead, 'receipt_rejected', {}, lead.stage);
  return sendBotMessage(adminChatId, '❌ Chek rad etildi va lidga xabar yuborildi.');
}

async function handleCallback(cb) {
  const data = cb.data || '';
  const chatId = String(cb.message.chat.id);
  const messageId = cb.message.message_id;
  if (!isAdminChat(chatId)) return answerCallback(cb.id, 'Ruxsat yo‘q');
  await answerCallback(cb.id);

  if (data === 'menu_home') return showMainMenu(chatId);
  if (data === 'menu_report') return showReport(chatId, messageId);
  if (data === 'menu_leads') return showLeadList(chatId, 'all', 0, messageId);
  if (data === 'menu_payments') return showPayments(chatId, messageId);
  if (data === 'menu_reminders') return showReminders(chatId, messageId);
  if (data === 'menu_templates') return showTemplates(chatId, 'all', messageId);
  if (data === 'menu_scenarios') return showScenarios(chatId, messageId);
  if (data === 'menu_receipts') return showReceipts(chatId, messageId);
  if (data === 'menu_articles') return showArticles(chatId, messageId);
  if (data === 'menu_settings') return showSettings(chatId, messageId);
  if (data === 'menu_stalled') return showStalled(chatId, messageId);
  if (data === 'export_excel') return exportExcel(chatId);

  if (data.startsWith('leads_filter:')) return showLeadList(chatId, data.split(':')[1], 0, messageId);
  if (data.startsWith('lead_view:')) return showLeadCard(chatId, data.split(':')[1], messageId);
  if (data.startsWith('lead_on:')) { const id = data.split(':')[1]; await updateLead(id, { bot_enabled: true, final_stopped: false }); return showLeadCard(chatId, id, messageId); }
  if (data.startsWith('lead_off:')) { const id = data.split(':')[1]; await updateLead(id, { bot_enabled: false }); return showLeadCard(chatId, id, messageId); }
  if (data.startsWith('lead_manual:')) { const id = data.split(':')[1]; await updateLead(id, { bot_enabled: false, stage: STAGE.MANUAL }); return showLeadCard(chatId, id, messageId); }
  if (data.startsWith('lead_restart:')) { const id = data.split(':')[1]; await updateLead(id, { bot_enabled: true, final_stopped: false, stage: STAGE.NEW, is_blacklisted: false }); return showLeadCard(chatId, id, messageId); }
  if (data.startsWith('lead_start:')) { const id = data.split(':')[1]; await updateLead(id, { bot_enabled: true, final_stopped: false, stage: STAGE.NEW }); return showLeadCard(chatId, id, messageId); }
  if (data.startsWith('lead_blacklist:')) { const id = data.split(':')[1]; await updateLead(id, { is_blacklisted: true, bot_enabled: false, stage: STAGE.BLACKLIST }); return showLeadCard(chatId, id, messageId); }
  if (data.startsWith('lead_payment_wait:')) { const id = data.split(':')[1]; await updateLead(id, { stage: STAGE.PAYMENT_WAITING, bot_enabled: true }); return showLeadCard(chatId, id, messageId); }

  if (data.startsWith('send_price:')) { const id = data.split(':')[1]; const lead = await getLead(id); await sendTemplateToBusiness(lead, 'price_info', {}, lead.stage); return sendBotMessage(chatId, '✅ Narx matni yuborildi.'); }
  if (data.startsWith('send_installment:')) { const id = data.split(':')[1]; const lead = await getLead(id); await updateLead(id, { payment_plan: 'installment14', stage: STAGE.INSTALLMENT_TERMS_SENT, bot_enabled: true }); await sendTemplateToBusiness(lead, 'installment_terms', {}, STAGE.INSTALLMENT_TERMS_SENT); return sendBotMessage(chatId, '✅ 14 kunlik kelishuv matni yuborildi.'); }
  if (data.startsWith('send_passport:')) { const id = data.split(':')[1]; const lead = await getLead(id); await sendTemplateToBusiness(lead, 'passport_request', {}, 'document_waiting', { bot_enabled: false }); return sendBotMessage(chatId, '✅ Hujjat so‘rash matni yuborildi.'); }
  if (data.startsWith('pay_add:')) { const [, id, amount] = data.split(':'); const res = await addPayment(id, Number(amount), 'admin_button'); return showLeadCard(chatId, id, messageId); }

  if (data.startsWith('tpl_cat:')) return showTemplates(chatId, data.split(':')[1], messageId);
  if (data.startsWith('tpl_view:')) return showTemplateCard(chatId, data.split(':')[1], messageId);
  if (data.startsWith('tpl_edit:')) { const key = data.split(':')[1]; await setSession(chatId, 'edit_template', { key }); return sendBotMessage(chatId, `✏️ ${key} shabloni uchun yangi matnni yuboring.`, inline([[btn('❌ Bekor qilish', 'session_cancel')]])); }
  if (data === 'session_cancel') { await clearSession(chatId); return showMainMenu(chatId); }

  if (data === 'scenario_add') { await setSession(chatId, 'scenario_add', {}); return sendBotMessage(chatId, '🧩 Qanday yangi qadam qo‘shmoqchisiz? Oddiy tilda yozing.\n\nMasalan: “Savollardan keyin pasportini yuborishini so‘rasin.”'); }
  if (data === 'scenario_cancel') { await clearSession(chatId); return showScenarios(chatId, messageId); }
  if (data === 'scenario_confirm_add') {
    const s = await getSession(chatId);
    const sc = s?.payload?.scenario;
    if (!sc) return sendBotMessage(chatId, 'Qoida topilmadi.');
    if (supabase) await supabase.from('custom_scenarios').insert(sc);
    await clearSession(chatId);
    return sendBotMessage(chatId, '✅ Yangi ssenariy qo‘shildi.');
  }

  if (data.startsWith('stalled_group:')) return showStalledGroup(chatId, data.split(':')[1], messageId);
  if (data.startsWith('discount_group:')) { const [, group, percent] = data.split(':'); return sendDiscountToGroup(group, percent, chatId); }
  if (data.startsWith('discount_group_custom:')) { const group = data.split(':')[1]; await setSession(chatId, 'discount_custom_group', { group }); return sendBotMessage(chatId, 'Chegirma foizini raqam bilan yuboring. Masalan: 40'); }
  if (data.startsWith('discount_one:')) { const id = data.split(':')[1]; const lead = await getLead(id); const body = (await getTemplate('discount_offer')).replaceAll('{discount}', '40'); await sendBusinessMessage(lead.business_connection_id, id, body); await updateLead(id, { stage: STAGE.DISCOUNT_SENT, discount_percent: 40, discount_sent_at: nowIso() }); return sendBotMessage(chatId, '✅ 40% chegirma yuborildi.'); }

  if (data.startsWith('receipt_confirm:')) { const [, rid, amount] = data.split(':'); return confirmReceipt(chatId, rid, Number(amount)); }
  if (data.startsWith('receipt_reject:')) { const rid = data.split(':')[1]; return rejectReceipt(chatId, rid); }
  if (data.startsWith('receipt_other:')) { const rid = data.split(':')[1]; await setSession(chatId, 'receipt_other', { receipt_id: rid }); return sendBotMessage(chatId, 'Tasdiqlanadigan summani raqam bilan yuboring. Masalan: 100000'); }
  if (data.startsWith('receipt_view:')) {
    const rid = data.split(':')[1];
    const { data: r } = await supabase.from('receipts').select('*').eq('id', rid).maybeSingle();
    if (!r) return sendBotMessage(chatId, 'Chek topilmadi.');
    const text = `💳 Chek #${r.id}\n\nChat ID: ${r.chat_id}\nSumma: ${r.amount ? money(r.amount) : '—'}\nTranzaksiya: ${r.transaction_id || '—'}\nRisk: ${r.risk || '—'}\nStatus: ${r.status}\nAI:\n${JSON.stringify(r.ai_json || {}, null, 2).slice(0, 1500)}`;
    return editBotMessage(chatId, messageId, text, inline([[btn('✅ 40k', `receipt_confirm:${r.id}:40000`), btn('✅ 100k', `receipt_confirm:${r.id}:100000`)], [btn('❌ Rad etish', `receipt_reject:${r.id}`), btn('🔙 Cheklar', 'menu_receipts')]]));
  }

  if (data === 'reminders_check') { await checkReminderReadiness(); return showReminders(chatId, messageId); }
  if (data.startsWith('reminder_view:')) {
    const rid = data.split(':')[1];
    const { data: r } = await supabase.from('reminders').select('*, leads(*)').eq('id', rid).maybeSingle();
    if (!r) return sendBotMessage(chatId, 'Eslatma topilmadi.');
    const body = await getTemplate(r.template_key);
    return editBotMessage(chatId, messageId, `⏰ Eslatma #${r.id}\n\nNomzod: ${displayUser(r.leads)}\nTuri: ${r.type}\nMuddati: ${fmtDate(r.due_at)}\n\nMatn:\n${body}`, inline([[btn('✅ Yuborish', `reminder_send:${r.id}`), btn('❌ O‘tkazish', `reminder_skip:${r.id}`)], [btn('🔙 Eslatmalar', 'menu_reminders')]]));
  }
  if (data.startsWith('reminder_send:')) { const rid = data.split(':')[1]; await sendReminder(rid); return showReminders(chatId, messageId); }
  if (data.startsWith('reminder_skip:')) { const rid = data.split(':')[1]; await supabase.from('reminders').update({ status: 'skipped' }).eq('id', rid); return showReminders(chatId, messageId); }

  if (data.startsWith('article_card:')) return showArticleCard(chatId, data.split(':')[1], messageId);
  if (data.startsWith('article_set:')) { const [, id, status] = data.split(':'); await updateLead(id, { article_status: status, stage: statusToStage(status) }); return showLeadCard(chatId, id, messageId); }

  if (data.startsWith('toggle:')) { const key = data.split(':')[1]; const cur = await getSetting(key, true); await setSetting(key, !cur); return showSettings(chatId, messageId); }

  return sendBotMessage(chatId, `Noma’lum tugma: ${data}`);
}
function statusToStage(status) {
  const map = { writing: STAGE.ARTICLE_WRITING, review: STAGE.ARTICLE_REVIEW, not_confirmed: STAGE.ARTICLE_NOT_CONFIRMED, confirmed: STAGE.ARTICLE_CONFIRMED, site_published: STAGE.SITE_PUBLISHED, post_published: STAGE.POST_PUBLISHED, completed: STAGE.COMPLETED };
  return map[status] || STAGE.MANUAL;
}
async function showArticleCard(chatId, leadChatId, messageId = null) {
  const lead = await getLead(leadChatId);
  const text = `📋 Maqola jarayoni\n\n${displayUser(lead)}\nHozirgi status: ${lead.article_status || 'not_started'}\nUmumiy status: ${labelStage(lead.stage)}`;
  const opts = inline([[btn('📋 Savollar keldi', `article_set:${leadChatId}:answers_received`), btn('🖼 Rasm keldi', `article_set:${leadChatId}:photo_received`)], [btn('📄 Hujjat keldi', `article_set:${leadChatId}:document_received`), btn('✍️ Yozilmoqda', `article_set:${leadChatId}:writing`)], [btn('✅ Tasdiqlandi', `article_set:${leadChatId}:confirmed`), btn('❌ Tasdiqlanmadi', `article_set:${leadChatId}:not_confirmed`)], [btn('🌐 Saytga joylandi', `article_set:${leadChatId}:site_published`), btn('📢 Post chiqdi', `article_set:${leadChatId}:post_published`)], [btn('🏁 Yakunlandi', `article_set:${leadChatId}:completed`), btn('🔙 Kartaga', `lead_view:${leadChatId}`)]]);
  return messageId ? editBotMessage(chatId, messageId, text, opts) : sendBotMessage(chatId, text, opts);
}
async function checkReminderReadiness() {
  if (!supabase) return;
  const { data } = await supabase.from('reminders').select('*').lte('due_at', nowIso()).eq('status', 'pending_admin').limit(50);
  for (const r of data || []) await supabase.from('reminders').update({ status: 'ready' }).eq('id', r.id);
}
async function sendReminder(id) {
  const { data: r } = await supabase.from('reminders').select('*, leads(*)').eq('id', id).maybeSingle();
  if (!r) return;
  const body = await getTemplate(r.template_key);
  if (r.leads?.business_connection_id) {
    await sendBusinessMessage(r.leads.business_connection_id, r.chat_id, body);
    await supabase.from('reminders').update({ status: 'sent', sent_at: nowIso(), approved_by_admin_at: nowIso() }).eq('id', id);
  }
}

app.get('/', (req, res) => res.json({ ok: true, service: 'olye-business-ai-crm-bot', version: 'v5-crm-full' }));
app.get('/set-webhook', async (req, res) => {
  if (req.query.secret !== TELEGRAM_WEBHOOK_SECRET) return res.status(403).json({ ok: false, error: 'bad secret' });
  const host = req.get('host');
  const url = `https://${host}/webhook/${TELEGRAM_WEBHOOK_SECRET}`;
  const data = await tg('setWebhook', { url, allowed_updates: ['message', 'callback_query', 'business_message', 'edited_business_message', 'business_connection'] });
  res.json({ ok: true, webhook: url, telegram: data });
});
app.get('/cron', async (req, res) => {
  if (req.query.secret !== TELEGRAM_WEBHOOK_SECRET) return res.status(403).json({ ok: false });
  await checkReminderReadiness();
  res.json({ ok: true });
});
app.post('/webhook/:secret', async (req, res) => {
  if (req.params.secret !== TELEGRAM_WEBHOOK_SECRET) return res.status(403).json({ ok: false });
  res.json({ ok: true });
  const update = req.body;
  try {
    if (update.business_connection) {
      await sendBotMessage(ADMIN_CHAT_ID, `✅ Telegram Business bot ulandi yoki connection yangilandi.\nConnection ID: ${update.business_connection.id}`);
      return;
    }
    if (update.callback_query) return handleCallback(update.callback_query);
    if (update.business_message || update.edited_business_message) return handleBusinessMessage(update);
    if (update.message) {
      const chatId = String(update.message.chat.id);
      if (isAdminChat(chatId)) return handleAdminText(update.message);
      // direct non-admin bot chat: keep quiet except start
      if (update.message.text === '/start') return sendBotMessage(chatId, 'Bu bot Telegram Business CRM uchun ishlaydi.');
    }
  } catch (e) {
    console.error('webhook handler error', e.stack || e.message);
    if (ADMIN_CHAT_ID !== '0') await sendBotMessage(ADMIN_CHAT_ID, `⚠️ Bot xatosi:\n${e.message}`);
  }
});

setInterval(() => { checkReminderReadiness().catch(e => console.error('interval reminder error', e.message)); }, 15 * 60 * 1000);

app.listen(PORT, async () => {
  console.log(`OLYE Business AI CRM Bot v5 running on port ${PORT}`);
  await ensureDefaultTemplates();
});
