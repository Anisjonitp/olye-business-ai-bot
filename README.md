# OLYE Telegram Business AI Bot — Free MVP

Bu loyiha Telegram Business profilingizga kelgan xabarlarni AI orqali tahlil qiladi, lekin javobni AI erkin yozmaydi. AI faqat qaysi shablon ketishini tanlaydi. Shablon matnlarini siz oldindan kiritasiz.

## Mantiq
1. Odam sizning Telegram Business profilingizga yozadi.
2. Bot xabarni oladi.
3. OpenAI xabar ma'nosini aniqlab, `template_key` tanlaydi.
4. Bot siz yozgan shablon javobni yuboradi.
5. Supabase faqat lead statusini va siz o'zgartirgan shablonlarni saqlaydi.

## 1) Supabase jadvali
Supabase → SQL Editor → `supabase/schema.sql` ichidagi kodni Run qiling.

## 2) `.env` sozlash
`.env.example` faylni `.env` qilib nusxalang va qiymatlarni qo'ying.

Kerakli qiymatlar:
- `BOT_TOKEN` — BotFather tokeni
- `ADMIN_CHAT_ID` — botga `/start` yozganingizda chiqadigan chat_id
- `BUSINESS_OWNER_ID` — sizning Telegram numeric ID'ingiz, bot siz yozganingizda jim turishi uchun
- `TELEGRAM_WEBHOOK_SECRET` — istalgan uzun maxfiy matn
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

## 3) Shablonlarni bot ichidan o'zgartirish
Botga o'zingiz Telegramdan yozasiz:

`/templates`

Shablonlar ro'yxatini ko'rsatadi.

`/gettemplate greeting`

Bitta shablon matnini ko'rsatadi.

`/settemplate greeting | Va alaykum assalom. Siz “O‘zbekiston Lider Yoshlari Ensiklopediyasi”ga kirish uchun ariza qoldirgandingizmi?`

Shablon javobini yangilaydi.

Muhim: `|` belgisidan oldin shablon kaliti, keyin esa yuboriladigan tayyor javob yoziladi.

## 4) Lokal ishga tushirish
```bash
npm install
npm run dev
```

Lokal webhook uchun ngrok kerak bo'lishi mumkin. Free MVP uchun Renderga qo'yish osonroq.

## 5) Render deploy
1. GitHub repo yarating va fayllarni push qiling.
2. Render → New → Web Service.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Environment Variables bo'limiga `.env` dagi qiymatlarni kiriting.
6. Deploy tugagach Render URL ochiladi.
7. Brauzerda quyidagini oching:

`https://YOUR-RENDER-URL.onrender.com/set-webhook?secret=TELEGRAM_WEBHOOK_SECRET`

## 6) Telegram Businessga ulash
Telegram → Settings → Telegram Business → Chatbots → bot username'ini tanlang.

## 7) Admin chat_id olish
Botga o'zingiz `/start` yozing. Bot sizga `chat_id` chiqaradi. Uni Render env ichidagi `ADMIN_CHAT_ID` va `BUSINESS_OWNER_ID` ga qo'ying.

## Eslatma
Bot o'zini inson deb yolg'on tanishtirmaydi. Agar odam botligini so'rasa, avtomatlashtirilgan yordamchi ekanini aytadi.
