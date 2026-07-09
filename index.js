const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { DEFAULT_TEMPLATES } = require('./templates');

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || '0');
const BUSINESS_OWNER_ID = String(process.env.BUSINESS_OWNER_ID || '0');
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || 'secret';
const AUTO_REPLY_ENABLED = String(process.env.AUTO_REPLY_ENABLED || 'true') === 'true';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

if (!BOT_TOKEN) console.warn('BOT_TOKEN is missing');

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

function normalize(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[’ʻ`]/g, "'")
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
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text, words) {
  return words.some(w => text.includes(w));
}

function isYes(text) {
  const t = normalize(text);
  if (!t) return false;
  if (['ha', 'xa', 'haa', 'xaaa', 'hop', "ho'p", 'albatta', 'mayli', 'ok', 'tushunarli'].includes(t)) return true;
  return includesAny(t, [
    'ha shunday', 'xa shunday', 'qoldirganman', 'qoldirgandim', 'qoldirgan edim',
    'ariza qoldirgan', 'shunaqa', 'togri', "to'g'ri", 'roziman', 'maqul', "ma'qul",
    'yaxshi', 'boladi', "bo'ladi", 'qiling', 'yozing', 'kiriting'
  ]);
}

function isNo(text) {
  const t = normalize(text);
  if (!t) return false;
  if (["yo'q", 'yoq', 'yog', 'yuq', 'no'].includes(t)) return true;
  return includesAny(t, ["yo'q", 'yoq', 'yog', 'yuq', 'kerak emas', 'qiziqmadim', 'istamayman', 'xohlamayman', 'rad']);
}

function isGreetingOrPositiveStart(text) {
  const t = normalize(text);
  return includesAny(t, [
    'assalomu', 'asalomu', 'salom', 'alaykum', 'valaykum', 'va alaykum', 'yaxshiman', 'ha yaxshi', 'xa yaxshi', 'rahmat yaxshi', 'raxmat yaxshi'
  ]) || isYes(t);
}

function isPrice(text) {
  const t = normalize(text);
  return includesAny(t, [
    'pullik', 'pul', 'narx', 'narxi', 'qancha', 'tolov', "to'lov", 'badal', '100', 'necha som', "necha so'm", 'karta', 'kartaga', 'chegirma'
  ]);
}

function isReadConfirmed(text) {
  const t = normalize(text);
  return includesAny(t, [
    'tanishdim', 'oqidim', "o'qidim", 'tanishib chiqdim', 'korib chiqdim', "ko'rib chiqdim", 'tushundim', 'oferta bilan tanishdim'
  ]);
}

function isAckOnly(text) {
  const t = normalize(text);
  return ['hop', "ho'p", 'mayli', 'ok', 'xoʻp', 'xop', 'boladi', "bo'ladi", 'tushunarli'].includes(t);
}

function wantsQuestions(text) {
  const t = normalize(text);
  return includesAny(t, ['savollar', 'savol', 'anketa', 'yubor', 'jonating', "jo'nating"]);
}

function isOwnerMessage(msg) {
  const fromId = msg?.from?.id ? String(msg.from.id) : '';
  return BUSINESS_OWNER_ID !== '0' && fromId === BUSINESS_OWNER_ID;
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

async function sendBotMessage(chatId, text) {
  if (!chatId || !text) return;
  return tg('sendMessage', { chat_id: chatId, text });
}

async function sendBusinessMessage(businessConnectionId, chatId, text) {
  if (!businessConnectionId || !chatId || !text) return;
  const chunks = splitMessage(text, 3900);
  for (const chunk of chunks) {
    await tg('sendMessage', {
      business_connection_id: businessConnectionId,
      chat_id: chatId,
      text: chunk
    });
  }
}

function splitMessage(text, maxLen) {
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

async function getTemplate(key) {
  if (!key) return '';
  if (supabase) {
    const { data, error } = await supabase.from('reply_templates').select('body').eq('key', key).maybeSingle();
    if (!error && data?.body !== undefined) return data.body;
  }
  return DEFAULT_TEMPLATES[key] || '';
}

async function setTemplate(key, body) {
  if (!supabase) return false;
  const { error } = await supabase.from('reply_templates').upsert({ key, body, updated_at: new Date().toISOString() });
  if (error) console.error('setTemplate error', error);
  return !error;
}

async function getLead(chatId) {
  const id = String(chatId);
  if (!supabase) return { chat_id: id, stage: 'new', paused: false, final_stopped: false };
  const { data, error } = await supabase.from('leads').select('*').eq('chat_id', id).maybeSingle();
  if (error) console.error('getLead error', error);
  return data || { chat_id: id, stage: 'new', paused: false, final_stopped: false };
}

async function saveLead(partial) {
  if (!supabase) return;
  const row = { ...partial, chat_id: String(partial.chat_id), updated_at: new Date().toISOString() };
  const { error } = await supabase.from('leads').upsert(row, { onConflict: 'chat_id' });
  if (error) console.error('saveLead error', error);
}

async function loadCustomRules() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('custom_rules').select('*').eq('is_active', true).order('id', { ascending: true });
  if (error) {
    console.error('load rules error', error);
    return [];
  }
  return data || [];
}

async function matchCustomRule(text) {
  const t = normalize(text);
  const rules = await loadCustomRules();
  for (const r of rules) {
    if (r.phrase && t.includes(normalize(r.phrase))) return r;
  }
  return null;
}

async function classifyWithAI(stage, text) {
  // AI hech qachon javob matni yozmaydi. Faqat bitta label qaytaradi.
  if (!openai) return 'unknown';
  try {
    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      max_tokens: 10,
      messages: [
        { role: 'system', content: `You classify Uzbek Telegram sales messages. Return only one label from this list: greeting, yes, no, price, read_confirmed, ack, wants_questions, unknown. Never explain.` },
        { role: 'user', content: `Current stage: ${stage}\nMessage: ${text}` }
      ]
    });
    const label = normalize(resp.choices?.[0]?.message?.content || '').split(' ')[0];
    const allowed = ['greeting', 'yes', 'no', 'price', 'read_confirmed', 'ack', 'wants_questions', 'unknown'];
    return allowed.includes(label) ? label : 'unknown';
  } catch (e) {
    console.error('AI classify error', e.message);
    return 'unknown';
  }
}

async function classify(stage, text) {
  if (isPrice(text)) return 'price';
  if (isReadConfirmed(text)) return 'read_confirmed';
  if (wantsQuestions(text)) return 'wants_questions';
  if (isAckOnly(text)) return 'ack';
  if (isGreetingOrPositiveStart(text)) return 'greeting_or_yes';
  if (isNo(text)) return 'no';
  if (isYes(text)) return 'yes';
  const ai = await classifyWithAI(stage, text);
  if (ai === 'greeting') return 'greeting_or_yes';
  return ai;
}

async function decideReply(lead, text) {
  const stage = lead.stage || 'new';

  // Qo'lda qo'shilgan maxsus qoidalar eng birinchi ishlaydi.
  const custom = await matchCustomRule(text);
  if (custom) {
    return {
      templateKey: custom.template_key,
      newStage: custom.new_stage || stage,
      stopAfter: !!custom.stop_after
    };
  }

  const intent = await classify(stage, text);

  // Pullikmi/narx har qanday bosqichda javob beriladi, lekin stage o'zgarmaydi.
  if (intent === 'price') {
    return { templateKey: 'price_info', newStage: stage, stopAfter: false };
  }

  switch (stage) {
    case 'new':
    case 'outreach_sent':
      if (intent === 'greeting_or_yes' || intent === 'yes') {
        return { templateKey: 'start_application_check', newStage: 'awaiting_application_confirmation', stopAfter: false };
      }
      return { templateKey: 'no_reply', newStage: stage, stopAfter: false };

    case 'awaiting_application_confirmation':
      if (intent === 'greeting_or_yes' || intent === 'yes') {
        return { templateKey: 'application_yes', newStage: 'awaiting_info_answer', stopAfter: false };
      }
      if (intent === 'no') {
        return { templateKey: 'decline', newStage: 'stopped_declined', stopAfter: true };
      }
      return { templateKey: 'no_reply', newStage: stage, stopAfter: false };

    case 'awaiting_info_answer':
      // Shu bosqichda HA ham YO'Q ham ma'lumot yuboradi.
      if (intent === 'greeting_or_yes' || intent === 'yes' || intent === 'no' || intent === 'ack') {
        return { templateKey: 'info_intro', newStage: 'awaiting_offer_ack', stopAfter: false };
      }
      return { templateKey: 'no_reply', newStage: stage, stopAfter: false };

    case 'awaiting_offer_ack':
      // Ho'p desa bot jim turadi, keyin tanishdim deguncha kutadi.
      if (intent === 'ack' || intent === 'greeting_or_yes' || intent === 'yes') {
        return { templateKey: 'no_reply', newStage: 'awaiting_read_confirmation', stopAfter: false };
      }
      if (intent === 'read_confirmed') {
        return { templateKey: 'ask_acceptable', newStage: 'awaiting_article_agreement', stopAfter: false };
      }
      return { templateKey: 'no_reply', newStage: stage, stopAfter: false };

    case 'awaiting_read_confirmation':
      if (intent === 'read_confirmed') {
        return { templateKey: 'ask_acceptable', newStage: 'awaiting_article_agreement', stopAfter: false };
      }
      return { templateKey: 'no_reply', newStage: stage, stopAfter: false };

    case 'awaiting_article_agreement':
      if (intent === 'greeting_or_yes' || intent === 'yes' || intent === 'wants_questions') {
        return { templateKey: 'biography_questions', newStage: 'completed_questions_sent', stopAfter: true };
      }
      if (intent === 'no') {
        return { templateKey: 'decline', newStage: 'stopped_declined', stopAfter: true };
      }
      return { templateKey: 'no_reply', newStage: stage, stopAfter: false };

    default:
      return { templateKey: 'no_reply', newStage: stage, stopAfter: false };
  }
}

async function handleAdminCommand(msg) {
  const chatId = String(msg.chat.id);
  const text = msg.text || '';
  if (chatId !== ADMIN_CHAT_ID && ADMIN_CHAT_ID !== '0') return;

  if (text.startsWith('/start')) {
    await sendBotMessage(chatId, `Bot ishga tayyor. Sizning chat_id: ${chatId}`);
    return;
  }

  if (text.startsWith('/help') || text.startsWith('/commands')) {
    await sendBotMessage(chatId, `Komandalar:\n/start\n/resetall\n/templates\n/gettemplate KEY\n/settemplate KEY | MATN\n/status\n/pausechat CHAT_ID\n/unpausechat CHAT_ID\n/addrule phrase | template_key | new_stage | stop\n/rules\n/delrule ID`);
    return;
  }

  if (text.startsWith('/resetall')) {
    if (supabase) await supabase.from('leads').update({ stage: 'new', paused: false, final_stopped: false, updated_at: new Date().toISOString() }).neq('chat_id', '');
    await sendBotMessage(chatId, 'Barcha chatlar boshidan qilindi.');
    return;
  }

  if (text.startsWith('/templates')) {
    const keys = Object.keys(DEFAULT_TEMPLATES).join('\n');
    await sendBotMessage(chatId, `Shablonlar:\n${keys}\n\nKo'rish: /gettemplate KEY\nO'zgartirish: /settemplate KEY | yangi matn`);
    return;
  }

  if (text.startsWith('/gettemplate')) {
    const key = text.split(/\s+/)[1];
    if (!key) return sendBotMessage(chatId, 'Masalan: /gettemplate info_intro');
    const body = await getTemplate(key);
    await sendBotMessage(chatId, `${key}:\n\n${body || '(bo‘sh)'}`);
    return;
  }

  if (text.startsWith('/settemplate')) {
    const rest = text.replace('/settemplate', '').trim();
    const sep = rest.indexOf('|');
    if (sep === -1) return sendBotMessage(chatId, 'Format: /settemplate KEY | yangi matn');
    const key = rest.slice(0, sep).trim();
    const body = rest.slice(sep + 1).trim();
    if (!key || !body) return sendBotMessage(chatId, 'KEY va matn bo‘sh bo‘lmasin.');
    const ok = await setTemplate(key, body);
    await sendBotMessage(chatId, ok ? `✅ ${key} yangilandi.` : '❌ Supabase xatosi.');
    return;
  }

  if (text.startsWith('/status')) {
    if (!supabase) return sendBotMessage(chatId, 'Supabase ulanmagan.');
    const { data, error } = await supabase.from('leads').select('chat_id, username, first_name, stage, paused, final_stopped, updated_at').order('updated_at', { ascending: false }).limit(10);
    if (error) return sendBotMessage(chatId, 'Status olishda xato.');
    const lines = (data || []).map(x => `${x.chat_id} @${x.username || '-'} ${x.first_name || ''}\nstage: ${x.stage}, paused: ${x.paused}, stopped: ${x.final_stopped}`).join('\n\n');
    await sendBotMessage(chatId, lines || 'Hali chat yo‘q.');
    return;
  }

  if (text.startsWith('/pausechat') || text.startsWith('/stopchat')) {
    const id = text.split(/\s+/)[1];
    if (!id) return sendBotMessage(chatId, 'Format: /pausechat CHAT_ID');
    await saveLead({ chat_id: id, paused: true, final_stopped: true, stage: 'manual_paused' });
    await sendBotMessage(chatId, `✅ ${id} chatida bot to‘xtatildi.`);
    return;
  }

  if (text.startsWith('/unpausechat') || text.startsWith('/resumechat')) {
    const id = text.split(/\s+/)[1];
    if (!id) return sendBotMessage(chatId, 'Format: /unpausechat CHAT_ID');
    await saveLead({ chat_id: id, paused: false, final_stopped: false, stage: 'new' });
    await sendBotMessage(chatId, `✅ ${id} chatida bot qayta yoqildi.`);
    return;
  }

  if (text.startsWith('/addrule')) {
    if (!supabase) return sendBotMessage(chatId, 'Supabase ulanmagan.');
    const rest = text.replace('/addrule', '').trim();
    const parts = rest.split('|').map(s => s.trim());
    if (parts.length < 2) return sendBotMessage(chatId, 'Format: /addrule phrase | template_key | new_stage | stop');
    const [phrase, template_key, new_stageRaw, stopRaw] = parts;
    const new_stage = new_stageRaw || null;
    const stop_after = ['stop', 'true', '1', 'yes'].includes(normalize(stopRaw || ''));
    const { error } = await supabase.from('custom_rules').insert({ phrase, template_key, new_stage, stop_after, is_active: true });
    await sendBotMessage(chatId, error ? '❌ Rule saqlanmadi.' : '✅ Rule qo‘shildi.');
    return;
  }

  if (text.startsWith('/rules')) {
    if (!supabase) return sendBotMessage(chatId, 'Supabase ulanmagan.');
    const { data, error } = await supabase.from('custom_rules').select('*').order('id', { ascending: true });
    if (error) return sendBotMessage(chatId, 'Rule olishda xato.');
    const lines = (data || []).map(r => `${r.id}. "${r.phrase}" → ${r.template_key}${r.new_stage ? ` → ${r.new_stage}` : ''}${r.stop_after ? ' STOP' : ''}${r.is_active ? '' : ' OFF'}`).join('\n');
    await sendBotMessage(chatId, lines || 'Rule yo‘q.');
    return;
  }

  if (text.startsWith('/delrule')) {
    if (!supabase) return sendBotMessage(chatId, 'Supabase ulanmagan.');
    const id = text.split(/\s+/)[1];
    if (!id) return sendBotMessage(chatId, 'Format: /delrule ID');
    const { error } = await supabase.from('custom_rules').update({ is_active: false }).eq('id', id);
    await sendBotMessage(chatId, error ? '❌ O‘chirilmadi.' : '✅ Rule o‘chirildi.');
    return;
  }
}

async function handleBusinessMessage(msg) {
  if (!AUTO_REPLY_ENABLED) return;
  const chatId = String(msg.chat?.id || '');
  const businessConnectionId = msg.business_connection_id;
  const text = msg.text || msg.caption || '';
  if (!chatId || !businessConnectionId || !text) return;

  const from = msg.from || {};
  const existing = await getLead(chatId);

  // Siz lidga birinchi yozganingizda bot javob bermaydi, faqat chat ochilganini eslab qoladi.
  if (isOwnerMessage(msg)) {
    await saveLead({
      chat_id: chatId,
      business_connection_id: businessConnectionId,
      stage: existing.stage && existing.stage !== 'new' ? existing.stage : 'outreach_sent',
      paused: existing.paused || false,
      final_stopped: existing.final_stopped || false,
      last_message: text
    });
    return;
  }

  const lead = {
    ...existing,
    chat_id: chatId,
    business_connection_id: businessConnectionId,
    username: from.username || existing.username || null,
    first_name: from.first_name || existing.first_name || null,
    last_name: from.last_name || existing.last_name || null
  };

  if (lead.paused || lead.final_stopped) return;

  const decision = await decideReply(lead, text);
  const body = await getTemplate(decision.templateKey);

  await saveLead({
    chat_id: chatId,
    business_connection_id: businessConnectionId,
    username: lead.username,
    first_name: lead.first_name,
    last_name: lead.last_name,
    stage: decision.newStage || lead.stage || 'new',
    paused: decision.stopAfter ? true : false,
    final_stopped: decision.stopAfter ? true : false,
    last_template: decision.templateKey,
    last_message: text
  });

  if (decision.templateKey && decision.templateKey !== 'no_reply' && body) {
    await sendBusinessMessage(businessConnectionId, chatId, body);
  }
}

app.get('/', (req, res) => res.json({ ok: true, service: 'olye-business-ai-bot', version: 'v4-strict' }));

app.get('/set-webhook', async (req, res) => {
  try {
    const secret = String(req.query.secret || '');
    if (secret !== TELEGRAM_WEBHOOK_SECRET) return res.status(403).json({ ok: false, error: 'bad secret' });
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const url = `${proto}://${host}/webhook/${TELEGRAM_WEBHOOK_SECRET}`;
    const result = await tg('setWebhook', {
      url,
      allowed_updates: ['message', 'business_connection', 'business_message', 'edited_business_message', 'deleted_business_messages'],
      drop_pending_updates: true
    });
    res.json({ ok: true, webhook: url, telegram: result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/webhook/:secret', async (req, res) => {
  res.json({ ok: true });
  try {
    if (req.params.secret !== TELEGRAM_WEBHOOK_SECRET) return;
    const update = req.body || {};

    if (update.message) await handleAdminCommand(update.message);

    if (update.business_connection) {
      await sendBotMessage(ADMIN_CHAT_ID, '✅ Telegram Business bot ulandi yoki connection yangilandi.');
    }

    if (update.business_message) await handleBusinessMessage(update.business_message);
    if (update.edited_business_message) await handleBusinessMessage(update.edited_business_message);
  } catch (e) {
    console.error('webhook error', e);
    await sendBotMessage(ADMIN_CHAT_ID, `Bot xato: ${e.message}`);
  }
});

app.listen(PORT, () => console.log(`OLYE Business AI Bot v4 running on port ${PORT}`));
