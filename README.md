# OLYE Business AI Bot v6 — Info Only

Bu versiya ataylab sodda qilingan: bot faqat yangi outreach lidga ma’lumot beradi, oferta yuboradi va shu chatda to‘xtaydi. Narx, karta, to‘lov, bio savollar va keyingi savollarga avtomatik javob bermaydi — admin qo‘lda davom ettiradi.

## Asosiy oqim

1. Admin Telegram’da lidlarga scheduled xabar yuboradi: `Assalomu alaykum, yaxshimisiz?`
2. Bot Auto Outreach rejimida admin yuborgan shu salomlarni eslab qoladi.
3. Faqat o‘sha outreach chatlardan javob kelsa bot ishlaydi.
4. Bot so‘raydi: `Siz “O‘zbekiston Lider Yoshlari Ensiklopediyasi”ga kirish uchun ariza qoldirgansiz. Shunaqami?`
5. Ha desa: `Ma’lumotga egamisiz?`
6. Ha/yo‘q javobidan keyin ma’lumot + `Oferta va xabar bilan tanishib chiqing va ayting!!!` yuboriladi.
7. Bot shu chatda to‘xtaydi.

## Yangi boshqaruv funksiyalari

- Kunlik Auto Outreach timer: masalan har kuni 07:00 da yoqiladi, 09:00 da o‘chadi.
- Bir nechta Telegram Business/admin akkaunt: har akkaunt o‘z auto outreach session, daily auto, ro‘yxat va shablonlariga ega.
- Telegram scheduled message bilan ishlash: scheduled xabarlarni 07:02 ga qo‘yish mumkin.
- 07:00–07:15 oralig‘ida outreach aniqlanmasa admin ogohlantirish oladi.
- Auto Outreach tugaganda admin chatga hisobot yuboriladi.
- Tugmali menu: Outreach, Hisobot, Ma’lumot yuborilganlar, Tanishdim, To‘lovga yaqinlar, Eslatma keraklar, Bot holati.
- Eslatma preview: bot o‘zi ommaviy yozmaydi; admin tasdiqlasa `Tanishib chiqdingizmi? Biz sizni kutyapmiz.` yuboriladi.
- Dialog arxiv: Telegram Business bot ruxsat olgan chatlarda xabar metadata, media metadata, tahrir va o‘chirish hodisalarini saqlaydi.
- `supabase.sql` eski tahrirlangan shablonlarni overwrite qilmaydi (`on conflict do nothing`).
- `/resetme`: faqat test qilayotgan shu chat/profil holatini tozalaydi, eski funksiyalarni olib tashlamaydi.
- Test mode default xavfsiz: `TEST_MODE=true` bo‘lsa avtomatik javob faqat `TEST_LEAD_IDS` ichidagi lidlarga ketadi.
- Har akkauntda Bot ON/OFF va Reach ON/OFF alohida boshqariladi.

## Render sozlamalari

Build Command:

```bash
npm install
```

Start Command:

```bash
node index.js
```

Environment Variables uchun `.env.example` fayliga qarang.

Muhim test-mode sozlamalari:

```text
TEST_MODE=true
TEST_ADMIN_IDS=8254451152,8304283149
TEST_LEAD_IDS=comma,separated,lead_chat_ids
ADMIN_TAKEOVER_MINUTES=10
```

`TEST_LEAD_IDS` bo‘sh bo‘lsa va `TEST_MODE=true` bo‘lsa, mijozlarga avtomatik javob yuborilmaydi. Admin menyusi mavjud account ownership orqali ishlaydi; `TEST_ADMIN_IDS` to‘ldirilsa, admin menyu ham shu ro‘yxat bilan cheklanadi.

## Webhook ulash

Render deploy bo‘lgach:

```text
https://YOUR-RENDER-APP.onrender.com/set-webhook
```

Basic webhook:

```text
https://YOUR-RENDER-APP.onrender.com/set-webhook-basic
```

Edit/delete arxiv update’lari uchun full webhook:

```text
https://YOUR-RENDER-APP.onrender.com/set-webhook-full
```

Tekshirish:

```text
https://YOUR-RENDER-APP.onrender.com/webhook-info
https://YOUR-RENDER-APP.onrender.com/webhook-debug
```

Platform Admin Bot alohida token bilan ulanadi:

```text
https://YOUR-RENDER-APP.onrender.com/set-admin-webhook
https://YOUR-RENDER-APP.onrender.com/admin-webhook-debug
```

Admin bot webhooki `POST /admin-webhook` route’iga keladi va faqat `PLATFORM_OWNER_IDS` yoki `platform_admins` jadvalidagi aktiv owner/adminlarga javob beradi. Tokenlar debug javoblarda ko‘rsatilmaydi; faqat mavjudligi va uzunligi chiqadi.

Scheduler uxlab qolmasligi uchun tashqi cron bilan `/tick` endpointni har 5 daqiqada chaqirish ham mumkin:

```text
https://YOUR-RENDER-APP.onrender.com/tick
```

## Asosiy admin buyruqlar

```text
/menyu
/kimman
/bekor
/menireset
/avto 2h
/avtoochir
/avtoholat
/kunliksozla 07:00 2h
/kunlikochir
/kunlikholat
/hisobot
/hisobot ACCOUNT_KEY
/kunlikhisobot ACCOUNT_KEY
/haftalikhisobot ACCOUNT_KEY
/barchahisobot
/malumot
/tanishdim
/tolov
/eslatmalar
/kutilayotgan
/diagnostika
/shablonholati
/tekshir
/akkauntlar
/akkaunt ACCOUNT_KEY
/akkauntholati
/ulanishlar
/ulanishbiriktir ACCOUNT_KEY BUSINESS_CONNECTION_ID
/akkauntsozla ACCOUNT_KEY FIELD VALUE
/sozlamasozla ACCOUNT_KEY KEY VALUE
/akkauntadmin ACCOUNT_KEY TELEGRAM_ID
/akkauntniyoq ACCOUNT_KEY
/akkauntochir ACCOUNT_KEY
/botniyoq ACCOUNT_KEY
/botniochir ACCOUNT_KEY
/reachyoq ACCOUNT_KEY
/reachochir ACCOUNT_KEY
/reach_start
/account_debug
/sozlamalar
/sozlamalar ACCOUNT_KEY
/ketmaketlik ACCOUNT_KEY
/ketmaketliksozla ACCOUNT_KEY STEP_KEY TEMPLATE_KEY NEXT_YES NEXT_NO NEXT_PARTIAL NEXT_UNKNOWN STOP_TRUE_FALSE
/ketmaketliktest ACCOUNT_KEY
/suniyintellekt yoq
/suniyintellekt ochir
/aiholati
/aiholati ACCOUNT_KEY
/aishablon TEMPLATE_KEY text
/aishablon ACCOUNT_KEY TEMPLATE_KEY text
/shablonol key
/shablonol account_key key
/shablonsozla key yangi matn
/shablonsozla account_key key yangi matn
/qoidatest ACCOUNT_KEY STEP_KEY TEXT
/aitest ACCOUNT_KEY STEP_KEY TEXT
/arxiv
/arxiv ACCOUNT_KEY
/ochirilgan
/ochirilgan ACCOUNT_KEY
/tahrirlangan
/tahrirlangan ACCOUNT_KEY
/mediaarxiv ACCOUNT_KEY
/chatarxiv CHAT_ID
/chatarxiv ACCOUNT_KEY CHAT_ID
/arxivdebug ACCOUNT_KEY
/arxivyoldebug
/testxabar ACCOUNT_KEY deleted
/testxabar ACCOUNT_KEY edited
/lidochir CHAT_ID
/lidyoq CHAT_ID
/qaytaboshla CHAT_ID
/holat CHAT_ID
```

Eski inglizcha buyruqlar ham backward compatibility uchun ishlashda davom etadi.

## Dialog arxiv

Bot faqat Telegram Bot API orqali kelgan Business update’larni arxivlaydi. Private chatlarni ruxsatsiz o‘qimaydi yoki scrape qilmaydi.

Media fayl metadata doim saqlanadi. Faylni Supabase Storage’ga yuklash optional:

```text
MEDIA_ARCHIVE_ENABLED=true
MEDIA_ARCHIVE_DOWNLOAD=false
MEDIA_ARCHIVE_MAX_BYTES=20000000
SUPABASE_STORAGE_BUCKET=business-media-archive
```

`MEDIA_ARCHIVE_DOWNLOAD=false` bo‘lsa, bot faqat `file_id`, `file_unique_id` va metadata saqlaydi. Account sozlamasida `media_archive_download=true` qilinsa, ruxsat berilgan media Supabase Storage bucket’ga yuklanadi.

## AI yordamchi funksiyalar

AI intent klassifikatsiya mijozga erkin javob yozmaydi, faqat ichki JSON qaror chiqaradi. `OPENAI_API_KEY` bo‘lmasa yoki AI o‘chirilgan bo‘lsa, bot eski qoida-asosidagi logika bilan ishlaydi.

```text
AI_INTENT_ENABLED=true
AI_TEMPLATE_EDITOR_ENABLED=true
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

AI shablon tahriri preview ko‘rsatadi va faqat admin `✅ Saqlash` tugmasini bosgandan keyin account-specific shablonga saqlaydi.

## Multi-account sozlash

Eski single-account sozlamalar ishlashda davom etadi: `OWNER_TELEGRAM_ID`, `BUSINESS_OWNER_ID`, `ADMIN_CHAT_ID`.

Ikkinchi akkaunt uchun oddiy env sozlash:

```text
SECOND_ACCOUNT_ENABLED=true
SECOND_ACCOUNT_KEY=second
SECOND_ACCOUNT_LABEL=Ikkinchi akkaunt
SECOND_ACCOUNT_PROJECT_NAME=Millat Iftixorlari ensiklopediyasi
SECOND_ACCOUNT_ADMIN_CHAT_ID=8304283149
SECOND_ACCOUNT_BUSINESS_OWNER_ID=8304283149
SECOND_ACCOUNT_FLOW_KEY=second_info_only
```

Bir nechta akkaunt uchun optional `BUSINESS_ACCOUNTS_JSON` ishlatiladi:

```json
[
  {
    "account_key": "uzlye",
    "label": "UZLYE",
    "project_name": "O‘zbekiston Lider Yoshlari Ensiklopediyasi",
    "business_owner_id": "123456789",
    "admin_chat_id": "123456789",
    "flow_key": "uzlye_info_only"
  },
  {
    "account_key": "second",
    "label": "Second Account",
    "project_name": "Second Project",
    "business_owner_id": "987654321",
    "admin_chat_id": "987654321",
    "flow_key": "second_info_only"
  }
]
```

Telegram `business_connection` update kelganda bot avval `owner_user_id`/`business_owner_id` bo‘yicha mavjud accountni topadi. Mos account topilmasa `tg_<telegram_user_id>` ko‘rinishida yangi account yaratadi, connectionni shu accountga bog‘laydi va admin chat sifatida account egasining Telegram ID sini saqlaydi.

Yangi Business connection ulanganida bot `business_accounts`, `bot_accounts`, `business_connection_accounts` va `account_admins` yozuvlarini xavfsiz upsert qiladi. Business owner faqat o‘z account’ini public bot orqali boshqaradi. Platform owner esa alohida Admin Bot orqali barcha ulangan accountlarni ko‘radi va har bir platform action `platform_audit_logs` jadvaliga yoziladi.

Platform Admin Bot buyruqlari:

```text
/start
/menu
/dashboard
/accounts
/account ACCOUNT_KEY
/commands
/commands ACCOUNT_KEY
/command ACCOUNT_KEY COMMAND_KEY
/commandon ACCOUNT_KEY COMMAND_KEY
/commandoff ACCOUNT_KEY COMMAND_KEY
/testcommand ACCOUNT_KEY TEXT
/archive ACCOUNT_KEY
/archivesettings ACCOUNT_KEY
/archiveon ACCOUNT_KEY
/archiveoff ACCOUNT_KEY
/deletedon ACCOUNT_KEY
/deletedoff ACCOUNT_KEY
/editedon ACCOUNT_KEY
/editedoff ACCOUNT_KEY
/medianon ACCOUNT_KEY
/mediaon ACCOUNT_KEY
/mediaoff ACCOUNT_KEY
/notifyon ACCOUNT_KEY
/notifyoff ACCOUNT_KEY
/report ACCOUNT_KEY
/reportall
/suspend ACCOUNT_KEY
/unsuspend ACCOUNT_KEY
/boton ACCOUNT_KEY
/botoff ACCOUNT_KEY
/settings ACCOUNT_KEY
/templates ACCOUNT_KEY
/flow ACCOUNT_KEY
/airules ACCOUNT_KEY
/testai ACCOUNT_KEY STEP_KEY TEXT
/audit
/diagnostics
/testnotify ACCOUNT_KEY
/cancel
```

## Account-specific command management

Business owner menyusida `🧩 Buyruqlar` bo‘limi faqat ruxsatli ikki profil uchun ishlaydi. Hozir v5 Lite’da yangi buyruq yaratish wizard’i o‘chirilgan: mavjud buyruqlarni ko‘rish, shablonini tahrirlash, arxivlash va qayta tiklash ishlaydi. Global buyruqlar (`/menu`, `/whoami`, `/settings`, `/commands`, `/archive`, `/report` va boshqalar) override qilinmaydi.

Custom commandlar faqat o‘z `account_key` doirasida ishlaydi. Mijoz biznes chatda mos xabar yuborsa, bot avval shu akkaunt commandlarini tekshiradi; mos command topilmasa eski info-only lead flow davom etadi. Test rejimida real mijozga xabar yuborilmaydi.

## Bot va Reach ON/OFF

Har bir akkauntda umumiy bot holati va reach holati alohida:

```text
/botniyoq ACCOUNT_KEY
/botniochir ACCOUNT_KEY
/reachyoq ACCOUNT_KEY
/reachochir ACCOUNT_KEY
```

Bot OFF bo‘lsa avtomatik javob, AI intent, timer va follow-up yuborilmaydi. Reach OFF bo‘lsa yangi outreach session boshlanmaydi va outgoing reach xabarlari lidni avtomatik faollashtirmaydi. Admin qo‘lda yozgan xabarlar arxiv/kontekst uchun saqlanishi mumkin.

`/reach_start` joriy tanlangan akkaunt bo‘yicha reach yuborilmagan yangi lidlarni preview qiladi va `✅ Reachni boshlash` tasdig‘idan keyin account-specific reach shabloni bilan yozadi. `TEST_MODE=true` bo‘lsa faqat `TEST_LEAD_IDS` ichidagi lidlarga yuboriladi.

`/account_debug` ruxsatli admin uchun joriy Telegram ID, tanlangan account, normalized account key va `can_manage_account` holatini ko‘rsatadi.

## Archive settings

Owner menyusida `🕵️ Arxiv sozlamalari` orqali quyidagilar account-specific ON/OFF qilinadi:

```text
archive_enabled
track_deleted_enabled
track_edited_enabled
media_archive_enabled
media_archive_download
archive_notify_enabled
```

Platform Admin Bot shu sozlamalarni barcha akkauntlar uchun `/archivesettings ACCOUNT_KEY` va toggle commandlar orqali boshqaradi. Platform admin o‘zgarishlari audit logga yoziladi.

Shablon komandalarining eski formati saqlangan:

```text
/gettemplate key
/settemplate key yangi matn
```

Account-specific format:

```text
/gettemplate account_key key
/settemplate account_key key yangi matn
```

Flow komandalar:

```text
/flow ACCOUNT_KEY
/setflow ACCOUNT_KEY STEP_KEY TEMPLATE_KEY NEXT_YES NEXT_NO NEXT_PARTIAL NEXT_UNKNOWN STOP_TRUE_FALSE
/flowtest ACCOUNT_KEY
```

## Muhim

Supabase’da `supabase.sql`ni qayta ishlatsangiz ham eski tahrirlangan shablonlaringiz o‘zgarmaydi. SQL faqat yetishmayotgan jadval/ustun/template’larni qo‘shadi.
