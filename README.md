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
- Telegram scheduled message bilan ishlash: scheduled xabarlarni 07:02 ga qo‘yish mumkin.
- 07:00–07:15 oralig‘ida outreach aniqlanmasa admin ogohlantirish oladi.
- Auto Outreach tugaganda admin chatga hisobot yuboriladi.
- Tugmali menu: Outreach, Hisobot, Ma’lumot yuborilganlar, Tanishdim, To‘lovga yaqinlar, Eslatma keraklar, Bot holati.
- Eslatma preview: bot o‘zi ommaviy yozmaydi; admin tasdiqlasa `Tanishib chiqdingizmi? Biz sizni kutyapmiz.` yuboriladi.
- `supabase.sql` eski tahrirlangan shablonlarni overwrite qilmaydi (`on conflict do nothing`).

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

Tekshirish:

```text
https://YOUR-RENDER-APP.onrender.com/webhook-info
```

Scheduler uxlab qolmasligi uchun tashqi cron bilan `/tick` endpointni har 5 daqiqada chaqirish ham mumkin:

```text
https://YOUR-RENDER-APP.onrender.com/tick
```

## Asosiy admin buyruqlar

```text
/menu
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
```

## Muhim

Supabase’da `supabase.sql`ni qayta ishlatsangiz ham eski tahrirlangan shablonlaringiz o‘zgarmaydi. SQL faqat yetishmayotgan jadval/ustun/template’larni qo‘shadi.
