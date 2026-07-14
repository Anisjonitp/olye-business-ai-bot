# Useful Codex prompts for this bot

Use these prompts in Codex when editing the repository.

## Safe bug fix prompt

Fix the bug I describe, but preserve all existing features listed in AGENTS.md. Do not remove daily auto outreach, context resume, /resetme, lists, reminder preview, or template safety. Run `npm run check` and summarize the exact files changed.

## Add feature prompt

Add this feature: <describe feature>. Keep the bot Info Only. Do not add free-form AI replies. Update `.env.example`, `README.md`, and `supabase.sql` if needed. Use safe SQL migrations and preserve existing templates with `ON CONFLICT DO NOTHING`. Run `npm run check`.

## Review prompt

Review the current code for why Telegram scheduled/admin outreach may not be detected. Do not change code yet. Explain the exact condition paths, env variables, and likely failure points.

## Patch prompt for Context Resume

Improve Context Resume so that if an admin message previously asked “Siz ‘O‘zbekiston Lider Yoshlari Ensiklopediyasi’ga kirish uchun ariza qoldirgansiz. Shunaqami?” and the user replies with a confirmation, the bot continues to ask whether the user has info. Make the detection safe; do not trigger on a random “ha”. Preserve all features and run `npm run check`.
