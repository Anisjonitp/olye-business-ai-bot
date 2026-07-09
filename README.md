# OLYE Business AI Bot v5 Lite

Telegram Business profilingiz nomidan yangi lidlarni biografik savollargacha olib boradigan nazoratli AI bot.

## Eng muhim yangiliklar

- AI noaniq/g‘alati gaplarga tabiiy, muloyim ko‘prik javob yozadi va yana shablonga qaytaradi.
- Narx/karta/qimmat kabi yon savollar asosiy ketma-ketlikni buzmaydi.
- `full_intro + offer_end` kabi 2 xabarli javoblar bitta paket sifatida yuboriladi va takrorlanmaydi.
- `message_id`, `chat_lock`, `response_package`, `sent_bot_messages` orqali duplicate himoya bor.
- `biroz` = qisman ma’lumot bor deb tushuniladi, `birozdan keyin` = keyinroq.
- Ovozli/rasm/sticker/fayl kelsa, bot matn ko‘rinishida javob so‘raydi.
- “Yo‘q, qoldirmaganman” yoki “qoldirmoqchiman, bilmayman” desa, ariza havolasini yuboradi.
- Outreach Auto rejimi: siz yuborgan “Assalomu alaykum...” salomlarni eslab, faqat o‘sha chatlardan kelgan javoblarni avto start qiladi.
- Admin panelda bulk clear: tasdiq kutayotganlarni bitta tugma bilan disabled qilish mumkin.
- SQL endi eski tahrirlangan shablonlarni overwrite qilmaydi.

## Fayllar

```text
index.js
package.json
.env.example
supabase.sql
README.md
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

`.env.example` ichidagi qiymatlarni Render → Environment Variables bo‘limiga kiriting.

Eng muhimlari:

```env
BOT_TOKEN=
ADMIN_CHAT_ID=
OWNER_TELEGRAM_ID=
BUSINESS_OWNER_ID=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
WEBHOOK_SECRET=
FIRST_CONTACT_MODE=silent_queue
APPLICATION_LINK=https://...
MESSAGE_BUFFER_MS=7000
TURN_COOLDOWN_MS=12000
CHAT_LOCK_MS=30000
AUTO_START_REQUIRE_OUTREACH=true
```

`BUSINESS_OWNER_ID`ni olish uchun botga admin chatdan yozing:

```text
/whoami
```

## Supabase yangilash

Supabase SQL Editor’da `supabase.sql`ni ishlating.

Muhim: bu SQL eski lidlar va tahrirlangan shablonlarni o‘chirmaydi. Template insertlari:

```sql
on conflict (key) do nothing
```

shuning uchun siz avval `/settemplate` orqali tahrirlagan matnlar saqlanadi. Faqat yangi yetishmayotgan shablonlar qo‘shiladi.

Agar qaysi shablon yetishmayotganini ko‘rmoqchi bo‘lsangiz:

```text
/healthtemplates
```

## Webhook

Render deploy bo‘lgandan keyin brauzerda oching:

```text
https://YOUR-RENDER-URL.onrender.com/set-webhook
```

Tekshirish:

```text
https://YOUR-RENDER-URL.onrender.com/webhook-info
```

## Admin menyu

```text
/menu
```

Menyuda shular bor:

- 📊 Hisobot
- 🆕 Tasdiq kutayotganlar
- 🟢 Faol lidlar
- 🟡 Chala lidlar
- ⚠️ AI/Operator
- 🔥 Issiq lidlar
- ✅ Savollargacha yetganlar
- 📣 Outreach Auto
- ✏️ Shablonlar

## Outreach Auto

Ertalab lidlarga o‘zingiz yozasiz:

```text
Assalomu alaykum Anisjon yaxshimisiz?
```

Keyin botda:

```text
/auto 2h
```

yoki menyudan `📣 Outreach Auto → 2 soat` bosasiz.

Bot Telegram Business outgoing xabarlarni ko‘rsa, siz yuborgan salomlarni `outreach_sent` deb belgilaydi. Keyin faqat shu chatlardan javob kelsa, bot avtomatik oqimni boshlaydi.

Agar Telegram outgoing xabarlarni bermasa va vaqtli auto start xohlasangiz, Render’da:

```env
AUTO_START_REQUIRE_OUTREACH=false
```

qilsa bo‘ladi. Lekin xavfsizlik uchun default `true`.

Buyruqlar:

```text
/auto 1h
/auto 2h
/auto 3h
/auto today
/autooff
/autostatus
```

## Ariza qoldirmagan holati

Agar bot so‘rasa:

```text
Siz ariza qoldirgansiz. Shunaqami?
```

Lid:

```text
Yo‘q, qoldirmaganman
Qoldirmoqchiman, lekin qanday qilishni bilmayman
```

desa, bot `application_link_reply` shablonini yuboradi va `waiting_application_submit` stage’ga o‘tadi.

Lid keyin:

```text
ariza qoldirdim
qoldirdim
yubordim
```

desa, bot keyingi savolga o‘tadi.

## Shablonlar overwrite bo‘lmasligi

Avvalgi versiyada `supabase.sql` template body’larni qayta yozib yuborishi mumkin edi. Hozir tuzatildi.

Endi:

- yangi shablon bo‘lsa qo‘shiladi;
- eski shablon bo‘lsa o‘zgarmaydi;
- tahrirlash faqat `/settemplate` yoki admin tugma orqali bo‘ladi.

## Kerakli buyruqlar

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
/settemplate key matn
/status chat_id
/leadson chat_id
/leadsoff chat_id
/restart chat_id
/healthtemplates
```

## Eslatma

AI muhim faktlarni o‘zidan yozmaydi: narx, karta, oferta, ariza havolasi va bio savollar shablondan olinadi. Noaniq gaplarda esa faqat qisqa ko‘prik javob yozadi va suhbatni asosiy oqimga qaytaradi.
