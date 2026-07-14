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

Scheduler uxlab qolmasligi uchun tashqi cron bilan `/tick` endpointni har 5 daqiqada chaqirish ham mumkin:

```text
https://YOUR-RENDER-APP.onrender.com/tick
```

## Asosiy admin buyruqlar

```text
/menu
/resetme
/auto 2h
/autooff
/autostatus
/setdaily 07:00 2h
/dailyoff
/dailystatus
/report
/info
/read
/payment
/reminders
/diagnostics
/healthtemplates
/tick
/accounts
/account ACCOUNT_KEY
/accountstatus
/flow ACCOUNT_KEY
/setflow ACCOUNT_KEY STEP_KEY TEMPLATE_KEY NEXT_YES NEXT_NO NEXT_PARTIAL NEXT_UNKNOWN STOP_TRUE_FALSE
/flowtest ACCOUNT_KEY
/archive
/deleted
/edited
/media
/archivechat CHAT_ID
```

## Dialog arxiv

Bot faqat Telegram Bot API orqali kelgan Business update’larni arxivlaydi. Private chatlarni ruxsatsiz o‘qimaydi yoki scrape qilmaydi.

Media fayl metadata doim saqlanadi. Faylni Supabase Storage’ga yuklash optional:

```text
MEDIA_ARCHIVE_ENABLED=true
MEDIA_ARCHIVE_DOWNLOAD=false
MEDIA_ARCHIVE_MAX_BYTES=20000000
SUPABASE_STORAGE_BUCKET=business-media-archive
```

`MEDIA_ARCHIVE_DOWNLOAD=false` bo‘lsa, bot faqat `file_id`, `file_unique_id` va metadata saqlaydi.

## Multi-account sozlash

Eski single-account sozlamalar ishlashda davom etadi: `OWNER_TELEGRAM_ID`, `BUSINESS_OWNER_ID`, `ADMIN_CHAT_ID`.

Ikkinchi akkaunt uchun oddiy env sozlash:

```text
SECOND_ACCOUNT_ENABLED=true
SECOND_ACCOUNT_KEY=second
SECOND_ACCOUNT_LABEL=Second
SECOND_ACCOUNT_PROJECT_NAME=Second Project
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
