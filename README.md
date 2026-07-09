# OLYE Business AI Bot v4

Bu versiya qat'iy oqim bilan ishlaydi: AI erkin javob yozmaydi, faqat intent tanlaydi. Noma'lum savollarga bot javob bermaydi.

Render sozlamasi:

Build Command:
```
npm install
```

Start Command:
```
node index.js
```

Supabase SQL Editor ichida `schema.sql` ni Run qiling.

Muhim env:
```
BOT_TOKEN=
ADMIN_CHAT_ID=
BUSINESS_OWNER_ID=
TELEGRAM_WEBHOOK_SECRET=
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
AUTO_REPLY_ENABLED=true
```

Admin komandalar:

- `/start` — chat ID ko'rsatadi
- `/resetall` — barcha lead holatini boshidan qiladi
- `/templates` — shablonlar ro'yxati
- `/gettemplate KEY` — shablonni ko'rish
- `/settemplate KEY | MATN` — shablonni o'zgartirish
- `/status` — oxirgi chatlar
- `/pausechat CHAT_ID` — chatda botni o'chirish
- `/unpausechat CHAT_ID` — chatda botni yoqish
- `/addrule phrase | template_key | new_stage | stop` — qo'shimcha qoida
- `/rules` — qoidalar
- `/delrule ID` — qoidani o'chirish

Oqim:
1. Siz birinchi lidga yozasiz.
2. Lead salom yoki ha yaxshi desa, bot ariza savolini beradi.
3. Ha desa, bot foyda haqida so'raydi.
4. Ha yoki yo'q desa ham info yuboradi.
5. Ho'p desa bot jim turadi.
6. Tanishdim desa maqola yozish ma'qulmi deb so'raydi.
7. Ha desa savollar ro'yxatini yuboradi va shu chatda to'xtaydi.
