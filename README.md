# OLYE Business AI Bot v5 Lite

Telegram Business profilingiz nomidan yangi lidlarni biografik savollargacha olib boradigan nazoratli AI bot.

## Eng muhim yangiliklar

- AI noaniq/g‘alati gaplarga tabiiy, muloyim ko‘prik javob yozadi va yana shablonga qaytaradi.
- Narx/karta/qimmat kabi yon savollar asosiy ketma-ketlikni buzmaydi.
- `full_intro + offer_end` kabi 2 xabarli javoblar bitta paket sifatida yuboriladi va takrorlanmaydi.
- `message_id`, `chat_lock`, `response_package`, `sent_bot_messages` orqali duplicate himoya bor.
- `biroz` = qisman ma’lumot bor deb tushuniladi, `birozdan keyin` = keyinroq.
- Ovozli/rasm/sticker/fayl kelsa, bot matn ko‘rinishida javob so‘raydi.
- Salomdan keyin birinchi savol doim aynan `ask_application` shablonidan ketadi; AI bu joyda `Aniqlashtirib olay...` deb almashtirmaydi.
- `asked_application` bosqichida oddiy “yo‘q” desa ham ariza havolasini yuboradi.
- “Yo‘q, qoldirmaganman” yoki “qoldirmoqchiman, bilmayman” desa, ariza havolasini yuboradi.
- `offer_end` yuborilgandan keyin 1 soat ichida “tanishdim” demasa, bot bir marta `offer_followup` eslatmasini yuboradi.
- Outreach Auto rejimi: siz yuborgan “Assalomu alaykum...” salomlarni eslab, faqat o‘sha chatlardan kelgan javoblarni avto start qiladi.
- Auto Topic: siz qo‘lda yuborgan xabar mazmunidan bot chat stage’ini tushunadi. Masalan qo‘lda oferta yuborsangiz, keyingi javobni `waiting_offer_read` deb davom ettiradi.
- Bir xil qaytaruvchi javob 10 daqiqa ichida takror yuborilmaydi.
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
AUTO_TOPIC_FROM_OUTGOING=true
OFFER_FOLLOWUP_MS=3600000
FOLLOWUP_TICK_MS=300000
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


## Auto Topic — biz yozgan xabardan stage aniqlash

Agar Telegram Business bot outgoing xabarlarni ko‘rsa, admin/Business profil egasi yozgan xabar mazmuniga qarab chat mavzusi avtomatik saqlanadi.

Misollar:

- Siz qo‘lda `Siz “O‘zbekiston Lider Yoshlari Ensiklopediyasi”ga kirish uchun ariza qoldirgansiz. Shunaqami?` yuborsangiz, bot `stage=asked_application` deb eslab qoladi.
- Siz qo‘lda oferta yoki `Oferta va xabar bilan tanishib chiqing...` yuborsangiz, bot `stage=waiting_offer_read` deb davom ettiradi va 1 soatlik follow-upni belgilaydi.
- Siz qo‘lda bio savollarni yuborsangiz, bot shu chatda to‘xtaydi.

Bu funksiya shablonlarni o‘zgartirmaydi. Faqat `business_leads` ichida chat stage’ini yangilaydi.

Render env:

```env
AUTO_TOPIC_FROM_OUTGOING=true
```

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


## Oferta follow-up

Bot `full_intro + offer_end` yoki `short_intro + offer_end` yuborgandan keyin `offer_followup_due_at` ni 1 soat keyinga belgilaydi.

Agar lid shu vaqt ichida `tanishdim`, `o‘qidim`, `ko‘rib chiqdim` demasa va stage hali `waiting_offer_read` bo‘lsa, bot bir marta yuboradi:

```text
Tanishib chiqdingizmi? Biz sizni kutyapmiz.
```

`ho‘p`, `mayli`, `ok` kabi javoblar reminder’ni bekor qilmaydi. Eslatma faqat bir marta yuboriladi.

Tashqi cron ishlatmoqchi bo‘lsangiz, har 5 daqiqada shu endpointni chaqiring:

```text
https://YOUR-RENDER-URL.onrender.com/tick
```

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


## Smart Resume va Manual Admin Sync

- Admin paneldagi `🤖 Mos joydan davom ettirish` tugmasi endi suhbatni boshidan boshlamaydi. Bot oxirgi admin xabari, oxirgi lid javobi va stage bo‘yicha mos joydan davom etadi.
- Agar admin botdan tezroq loyiha ma’lumoti, oferta, karta yoki ariza linkini qo‘lda yuborsa, bot shu xabarni qayta yubormaydi.
- `ADMIN_TAKEOVER_PAUSE_MS=60000` vaqtida admin qo‘lda yuborgan ma’lumotdan keyin bot shu chatga ehtiyotkorlik bilan aralashmaydi; lekin `tanishdim`, `savollarni yuboring`, `to‘lov qildim` kabi kuchli signal bo‘lsa davom etadi.
- `MANUAL_TOPIC_COOLDOWN_MS=600000` admin qo‘lda narx/karta/qimmat mavzusiga javob bergan bo‘lsa, bot shu mavzuni 10 daqiqa ichida qayta yubormaydi.
- `SIDE_ACTION_COOLDOWN_MS=1800000` narx/karta/qimmat kabi side-question javoblari 30 daqiqa ichida qayta ketmasin.
- `SIDE_QUESTION_GRACE_MS=12000` narx/karta/qimmat so‘ralganda bot 12 soniya kutadi; admin shu orada qo‘lda javob bersa, bot takrorlamaydi.
- Supabase SQL eski tahrirlangan shablonlarni overwrite qilmaydi: template seedlar `ON CONFLICT DO NOTHING` bilan kiritilgan.

## Super AI Guard

Yangi himoya qatlami qo‘shildi:

- AI qaror chiqargandan keyin ham kod `Super AI Guard` orqali tekshiradi.
- Narx, karta, qimmat, ma’lumot, oferta, ariza havolasi, bio savollar kabi muhim mavzular `topic` sifatida nazorat qilinadi.
- Bir mavzu yaqinda admin yoki bot tomonidan yuborilgan bo‘lsa, bot shu mavzuni qayta yubormaydi.
- Har bir lid kartochkasida mini audit ko‘rinadi: oxirgi intent, stage, yuborilgan topic va skip sabablari.
- `👤 Admin oldi` tugmasi chatni odamga o‘tkazadi va botni jim qiladi.
- `🤖 Bot davom etsin` tugmasi botni qayta yoqadi.

Muhim: 100% xatosiz AI bo‘lmaydi, lekin bu guard bot xato qilishga yaqinlashsa ham xabarni mijozga yubormaslikka harakat qiladi.

Tavsiya etilgan yangi env qiymatlar:

```env
SUPER_AI_GUARD_ENABLED=true
SUPER_AI_CONTEXT_LIMIT=20
TOPIC_COOLDOWN_MS=1800000
ADMIN_ACTIVITY_SUPPRESS_MS=120000
```
