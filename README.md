# OLYE Business AI CRM Bot v5

Bu versiya Telegram Business profilingizga ulangan CRM bot.

## Asosiy funksiyalar

- Tugmali admin panel: Hisobot, Lidlar, To‘lovlar, Eslatmalar, Shablonlar, Ssenariy qurish, Chek tekshirish, Maqola jarayoni, Excel.
- Faqat yangi lidlarga avtomatik javob.
- Eski lid qayta yozsa, bot javob bermaydi, admin chatga signal beradi.
- Har bir chatda botni tugma bilan yoqish/o‘chirish.
- Har bir lid uchun status: qayerda to‘xtagani aniq ko‘rinadi.
- Chala qolgan lidlarni guruhlash.
- Ommaviy chegirma yuborish: faqat admin tasdiqlasa ketadi.
- 14 kunlik bo‘lib to‘lash: boshlang‘ich to‘lov, 5/10/14-kun eslatmalar.
- Rozilik arxivi: `MEN YAKUNIY SHARTLARGA ROZIMAN` yozsa saqlanadi.
- Chek rasmini AI orqali o‘qish va admin tasdiqlashi.
- Shablonlarni tugma orqali tahrirlash.
- AI ssenariy quruvchi: oddiy tilda yangi qadam qo‘shish.
- Excel eksport.

## Render sozlamalari

Build Command:

```bash
npm install
```

Start Command:

```bash
node index.js
```

## Environment Variables

Render → Environment Variables:

```env
BOT_TOKEN=BotFather_token
ADMIN_CHAT_ID=sizning_telegram_id
BUSINESS_OWNER_ID=sizning_telegram_id
TELEGRAM_WEBHOOK_SECRET=oddiy_maxfiy_soz

SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=supabase_service_role_key

OPENAI_API_KEY=openai_api_key
OPENAI_MODEL=gpt-4.1-mini
OPENAI_VISION_MODEL=gpt-4.1-mini

AUTO_REPLY_ENABLED=true
TOTAL_AMOUNT=100000
INITIAL_PAYMENT_AMOUNT=40000
DAILY_REPORT_HOUR=21
TZ=Asia/Tashkent
```

## O‘rnatish tartibi

1. `schema.sql` ni Supabase → SQL Editor → New query → Run qiling.
2. GitHub repo rootiga fayllarni yuklang: `index.js`, `templates.js`, `package.json`, `schema.sql`, `README.md`.
3. Render’da Manual Deploy → Deploy latest commit qiling.
4. Deploy tugagach brauzerda webhook ulang:

```text
https://SIZNING-RENDER-LINK.onrender.com/set-webhook?secret=TELEGRAM_WEBHOOK_SECRET
```

5. Telegramda botning o‘ziga `/start` yozing, tugmali menyu chiqadi.
6. Telegram → Settings → Telegram Business → Chatbots ichida bot ulanganini tekshiring.

## Muhim eslatma

Chekni AI o‘qiydi, lekin pul haqiqatan tushganini 100% isbotlamaydi. Oxirgi tasdiq admin tugmasi orqali qilinadi.

Free Render servis uxlab qolishi mumkin. Eslatmalar menyuda ishlaydi; avtomatik vaqtli ishlar Render uxlab qolsa kechikishi mumkin.
