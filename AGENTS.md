# AGENTS.md — OLYE Telegram Business Bot

This repository is a Render-hosted Node.js Telegram Business bot for “O‘zbekiston Lider Yoshlari Ensiklopediyasi”.

## Golden rules

1. Do not remove existing production features while adding a patch.
2. This is an **Info Only** bot. Do not add AI sales conversation unless the user explicitly asks.
3. The bot must only continue the fixed flow:
   - outreach/context detected
   - ask application confirmation
   - ask whether the lead has info
   - send info + offer
   - stop and hand off to admin
4. Do not automatically answer price, card/payment, check, or bio questions after the offer. Detect/report where needed, but do not continue sales by yourself.
5. Keep database migrations safe. Never drop tables or delete production leads in `supabase.sql` unless explicitly requested.
6. Reply template inserts must preserve edited templates. Use `ON CONFLICT (key) DO NOTHING`.
7. Keep Render routes working:
   - `GET /`
   - `GET /health`
   - `GET /set-webhook`
   - `GET /webhook-info`
   - `POST /webhook`
8. Keep Telegram allowed updates including:
   - `message`
   - `callback_query`
   - `business_message`
   - `business_connection`
9. Always run `npm run check` before finalizing.
10. If you change environment variables, update `.env.example` and `README.md`.

## Current important features to preserve

- `/menu`
- `/auto 1h`, `/auto 2h`, `/auto 3h`, `/auto today`
- `/autooff`
- `/autostatus`
- `/setdaily 07:00 2h`
- `/dailyoff`
- `/dailystatus`
- `/tick`
- `/report`
- `/pending`
- `/healthtemplates`
- `/whoami`
- `/gettemplate key`
- `/settemplate key text`
- `/leadsoff CHAT_ID`
- `/leadson CHAT_ID`
- `/reset CHAT_ID`
- `/resetme`
- `/status CHAT_ID`
- Context Resume: continue from admin’s earlier message when scheduled outreach was not detected.
- Daily Auto Outreach timer.
- No-outreach warning after configured minutes.
- End-of-session report.
- Lists: info sent, tanishdim, payment-near, reminders.
- Safe reminder preview + confirm before bulk sending.

## Test commands

```bash
npm install
npm run check
```

This project has no test suite yet. `npm run check` is mandatory.

## Deployment notes

Runtime: Node.js.
Host: Render.
Database: Supabase.
Telegram: Bot API + Business/Secretary bot connection.

Do not commit real secrets. Use `.env.example` for placeholders only.

## Database rules

When adding columns:

```sql
ALTER TABLE table_name ADD COLUMN IF NOT EXISTS column_name type;
```

When adding templates:

```sql
INSERT INTO reply_templates (key, body) VALUES (...)
ON CONFLICT (key) DO NOTHING;
```

Do not overwrite edited templates with `DO UPDATE` unless the task explicitly says so.

## Style

- Keep code simple and deterministic.
- Prefer small helper functions.
- Log decisions with `lead_events` when helpful.
- Avoid adding OpenAI/API dependencies unless explicitly requested.
- Do not convert this bot into a free-form AI chatbot.
