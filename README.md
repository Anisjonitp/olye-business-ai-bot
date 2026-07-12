# OLYE Business Info Bot v6

Bu versiya avvalgi murakkab AI sotuvchi emas. Bot faqat:

1. Siz ertalab yozgan lidlarni Auto Outreach orqali eslab qoladi.
2. Faqat o‘sha lidlarga avtomatik javob beradi.
3. Ariza qoldirganini so‘raydi.
4. Ma’lumot bor-yo‘qligini so‘raydi.
5. Ma’lumot + oferta yuboradi.
6. Shu chatda to‘xtaydi va admin davom ettiradi.

Narx, karta, qimmat, to‘lov, bio savollar, savollarga javob berish — bot qilmaydi. Bu chatlarni admin davom ettiradi.

## Fayllar

```txt
index.js
package.json
.env.example
supabase.sql
.gitignore
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

`.env.example` bo‘yicha to‘ldiring:

```env
BOT_TOKEN=
WEBHOOK_URL=https://YOUR-RENDER-APP.onrender.com/webhook
WEBHOOK_SECRET=change-this-secret
ADMIN_CHAT_ID=
OWNER_TELEGRAM_ID=
BUSINESS_OWNER_ID=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
APPLICATION_LINK=https://liderlar.uz/ariza_qoldirish
MESSAGE_BUFFER_MS=5000
AUTO_START_REQUIRE_OUTREACH=true
AUTO_OUTREACH_DEFAULT_HOURS=2
OUTREACH_GREETING_REQUIRED=true
INFO_ONLY_MODE=true
```

`OWNER_TELEGRAM_ID` va `BUSINESS_OWNER_ID` ni bilish uchun bot DM’iga `/whoami` yuboring.

## Supabase

Supabase SQL Editor’da `supabase.sql` ni ishlating.

Muhim: SQL eski template matnlarini o‘zgartirmaydi.

```sql
on conflict (key) do nothing
```

Ya’ni siz tahrirlagan eski shablonlar saqlanadi.

## Webhook ulash

Render deploy bo‘lgach brauzerda oching:

```txt
https://YOUR-RENDER-APP.onrender.com/set-webhook
```

Tekshirish:

```txt
https://YOUR-RENDER-APP.onrender.com/webhook-info
```

## Ishlash tartibi

1. Admin bot DM’ida `/auto 2h` yozadi yoki menyudan Auto 2 soat bosadi.
2. Admin Telegram Business profilidan lidlarga shunday yozadi:

```txt
Assalomu alaykum, yaxshimisiz?
```

3. Bot shu chatlarni outreach sifatida eslab qoladi.
4. Faqat o‘sha chatlardan javob kelsa, bot boshlaydi.
5. Bot quyidagi oqimni yuritadi:

```txt
Siz “O‘zbekiston Lider Yoshlari Ensiklopediyasi”ga kirish uchun ariza qoldirgansiz. Shunaqami?

Agar ha desa:
Ajoyib. Siz ensiklopediyamizga kirishning foydali jihatlari haqida batafsil ma’lumotga egamisiz?

Agar ha desa:
Keling, unda yana bir bor qisqacha tanishtirib o‘taman.
short_intro
offer_end

Agar yo‘q desa:
Keling, unda batafsil tushuntirib beraman.
full_intro
offer_end
```

6. `offer_end`dan keyin bot chatda to‘xtaydi.

## Ariza qoldirmagan bo‘lsa

Agar lid `yo‘q`, `qoldirmaganman`, `qanday qo‘shilsam bo‘ladi?` desa, bot `application_link_reply` yuboradi va to‘xtaydi.

## Buyruqlar

```txt
/menu
/auto 1h
/auto 2h
/auto 3h
/auto today
/autooff
/autostatus
/report
/pending
/healthtemplates
/whoami
/resetme
/gettemplate key
/settemplate key yangi matn
/leadsoff CHAT_ID
/leadson CHAT_ID
/reset CHAT_ID
/status CHAT_ID
```

## Testni qayta boshlash

Agar bitta test profil bir marta ishlagandan keyin bot qayta javob bermasa, o‘sha test chatdan quyidagini yuboring:

```txt
/resetme
```

Bu faqat o‘sha chatning test holatini tozalaydi va keyingi oddiy xabarda bot oqimni boshidan boshlaydi. Boshqa lidlarga ta’sir qilmaydi.

## Nega v6 soddalashtirildi?

Oldingi versiyada AI narx, karta, savol-javob, admin sync, bio savollar kabi joylarda chalkashib ketishi mumkin edi. Bu versiya xatoni kamaytirish uchun faqat ma’lumot berish va to‘xtashga mo‘ljallangan.
