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
- Admin Telegram Business orqali yangi odamga qo‘lda yozsa, shu chat account scope’da lead sifatida saqlanadi va bot keyingi javobni tayyor shablonlar bilan davom ettira oladi.
- Telegram scheduled message bilan ishlash: scheduled xabarlarni 07:02 ga qo‘yish mumkin.
- 07:00–07:15 oralig‘ida outreach aniqlanmasa admin ogohlantirish oladi.
- Auto Outreach tugaganda admin chatga hisobot yuboriladi.
- Tugmali menu: Outreach, Hisobot, Ma’lumot yuborilganlar, Tanishdim, To‘lovga yaqinlar, Eslatma keraklar, Bot holati.
- Eslatma preview: bot o‘zi ommaviy yozmaydi; admin tasdiqlasa `Tanishib chiqdingizmi? Biz sizni kutyapmiz.` yuboriladi.
- Dialog arxiv: Telegram Business bot ruxsat olgan chatlarda xabar metadata, media metadata, tahrir va o‘chirish hodisalarini saqlaydi.
- `supabase.sql` eski tahrirlangan shablonlarni overwrite qilmaydi (`on conflict do nothing`).
- `/resetme`: faqat test qilayotgan shu chat/profil holatini tozalaydi, eski funksiyalarni olib tashlamaydi.
- Test mode production’da default o‘chiq: `TEST_MODE=false`. Sinovda `TEST_MODE=true` bo‘lsa avtomatik javob faqat `TEST_LEAD_IDS` ichidagi lidlarga ketadi.
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

Arxiv retention muddati `ARCHIVE_RETENTION_DAYS=30` orqali boshqariladi. Bot kuniga bir marta 30 kundan eski chat arxivi va tahrir tarixini tozalaydi.

`OUTREACH_MONITOR_ENABLED=false` bo‘lsa outreach monitor ogohlantirishlari vaqtincha o‘chiq turadi; Telegram Business auto-reply oqimi monitor holatidan mustaqil ishlaydi.

Production diagnostikasi uchun `GET /debug/status` (runtime health, scheduler va buffered conversation soni) hamda `GET /webhook-info` (Telegram webhook holati) mavjud. `TELEGRAM_REQUEST_TIMEOUT_MS=15000` Telegram so‘rovining yuqori vaqt chegarasini, `TELEGRAM_SEND_MAX_RETRIES=1` esa faqat vaqtinchalik send xatolari (429/5xx/network) uchun bounded retry sonini belgilaydi.

SaaS workspace qatlami dastlab passiv holatda deploy qilinadi:

```text
SAAS_PLATFORM_ENABLED=false
NEW_USER_ONBOARDING_ENABLED=false
FLOW_BUILDER_ENABLED=false
SUBSCRIPTION_ENFORCEMENT_ENABLED=false
SAAS_TEST_USER_IDS=
PLATFORM_SUPER_ADMIN_IDS=
TRIAL_DAYS=3
PLATFORM_SUPPORT_CONTACT=
```

Bu flaglar `false` bo‘lsa, mavjud UZLYE va ikkinchi account eski `account_key` routing, template, flow, lead va timer oqimida ishlashda davom etadi. PHASE 1 migration mavjud accountlarni internal workspace sifatida bog‘laydi, ammo runtime oqimini yangi subscription qoidalariga o‘tkazmaydi.

### PHASE 2: trial, PRO va subscription guard

Supabase SQL Editor’da avval `migrations/20260716_phase2_subscriptions.sql` migrationini bir marta Run qiling. Migration mavjud `subscriptions` va `subscription_payments` jadvallarini xavfsiz kengaytiradi, trial grant tarixi va admin interaction sessionlarini qo‘shadi. UZLYE hamda ikkinchi amaldagi account `is_platform_internal=true`, `status=pro`, `subscription_ends_at=null` holatida qoladi.

Production rollout uchun avval kodni flaglar o‘chiq holatda deploy qiling. Migration va Admin Bot tarif amallari tekshirilgach test muhitida quyidagilar yoqiladi:

```text
SAAS_PLATFORM_ENABLED=true
SUBSCRIPTION_ENFORCEMENT_ENABLED=true
TRIAL_DAYS=3
```

`canWorkspaceAutomate()` incoming auto-reply, reach campaign, manual campaign start, timer, follow-up, sequence va AI oldidan subscriptionni qayta tekshiradi. Oddiy workspace faqat muddati tugamagan `trial` yoki `pro` holatida ishlaydi; expired holatda `subscription_expired` yoziladi. Arxiv ma’lumotlari o‘chirilmaydi va owner menyusi ochiq qoladi.

Admin Botda `/subscriptions`, `/trials`, `/pros`, `/expired` va `/subscription ACCOUNT_KEY` buyruqlari mavjud. `💎 PRO qilish` oqimida 30/90/180/365 kun yoki muddatsiz internal access tanlanadi, summa sifatida `0` ham qabul qilinadi, ixtiyoriy izohdan keyin tasdiq so‘raladi. PRO faollashtirish va muddat qo‘shish payment yozuvi hamda platform audit yaratadi.

Public botdagi `💎 Tarif` tugmasi workspace planini, statusini, trial/PRO tugash vaqtini va qolgan muddatni ko‘rsatadi. Scheduler trial tugashiga 24 soat, 6 soat qolganda va trial tugaganda notificationni faqat bir marta yuboradi.

### PHASE 3: yangi user onboarding va Business ulanishi

Supabase SQL Editor’da `migrations/20260716_phase3_onboarding.sql` migrationini bir marta Run qiling. Bu migration faqat yangi workspace’lar uchun default template pack va info-only flow pack saqlaydi. UZLYE hamda `second`/Liderlar uchun mavjud shablonlar, flow, account key va subscription yozuvlariga tegmaydi.

Yangi onboarding avval o‘chiq holatda deploy qilinadi:

```text
SAAS_PLATFORM_ENABLED=true
NEW_USER_ONBOARDING_ENABLED=false
NEW_WORKSPACE_TEMPLATE_PACK=info_only_v1
NEW_WORKSPACE_FLOW_PACK=info_only_v1
TRIAL_DAYS=3
```

`NEW_USER_ONBOARDING_ENABLED=true` qilinganda yangi foydalanuvchi `/start` yoki `/onboarding` orqali ulanish holatini ko‘radi. Telegram Business ulanishi muvaffaqiyatli kelganda bot yangi scoped workspace/account yaratadi, default packlarni faqat shu yangi account’ga nusxalaydi va `start_workspace_trial` orqali aynan o‘sha paytda 3 kunlik trialni boshlaydi. Bir xil `business_connection_id` ikkinchi workspace’ga ulanmaydi; avvalgi trial grantlari owner yoki connection bo‘yicha qayta ishlatilmaydi. Trial berilmasa workspace `pending` holatida qoladi va avtomatlashtirish ishga tushmaydi.

### Yakuniy platforma rollout

Yangi production o‘rnatish uchun `migrations/20260716_final_platform.sql` faylini Supabase SQL Editor’da bir marta Run qiling. U avvalgi workspace, subscription va onboarding qatlamlari bilan idempotent ishlaydi; mavjud internal workspace, template matni, legacy flow yoki lid yozuvini almashtirmaydi.

Qo‘shimcha platforma flaglari:

```text
CRM_PRO_FEATURES_ENABLED=false
ARCHIVE_ENABLED=true
```

Flaglar yoqilgach user bot universal workspace menyusini ko‘rsatadi: bot holati, reach, shablonlar, ketma-ketlik, follow-up, lidlar, arxiv, operatorlar, Business ulanishi, tarif va yordam. Workspace chegarasi `workspace_id + workspace_business_account_id` orqali saqlanadi; internal accountlar muddatsiz PRO istisnosida qoladi.

Muhim test-mode sozlamalari:

```text
TEST_MODE=false
TEST_ADMIN_IDS=8254451152,8304283149
TEST_LEAD_IDS=comma,separated,lead_chat_ids
TEST_ALLOW_ADMIN_STARTED_LEADS=false
ADMIN_TAKEOVER_MINUTES=10
```

Production’da yangi lidlarga reach yuborilishi uchun `TEST_MODE=false` bo‘lishi kerak. `TEST_LEAD_IDS` bo‘sh bo‘lsa va `TEST_MODE=true` bo‘lsa, mijozlarga avtomatik javob yuborilmaydi. Admin menyusi mavjud account ownership orqali ishlaydi; `TEST_ADMIN_IDS` to‘ldirilsa, admin menyu ham shu ro‘yxat bilan cheklanadi.

`TEST_ALLOW_ADMIN_STARTED_LEADS=true` bo‘lsa, test rejimida ham faqat ruxsatli admin Telegram Business orqali qo‘lda boshlagan leadlar `TEST_LEAD_IDS` ro‘yxatisiz javob olishi mumkin. `reach_enabled` faqat birinchi outreach yuborishni boshqaradi; admin allaqachon qo‘lda yozgan leadning javobini bloklamaydi. `bot_enabled` va lead darajasidagi pause/manual-only flaglari baribir ustun turadi.

## Webhook ulash

Render deploy bo‘lgach:

```text
https://YOUR-RENDER-APP.onrender.com/set-webhook
```

Basic webhook:

```text
https://YOUR-RENDER-APP.onrender.com/set-webhook-basic
```

`/set-webhook` edit/delete arxiv update’larini ham yoqadi. Alohida full endpoint ham mavjud:

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

## Reach template orqali campaign

Admin Telegram Business orqali yuborgan outgoing xabar faqat account’ning `reply_templates` jadvalidagi faol reach keylaridan biriga normalize qilingan holda aynan teng kelsa campaign avtomatik ochiladi. Reach keylar: `reach_greeting`, `reach_start`, `outreach_start`, `application_confirmation`, `ask_application`.

Matn trim qilinadi, kichik harfga o‘tkaziladi, bo‘sh joylar va apostrof/qo‘shtirnoq variantlari normallashtiriladi, yakundagi nuqta yoki undov e’tiborga olinmaydi. Semantic yoki taxminiy matching ishlatilmaydi. `second` akkaunti faqat o‘zining `second:` shablonlarini tekshiradi; legacy global template’lar faqat UZLYE uchun ishlatiladi.

## O‘chirilgan xabarlar arxivi

Bot faqat Telegram Bot API orqali kelgan Business update’larni arxivlaydi. Private chatlarni ruxsatsiz o‘qimaydi yoki scrape qilmaydi. Har bir Business xabar uchun matn/caption, turi, `file_id`, yuboruvchi va composite scope saqlanadi; media faylning o‘zi Supabase Storage’ga yuklanmaydi.

O‘chirilgan yozuvlar 20 kun, hali o‘chirilmagan vaqtinchalik cache 3 kun saqlanadi. Runtime scheduler cleanup’ni kuniga bir marta bajaradi.

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

## Admin ovozli xabar transkripsiyasi

Ruxsatli admin asosiy botga (mavjud admin authorization helper orqali tanilgan) shaxsiy chatdan (business chat emas) voice message yuborsa, bot ovozni yuklab oladi va OpenAI orqali o‘zbekcha matnga aylantirib aynan o‘sha chatga qaytaradi. Mustaqil funksiya: Telegram Business customer oqimi, reach/outreach, reply_templates, lead stage, arxiv, admin takeover va notification routingga tegmaydi.

```text
OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe
OPENAI_TRANSCRIBE_TIMEOUT_MS=60000
ADMIN_VOICE_MAX_SECONDS=600
ADMIN_VOICE_MAX_BYTES=25000000
```

`OPENAI_API_KEY` bo‘lmasa transkripsiya xato xabari bilan yakunlanadi, boshqa hech qanday bot funksiyasiga ta’sir qilmaydi. Belgilangan davomiylik yoki hajmdan katta ovozli xabar OpenAI’ga yuborilmaydi. Bitta admin uchun bir vaqtda faqat bitta audio qayta ishlanadi (per-admin lock); audio hech qachon diskka yoki DB’ga saqlanmaydi.

## Muhim

Supabase’da `supabase.sql`ni qayta ishlatsangiz ham eski tahrirlangan shablonlaringiz o‘zgarmaydi. SQL faqat yetishmayotgan jadval/ustun/template’larni qo‘shadi.
