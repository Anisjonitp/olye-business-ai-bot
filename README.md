# OLYE Business AI Bot v5 Lite

Bu bot Telegram Business profilingiz nomidan yangi lidlarni biografik savollargacha olib keladi.

Botning vazifasi oddiy:

1. Siz odamga Telegramda birinchi yozasiz: `Assalomu alaykum, yaxshimisiz?`
2. Odam javob bersa, bot xavfsiz rejimda avval admin chatga signal beradi.
3. Admin `✅ Oqimni boshlash` tugmasini bossa, bot savdo oqimini davom ettiradi.
4. Agar bu eski yozishma bo'lsa, admin `🔕 Eski chat / botni o'chirish` tugmasini bosadi.
5. Bot ariza, ma'lumot, oferta va maqola taklifini bosqichma-bosqich olib boradi.
6. Biografik savollar yuborilgach bot shu chatda to'xtaydi.
7. Qolgan ishlarni o'zingiz qo'lda davom ettirasiz.

## Fayllar

```text
index.js          Asosiy bot kodi
package.json      Render uchun Node sozlamalari
.env.example      Environment variables namunasi
supabase.sql      Supabase jadvallar va boshlang'ich shablonlar
```

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

Render → Environment bo'limiga quyidagilarni qo'shing:

```text
BOT_TOKEN=
ADMIN_CHAT_ID=
OWNER_TELEGRAM_ID=
WEBHOOK_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
FIRST_CONTACT_MODE=approval
```

`OWNER_TELEGRAM_ID` ixtiyoriy, lekin xavfsizlik uchun qo'ygan yaxshi.

## Supabase

1. Supabase loyihangizga kiring.
2. SQL Editor'ni oching.
3. `supabase.sql` ichidagi kodni to'liq ishlating.

## Webhook ulash

Render saytingiz URL'i masalan shunday bo'lsa:

```text
https://olye-business-ai-bot.onrender.com
```

Webhook URL:

```text
https://olye-business-ai-bot.onrender.com/webhook
```

Telegram webhook o'rnatish:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url":"https://olye-business-ai-bot.onrender.com/webhook",
    "secret_token":"WEBHOOK_SECRET_BU_YERGA",
    "allowed_updates":["message","callback_query","business_message"]
  }'
```

`<BOT_TOKEN>` va `WEBHOOK_SECRET_BU_YERGA` joylariga o'zingiznikini yozing.



## Eski chatlar xavfsizligi

Telegram Business bot eski yozishmalar tarixini avtomatik ko'ra olmaydi. Shuning uchun DB'da yo'q chat birinchi marta yozsa, bot uni yangi lid deb darrov boshlamaydi.

Default sozlama:

```text
FIRST_CONTACT_MODE=approval
```

Bu rejimda:

```text
1. Eski yoki yangi aniqlanmagan chat yozadi.
2. Bot mijozga javob bermaydi.
3. Admin chatga xabar keladi.
4. Admin `✅ Oqimni boshlash` bossa — bot ariza shablonidan boshlaydi.
5. Admin `🔕 Eski chat / botni o'chirish` bossa — bot shu chatda jim turadi.
```

Keyinchalik hammasi toza bo'lib ketgach, avtomatik start kerak bo'lsa:

```text
FIRST_CONTACT_MODE=auto
```

lekin eski chatlar ko'p bo'lgan holatda `approval` xavfsizroq.

## Admin buyruqlar

```text
/menu — tugmali menyu
/report — hisobot
/stalled — chala lidlar
/templates — shablonlar
/gettemplate key — shablonni ko'rish
/settemplate key matn — shablonni o'zgartirish
/leadson chat_id — chatda botni yoqish
/leadsoff chat_id — chatda botni o'chirish
/status chat_id — lid holati
/discount_preview — chegirma yuborishni oldindan ko'rish
/discount_confirm ID — chegirmani tasdiqlab yuborish
/discount_cancel ID — chegirmani bekor qilish
/installment chat_id amount — bo'lib to'lashni qayd qilish
/installments_due — eslatma muddati kelgan bo'lib to'lashlar
```

## Shablon kalitlari

```text
ask_application
ask_info
short_intro
full_intro
offer_end
ask_bio_confirm
bio_questions
discount_message
```

## Muhim mantiq

AI mijozga erkin javob yozmaydi. AI faqat mijoz javobining niyatini aniqlaydi:

```text
greeting_positive
yes
has_info
no_info
ok_wait
read_offer
agree_bio
no
unclear
```

Ketma-ketlikni AI emas, Supabase'dagi `stage` ushlab turadi. Shuning uchun `ha` javobi qaysi bosqichda kelganiga qarab tushuniladi.

## Savollardan keyin

`bio_questions` yuborilgach:

```text
stage = bio_questions_sent
status = stopped
bot_enabled = false
```

Bot shu chatda to'xtaydi va sizga admin chatga signal yuboradi.
