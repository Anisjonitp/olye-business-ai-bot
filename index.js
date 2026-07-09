import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_TEMPLATES, templateListForPrompt, renderTemplate } from './templates.js';

const {
  BOT_TOKEN,
  ADMIN_CHAT_ID,
  BUSINESS_OWNER_ID,
  TELEGRAM_WEBHOOK_SECRET,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY,
  OPENAI_MODEL = 'gpt-4.1-mini',
  AUTO_REPLY_ENABLED = 'true',
  MANUAL_PAUSE_MINUTES = '30',
  MAX_REPLY_CHARS = '900'
} = process.env;

if (!BOT_TOKEN) throw new Error('BOT_TOKEN is missing');
if (!SUPABASE_URL) throw new Error('SUPABASE_URL is missing');
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing');

const app = express();
app.use(express.json({ limit: '2mb' }));

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const tg = async (method, payload) => {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    console.error('Telegram API error', method, data);
    throw new Error(data?.description || `Telegram API failed: ${method}`);
  }
  return data.result;
};

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const userLabel = (from = {}) => {
  const username = from.username ? `@${from.username}` : '';
  const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ');
  return username || fullName || String(from.id || 'unknown');
};

const buildLead = (chat, from, businessConnectionId) => ({
  chat_id: String(chat.id),
  business_connection_id: businessConnectionId || null,
  telegram_user_id: from?.id ? String(from.id) : null,
  username: from?.username || null,
  full_name: [from?.first_name, from?.last_name].filter(Boolean).join(' ') || null,
  updated_at: new Date().toISOString()
});

async function getLead(chatId) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('chat_id', String(chatId))
    .maybeSingle();

  if (error) {
    console.error('Supabase getLead error', error);
    return null;
  }
  return data;
}

async function upsertLead(baseLead, patch = {}) {
  const { data, error } = await supabase
    .from('leads')
    .upsert({ ...baseLead, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' })
    .select()
    .single();

  if (error) {
    console.error('Supabase upsertLead error', error);
    return null;
  }
  return data;
}

async function pauseLead(chatId, minutes = Number(MANUAL_PAUSE_MINUTES || 30)) {
  const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('leads')
    .update({ bot_paused_until: until, updated_at: new Date().toISOString() })
    .eq('chat_id', String(chatId));
  if (error) console.error('Supabase pauseLead error', error);
}

function isPaused(lead) {
  if (!lead?.bot_paused_until) return false;
  return new Date(lead.bot_paused_until).getTime() > Date.now();
}

async function sendBusinessMessage(chatId, businessConnectionId, text) {
  const trimmed = text.slice(0, Number(MAX_REPLY_CHARS || 900)).trim();
  if (!trimmed) return;

  return tg('sendMessage', {
    chat_id: chatId,
    business_connection_id: businessConnectionId,
    text: trimmed,
    disable_web_page_preview: true
  });
}

async function sendAdmin(text) {
  if (!ADMIN_CHAT_ID) return;
  try {
    await tg('sendMessage', {
      chat_id: ADMIN_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
  } catch (e) {
    console.error('sendAdmin failed', e.message);
  }
}

async function getTemplate(templateKey) {
  const safeKey = DEFAULT_TEMPLATES[templateKey] ? templateKey : 'unknown';

  try {
    const { data, error } = await supabase
      .from('reply_templates')
      .select('key,text')
      .eq('key', safeKey)
      .maybeSingle();

    if (!error && data?.text) {
      return { ...DEFAULT_TEMPLATES[safeKey], text: data.text, key: safeKey };
    }
  } catch (e) {
    console.error('getTemplate failed:', e.message);
  }

  return { ...DEFAULT_TEMPLATES[safeKey], key: safeKey };
}

async function listTemplatesText() {
  const lines = ['Shablonlar ro‘yxati:'];
  for (const [key, value] of Object.entries(DEFAULT_TEMPLATES)) {
    lines.push(`${key} — ${value.title}`);
  }
  return lines.join('\n');
}

async function setTemplateText(key, text) {
  if (!DEFAULT_TEMPLATES[key]) {
    return { ok: false, error: `Bunday shablon kaliti yo‘q: ${key}` };
  }
  const { error } = await supabase
    .from('reply_templates')
    .upsert({ key, text, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function analyzeIntentOnly({ text, lead, from }) {
  const currentStatus = lead?.lead_status || 'new';

  const systemPrompt = `
Sen Telegram Business profil uchun klassifikator yordamchisan.
Vazifa: foydalanuvchi xabarini tushunib, faqat mos shablon kalitini tanlash.

JUDA MUHIM:
- Foydalanuvchiga yuboriladigan javob yozma.
- Erkin matn yaratma.
- Faqat quyidagi shablonlardan bittasini tanla.
- Qo‘shimcha savol bo‘lsa ham, eng yaqin shablonni tanla. Agar aniq javob yo‘q bo‘lsa, asks_human yoki unknown tanla.
- To‘lovga tayyor, operator kerak, odam bilan gaplashmoqchi bo‘lsa should_notify_admin=true qil.

Mavjud shablonlar:
${templateListForPrompt()}

JSON qaytar:
{
  "template_key": "greeting|application_yes|application_no|needs_info|asks_price|wants_to_pay|trust_objection|certificate_question|search_visibility|payment_method|later|not_interested|asks_human|bot_question|off_topic|unknown",
  "intent": "qisqa_intent_nomi",
  "lead_status": "new|qualified|needs_info|price_asked|hot|not_interested|human_needed",
  "should_notify_admin": true/false,
  "should_pause_bot": true/false
}`.trim();

  const userPrompt = `
Joriy lead status: ${currentStatus}
Foydalanuvchi: ${userLabel(from)}
Xabar: ${text}
JSON qaytar.
`.trim();

  try {
    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0
    });

    const raw = response.output_text?.trim() || '';
    const jsonText = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(jsonText);
    const templateKey = DEFAULT_TEMPLATES[parsed.template_key] ? parsed.template_key : fallbackTemplateKey(text, currentStatus);
    const template = await getTemplate(templateKey);

    return {
      intent: parsed.intent || templateKey,
      lead_status: parsed.lead_status || template.lead_status || currentStatus,
      template_key: templateKey,
      reply: renderTemplate(template.text, { username: from?.username ? `@${from.username}` : '', full_name: [from?.first_name, from?.last_name].filter(Boolean).join(' ') }),
      should_notify_admin: Boolean(parsed.should_notify_admin || template.notify_admin),
      should_pause_bot: Boolean(parsed.should_pause_bot || template.pause_bot)
    };
  } catch (e) {
    console.error('OpenAI classify failed:', e.message);
    const templateKey = fallbackTemplateKey(text, currentStatus);
    const template = await getTemplate(templateKey);
    return {
      intent: templateKey,
      lead_status: template.lead_status || currentStatus,
      template_key: templateKey,
      reply: renderTemplate(template.text, { username: from?.username ? `@${from.username}` : '', full_name: [from?.first_name, from?.last_name].filter(Boolean).join(' ') }),
      should_notify_admin: Boolean(template.notify_admin),
      should_pause_bot: Boolean(template.pause_bot)
    };
  }
}

function fallbackTemplateKey(text, currentStatus) {
  const t = String(text || '').toLowerCase();

  if (/botmisan|botmisiz|robot|avto/i.test(t)) return 'bot_question';
  if (/operator|odam|inson|admin|menejer|bog.?lan/i.test(t)) return 'asks_human';
  if (/sertifikat|certificate/i.test(t)) return 'certificate_question';
  if (/google|qidiruv|internet|ai|chatgpt|ko.?rin/i.test(t)) return 'search_visibility';
  if (/karta|plastik|to.?lov|tolov qil|pul o.?tkaz|chek/i.test(t)) return 'payment_method';
  if (/narx|qancha|pul|badal|to.?lov|tolov/i.test(t)) return 'asks_price';
  if (/ishon|rost|aldov|firib|kafolat|haqiq/i.test(t)) return 'trust_objection';
  if (/keyin|ertaga|o.?ylab|hozir emas/i.test(t)) return 'later';
  if (/qiziqmay|kerak emas|yoq|yo.?q|bekor/i.test(t)) return currentStatus === 'new' ? 'application_no' : 'not_interested';
  if (/^(salom|assalomu|assalom|hello|hi|va alaykum)/i.test(t)) return 'greeting';
  if (/ha|xa|mayli|qoldirgandim|ariza/i.test(t) && currentStatus === 'new') return 'application_yes';
  if (/malumot|ma.?lumot|batafsil|tushuntir|foyda/i.test(t)) return 'needs_info';

  return 'unknown';
}

async function handleAdminMessage(message) {
  const chatId = String(message.chat.id);
  const text = message.text || '';

  if (text === '/start') {
    await tg('sendMessage', {
      chat_id: message.chat.id,
      text: `Bot ishga tayyor. Sizning chat_id: ${message.chat.id}`
    });
    return;
  }

  if (ADMIN_CHAT_ID && chatId !== String(ADMIN_CHAT_ID)) return;

  if (text === '/templates') {
    await tg('sendMessage', { chat_id: message.chat.id, text: await listTemplatesText() });
    return;
  }

  if (text.startsWith('/gettemplate ')) {
    const key = text.split(/\s+/)[1];
    if (!DEFAULT_TEMPLATES[key]) {
      await tg('sendMessage', { chat_id: message.chat.id, text: `Bunday shablon yo‘q: ${key}` });
      return;
    }
    const template = await getTemplate(key);
    await tg('sendMessage', {
      chat_id: message.chat.id,
      text: `${key} — ${template.title}\n\n${template.text}`
    });
    return;
  }

  if (text.startsWith('/settemplate ')) {
    const body = text.replace('/settemplate ', '');
    const sep = body.indexOf('|');
    if (sep === -1) {
      await tg('sendMessage', {
        chat_id: message.chat.id,
        text: 'Format: /settemplate kalit | Yangi javob matni\nMasalan: /settemplate greeting | Va alaykum assalom. Ariza qoldirgandingizmi?'
      });
      return;
    }
    const key = body.slice(0, sep).trim();
    const templateText = body.slice(sep + 1).trim();
    const result = await setTemplateText(key, templateText);
    await tg('sendMessage', {
      chat_id: message.chat.id,
      text: result.ok ? `✅ ${key} shabloni yangilandi.` : `❌ ${result.error}`
    });
    return;
  }
}

async function handleBusinessMessage(message) {
  const businessConnectionId = message.business_connection_id;
  const chat = message.chat;
  const from = message.from || {};
  const text = message.text || message.caption || '';

  if (!businessConnectionId || !chat?.id || !text.trim()) return;

  // Agar biznes akkaunt egasi o'zi javob yozsa, bot shu chatda vaqtincha jim turadi.
  if (BUSINESS_OWNER_ID && String(from.id) === String(BUSINESS_OWNER_ID)) {
    await pauseLead(chat.id);
    return;
  }

  if (from.is_bot) return;
  if (AUTO_REPLY_ENABLED !== 'true') return;

  const baseLead = buildLead(chat, from, businessConnectionId);
  const existingLead = await getLead(chat.id);
  const lead = await upsertLead(baseLead, {});

  if (isPaused(existingLead || lead)) return;

  const analysis = await analyzeIntentOnly({ text, lead: existingLead || lead, from });

  await upsertLead(baseLead, {
    lead_status: analysis.lead_status,
    last_intent: analysis.intent
  });

  if (analysis.should_notify_admin || analysis.lead_status === 'hot' || analysis.lead_status === 'human_needed') {
    await sendAdmin(
      `🔥 <b>Issiq lead</b>\n` +
      `Kim: ${escapeHtml(userLabel(from))}\n` +
      `Status: ${escapeHtml(analysis.lead_status)}\n` +
      `Intent: ${escapeHtml(analysis.intent)}\n` +
      `Shablon: ${escapeHtml(analysis.template_key)}\n` +
      `Xabar: ${escapeHtml(text)}`
    );
  }

  if (analysis.should_pause_bot) {
    await pauseLead(chat.id, 60);
  }

  await sendBusinessMessage(chat.id, businessConnectionId, analysis.reply);
}

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'olye-business-ai-bot' });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/set-webhook', async (req, res) => {
  try {
    const secret = req.query.secret;
    if (!TELEGRAM_WEBHOOK_SECRET || secret !== TELEGRAM_WEBHOOK_SECRET) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const webhookUrl = `${proto}://${host}/webhook`;

    const result = await tg('setWebhook', {
      url: webhookUrl,
      allowed_updates: ['business_connection', 'business_message', 'edited_business_message', 'message'],
      secret_token: TELEGRAM_WEBHOOK_SECRET
    });

    res.json({ ok: true, webhookUrl, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/webhook', async (req, res) => {
  try {
    if (TELEGRAM_WEBHOOK_SECRET) {
      const headerSecret = req.get('x-telegram-bot-api-secret-token');
      if (headerSecret !== TELEGRAM_WEBHOOK_SECRET) {
        return res.status(403).json({ ok: false });
      }
    }

    const update = req.body;

    if (update.business_connection) {
      await sendAdmin('✅ Telegram Business bot ulandi yoki connection yangilandi.');
    }

    if (update.business_message) {
      await handleBusinessMessage(update.business_message);
    }

    // Botning o'ziga yoziladigan admin buyruqlar: /start, /templates, /gettemplate, /settemplate
    if (update.message?.text) {
      await handleAdminMessage(update.message);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Webhook error:', e);
    res.status(200).json({ ok: true });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`OLYE Business AI Bot running on port ${port}`);
});
