const DEFAULT_TEMPLATES = {
  start_application_check: {
    title: 'Boshlanish xabari',
    category: 'sales',
    body: `Va alaykum assalom. Siz “O‘zbekiston Lider Yoshlari Ensiklopediyasi”ga kirish uchun ariza qoldirgansiz. Shunaqami?`
  },

  application_yes: {
    title: 'Ariza tasdiqlangandan keyingi xabar',
    category: 'sales',
    body: `Ajoyib. Siz ensiklopediyamizga kirishning foydali jihatlari haqida batafsil ma’lumotga egamisiz?`
  },

  info_for_known_user: {
    title: 'Ma’lumotga egaman deganlarga matn',
    category: 'sales',
    body: `Keling, unda yana bir bor qisqacha tanishtirib o‘taman.

“O‘zbekiston Lider Yoshlari Ensiklopediyasi” yoshlarning faoliyati, yutuqlari va biografik ma’lumotlarini ensiklopedik shaklda yoritishga qaratilgan loyiha hisoblanadi.

Ensiklopediyaga kiritilgan nomzod uchun alohida biografik maqola tayyorlanadi. Bu maqola internetda ko‘rinadi, portfolio sifatida ishlatiladi va keyinchalik grant, forum, tanlov yoki rasmiy tavsiyanomalarda foyda berishi mumkin.

Oferta va xabar bilan tanishib chiqing va ayting!!!`
  },

  info_for_unknown_user: {
    title: 'Ma’lumotga ega emasman deganlarga matn',
    category: 'sales',
    body: `Tushunarli. Unda sizga batafsil ma’lumot beraman.

“O‘zbekiston Lider Yoshlari Ensiklopediyasi” — faol, iqtidorli va tashabbuskor yoshlar haqida biografik maqolalar tayyorlab, ularni rasmiy sayt orqali yoritishga qaratilgan loyiha.

Loyihaga kiritilgan nomzod uchun alohida biografik maqola tayyorlanadi. Maqolada nomzodning ta’limi, faoliyati, yutuqlari, maqsadlari va liderlik jihatlari yoritiladi.

Bu siz uchun:
— internetda ko‘rinish;
— portfolio sifatida foydalanish;
— grant, tanlov, forum va tavsiyanomalarda qo‘shimcha asos;
— shaxsiy brend va virtual imidj uchun foyda beradi.

Oferta va xabar bilan tanishib chiqing va ayting!!!`
  },

  ask_acceptable: {
    title: 'Tanishdim degandan keyingi savol',
    category: 'sales',
    body: `Ajoyib, sizga ma’qulmi? Sizga ham biografik maqola yozamizmi unda ensiklopediyamizga kiritish uchun?`
  },

  biography_questions: {
    title: 'Biografik savollar',
    category: 'sales',
    body: `Iltimos, maqolaga asos bo‘ladigan savollarga javob bering!
Javoblarni yonidan xos tartib raqam qo‘ying.
Maqola va brending ishlari uchun to‘g‘riga qaragan, rasmiy kiyingan rasmingizni yuboring!

📋 Biografik maqola yozish uchun savollar:

1. To‘liq ismingiz va familiyangiz?
2. Tug‘ilgan yilingiz, kuni va joyingiz?
3. Hozirgi yashash joyingiz (viloyat/tuman/shahar)?
4. Ta’lim darajangiz va o‘qigan o‘quv yurtlaringiz?
5. Qaysi sohada faoliyat yuritasiz yoki o‘qiyapsiz?
6. Faoliyatingizni qachondan va qanday boshlagansiz?
7. Erishgan muhim yutuqlaringiz (tanlovlar, sertifikatlar, loyihalar, mukofotlar)?
8. Hayotingizda sizga ta’sir qilgan biror shaxs yoki voqea bormi?
9. Sizni ilhomlantiradigan shior yoki hayotiy prinsipingiz qanday?
10. Bo‘sh vaqtingizda nima bilan shug‘ullanasiz?
11. Sizningcha, lider bo‘lish uchun eng muhim fazilat nima?
12. Kelajakdagi rejalaringiz va orzu-maqsadlaringiz nimalardan iborat?
13. Sizdan boshqalar nimani o‘rganishlari mumkin deb o‘ylaysiz?
14. O‘zingiz haqingizda yana qanday qiziqarli yoki muhim ma’lumot bo‘lishi mumkin?
15. Boshqa yoshlar uchun qanday maslahat yoki motivatsion fikr bildirasiz?

Liderlar.uz | Instagram | @uzlye_rasmiy`
  },

  price_info: {
    title: 'Narx/badal matni',
    category: 'payment',
    body: `Bizda maqola joylashning yillik badali bor va u hozirda 100 000 so‘mni tashkil qiladi.

Pullar saytni va maqolalarni texnik jihatdan ta’minlash, sifatli yuritish va saqlashga sarflanadi.

Kelajakda biror yangi loyiha qilsangiz yoki o‘zgartirish kerak bo‘lsa, bir hafta ichida bu xizmatlar bepul bo‘ladi. Agar ko‘rsatilgan muddatdan keyin maqolani o‘zgartirish yoki unga yangilik kiritish kerak bo‘lsa, bu 20 000 so‘mni tashkil qiladi.

Undan tashqari kelajakda turli seminar, podcastlar va reels videolar qilishni rejalayapmiz. Bu ishlarda ham ensiklopediyamizga kirgan nomzodlarning virtual imidjini yaxshilash uchun harakat qilamiz, jumladan sizning ham.

To‘lov bilan muammo bo‘lsa, ushbu pulni 14 kunda bo‘lib-bo‘lib to‘lash imkoni ham bor.`
  },

  installment_terms: {
    title: '14 kunlik kelishuv matni',
    category: 'payment',
    body: `⚠️ Hurmatli nomzod, yana bir bor eslatib o‘tamiz.

Sizni “O‘zbekiston lider yoshlari ensiklopediyasi”ga kiritish jarayoni doirasida rasmiy saytimizda biografik maqolangiz chop etiladi hamda ijtimoiy tarmoqlarimizda siz haqingizda postlar e’lon qilinadi.

❗️Ensiklopediyaga kirish badali quyidagi muddatlarda to‘lanishi shart:
• boshlang‘ich to‘lov — kelishuv tasdiqlangandan keyin
• dastlabki 5 kun ichida — 40%
• 10 kun ichida — 80%
• 14 kun ichida — 100% (to‘liq)

📌 Iltimos, mazkur shartlar bilan to‘liq tanishib chiqing va tasdiq sifatida KATTA HARFLARDA quyidagini yozing:

MEN YAKUNIY SHARTLARGA ROZIMAN

Shundan so‘ng siz rasmiy ravishda navbatga kiritilasiz.

‼️ Eslatma: Navbatga qo‘shilganingizdan keyin ikki tomonlama majburiyatlar kuchga kiradi.`
  },

  consent_accepted_reply: {
    title: 'Rozilik qabul qilindi matni',
    category: 'payment',
    body: `Roziligingiz qabul qilindi. Endi boshlang‘ich to‘lov amalga oshirilgach, jarayon navbatga kiritiladi.`
  },

  payment_received_hold: {
    title: 'Chek qabul qilindi matni',
    category: 'payment',
    body: `Chekingiz qabul qilindi. Tekshiruvdan so‘ng sizga xabar beramiz.`
  },

  payment_confirmed: {
    title: 'To‘lov tasdiqlandi matni',
    category: 'payment',
    body: `To‘lovingiz tasdiqlandi. Jarayon davom ettiriladi.`
  },

  receipt_rejected: {
    title: 'Chek rad etildi matni',
    category: 'payment',
    body: `Yuborgan chekingiz bo‘yicha to‘lov tasdiqlanmadi. Iltimos, to‘lovni tekshirib qayta yuboring.`
  },

  discount_offer: {
    title: 'Chegirma matni',
    category: 'discount',
    body: `🎁 Siz uchun maxsus {discount}% chegirma ajratildi.

Siz avval ensiklopediyaga kirish jarayonida ma’lum bosqichgacha kelgansiz, lekin jarayon to‘xtab qolgan edi.

Bugun sizga ensiklopediyaga kirish badali bo‘yicha {discount}% chegirma berildi.

Agar davom ettirmoqchi bo‘lsangiz, shu xabarga “DAVOM ETAMAN” deb yozing.`
  },

  reminder_5d: {
    title: '5-kun 40% eslatma',
    category: 'reminder',
    body: `Hurmatli nomzod, 14 kunlik kelishuv bo‘yicha 5-kun eslatmasi.

Kelishuvga ko‘ra dastlabki 5 kun ichida 40% to‘lov amalga oshirilishi kerak.

Iltimos, to‘lovni amalga oshirib chekni yuboring.`
  },

  reminder_10d: {
    title: '10-kun 80% eslatma',
    category: 'reminder',
    body: `Hurmatli nomzod, 14 kunlik kelishuv bo‘yicha 10-kun eslatmasi.

Kelishuvga ko‘ra 10 kun ichida umumiy to‘lovning 80% qismi amalga oshirilishi kerak.

Iltimos, to‘lovni amalga oshirib chekni yuboring.`
  },

  reminder_14d: {
    title: '14-kun 100% eslatma',
    category: 'reminder',
    body: `Hurmatli nomzod, bugun 14 kunlik kelishuvning yakuniy muddati.

Kelishuvga ko‘ra ensiklopediyaga kirish badali 100% to‘liq to‘lanishi kerak.

Iltimos, yakuniy to‘lovni amalga oshirib chekni yuboring.`
  },

  passport_request: {
    title: 'Hujjat so‘rash matni',
    category: 'article',
    body: `Iltimos, maqola ma’lumotlarini tasdiqlash uchun rasmiy hujjatdagi ism-familiyangizni yuboring. Pasport seriya va raqamini berkitishingiz mumkin.`
  },

  article_review_request: {
    title: 'Maqola tekshirish matni',
    category: 'article',
    body: `Maqolangiz tayyorlandi. Iltimos, matn bilan tanishib chiqing va tasdiqlang.`
  },

  decline: {
    title: 'Rad etganga javob',
    category: 'sales',
    body: `Ho‘p, fikringiz o‘zgarsa shu yerdamiz.`
  },

  no_reply: {
    title: 'Javob yozmaslik',
    category: 'system',
    body: ``
  }
};

module.exports = { DEFAULT_TEMPLATES };
