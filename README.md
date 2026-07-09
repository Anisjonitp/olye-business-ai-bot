# OLYE Business AI Bot v5 Lite

Telegram Business profilingiz nomidan yangi lidlarni **biografik savollargacha** olib keladigan sodda bot.

Bot CRM emas. Vazifasi bitta: lidni tartibli savdo oqimidan olib o‘tib, bio savollarni yuborish. Bio savollardan keyin bot o‘sha chatda to‘xtaydi, qolganini o‘zingiz qo‘lda davom ettirasiz.

## Asosiy mantiq

1. Siz Telegramda odamga birinchi yozasiz: `Assalomu alaykum, yaxshimisiz?`
2. Agar chat DB’da yo‘q bo‘lsa, default rejimda bot mijozga ham, admin chatga ham javob yubormaydi.
3. Chat `/menu → 🆕 Tasdiq kutayotganlar` ichiga tushadi.
4. Yangi lid bo‘lsa `▶️ Oqimni boshlash` bosasiz.
5. Eski chat bo‘lsa `🔕 O‘chirish` bosasiz.
6. Bot ariza/qiziqish, ma’lumot, oferta, maqola taklifi va bio savollarni bosqichma-bosqich yuboradi.
7. Bio savollar yuborilgach bot to‘xtaydi.

## Muhim imkoniyatlar

- `silent_queue`: yangi/aniqlanmagan chatlar adminni spam qilmaydi.
- AI intent: “instagramda qoldirdim”, “do‘stim aytdi”, “yozgandim” kabi g‘alati javoblarni tushunadi.
- Stage sistemi: “ha” har bosqichda to‘g‘ri talqin qilinadi.
- AI tushunmasa: mijozga xato javob yubormaydi, oldingi stage saqlanadi va `⚠️ AI tushunmaganlar` ro‘yxatiga tushadi.
- Rad javob: “kerak emas”, “qiziq emas” desa bot yumshoq yakunlaydi va to‘xtaydi.
- Keyinroq: “hozir bandman”, “keyinroq” desa bot keyinroqqa qo‘yadi.
- Narx savoli: “narxi qancha?”, “pullikmi?” desa tayyor shablondan javob beradi.
- Duplicate protection: bir xil Telegram message qayta kelsa, bot ikki marta javob bermaydi.
- Admin tugmali panel: ro‘yxatlar, lid kartochkasi, shablon tahrirlash.

## Fayllar

```text
index.js          Asosiy bot kodi
package.json      Render uchun Node sozlamalari
.env.example      Environment variables namunasi
supabase.sql      Supabase jadvallar va boshlang‘ich shablonlar
.gitignore
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

Render → Environment bo‘limiga quyidagilarni qo‘shing:

```text
BOT_TOKEN=
ADMIN_CHAT_ID=
OWNER_TELEGRAM_ID=
WEBHOOK_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
AI_CONFIDENCE_MIN=0.65
FIRST_CONTACT_MODE=silent_queue
WEBHOOK_URL=https://your-render-service.onrender.com/webhook
```

`FIRST_CONTACT_MODE=silent_queue` tavsiya qilinadi. Bu eski chatlarni adashtirib yubormaslik va adminni spam qilmaslik uchun eng xavfsiz rejim.

## Supabase

Supabase → SQL Editor’da `supabase.sql` faylini to‘liq ishlating.

Agar oldin `admin_sessions` schema xatosi chiqqan bo‘lsa, bu SQL uni tuzatadi, chunki `admin_sessions` jadvali qayta yaratiladi.

## Webhook ulash

Render deploy bo‘lgandan keyin brauzerda oching:

```text
https://SENING-RENDER-URL.onrender.com/set-webhook
```

Tekshirish:

```text
https://SENING-RENDER-URL.onrender.com/webhook-info
```

Sog‘lik tekshiruvi:

```text
https://SENING-RENDER-URL.onrender.com/health
```

## Admin menyu

Telegramda admin chatdan botga yuboring:

```text
/menu
```

Menyu bo‘limlari:

```text
📊 Hisobot
🆕 Tasdiq kutayotganlar
🟢 Faol lidlar
🟡 Chala lidlar
⚠️ AI tushunmaganlar
✅ Savollargacha yetganlar
✏️ Shablonlar
⚙️ Yordam
```

Har bir lid kartochkasida:

```text
▶️ Oqimni boshlash
⏸ To‘xtatish
🔁 Qayta boshlash
🔔 Yoqish
🔕 O‘chirish
📌 Yangilash
```

AI tushunmagan lidda qo‘shimcha:

```text
✅ Ha deb davom ettirish
❌ Yo‘q/to‘xtatish
```

## Asosiy buyruqlar

```text
/menu
/report
/pending
/active
/stalled
/needsadmin
/reached
/templates
/gettemplate key
/settemplate key yangi matn
/status chat_id
/leadson chat_id
/leadsoff chat_id
/restart chat_id
```

## Shablon keylari

```text
ask_application
ask_info
short_intro
full_intro
offer_end
ask_bio_confirm
bio_questions
price_reply
later_reply
reject_reply
```

## AI nima qiladi?

AI mijozga erkin matn yozmaydi. Faqat quyidagi intentlardan birini aniqlaydi:

```text
greeting_positive
application_confirmed
application_denied
has_info
no_info
ok_wait
read_offer
agree_bio
reject
later
price_question
unclear
```

Javoblar faqat Supabase’dagi `reply_templates` jadvalidan chiqadi.

## v5 Lite smart-intent fix

Bu versiyada oddiy `yo‘q` endi hamma joyda rad javob deb olinmaydi. Bot `stage` bo‘yicha talqin qiladi:

```text
asked_info + "yo‘q"       => no_info => full_intro yuboriladi
asked_application + "yo‘q" => application_denied => yumshoq to‘xtaydi
asked_bio_confirm + "yo‘q" => reject => yumshoq to‘xtaydi
```

Ya’ni `Siz ma’lumotga egamisiz?` savolidan keyin odam `yo‘q` desa, bot savdoni yopmaydi, aksincha to‘liq ma’lumot yuboradi.

Admin test buyrug‘i:

```text
/testintent asked_info yo‘q
/testintent asked_application instagramda qoldirdim
/testintent asked_bio_confirm ha yozing
```
