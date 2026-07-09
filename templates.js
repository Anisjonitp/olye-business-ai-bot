export const DEFAULT_TEMPLATES = {
  greeting: {
    title: 'Salomlashish / ariza so‘rash',
    lead_status: 'new',
    text: 'Va alaykum assalom. Siz “O‘zbekiston Lider Yoshlari Ensiklopediyasi”ga kirish uchun ariza qoldirgandingizmi?'
  },
  application_yes: {
    title: 'Ariza qoldirganini tasdiqladi',
    lead_status: 'qualified',
    text: 'Juda yaxshi. Siz ensiklopediyamizga kirishning foydali jihatlari haqida batafsil ma’lumotga egamisiz?'
  },
  application_no: {
    title: 'Ariza qoldirmagan / adashgan',
    lead_status: 'not_interested',
    text: 'Tushunarli, unda bezovta qilgan bo‘lsam uzr. Agar keyinroq loyiha haqida ma’lumot kerak bo‘lsa, bemalol yozishingiz mumkin.'
  },
  needs_info: {
    title: 'Ma’lumot kerak / foydali jihatlarni bilmaydi',
    lead_status: 'needs_info',
    text: 'Qisqacha tushuntiraman: ensiklopediyaga kiritilgan ishtirokchi uchun alohida sahifa tayyorlanadi. Bu sahifa internetda ko‘rinadi, portfolio sifatida ishlatiladi va keyinchalik grant, forum, tanlov yoki rasmiy tavsiyanomalarda foyda berishi mumkin. Kirish tartibi va texnik badal haqida ham aytib beraymi?'
  },
  info_known: {
    title: 'Ma’lumotga ega ekanini aytdi',
    lead_status: 'qualified',
    text: 'Juda yaxshi. Unda kirish tartibi va yillik texnik badal haqida qisqacha aytib beraymi?'
  },
  asks_price: {
    title: 'Narx / badal so‘radi',
    lead_status: 'price_asked',
    text: 'Yillik texnik badal 100 000 so‘m. Bu sahifani tayyorlash, joylashtirish, texnik yuritish va sertifikat bilan bog‘liq xarajatlar uchun. To‘lov tartibini ham yuboraymi?'
  },
  wants_to_pay: {
    title: 'To‘lovga tayyor',
    lead_status: 'hot',
    notify_admin: true,
    text: 'Yaxshi. To‘lov qilish uchun ma’lumotlarni yuboraman. To‘lovdan keyin chek/skrinshotni shu yerga yuborsangiz, sahifani tayyorlash jarayoni boshlanadi.'
  },
  trust_objection: {
    title: 'Ishonchsizlik / isbot so‘radi',
    lead_status: 'needs_info',
    text: 'Tushunarli, bunday savol berishingiz tabiiy. Loyiha ishtirokchilarni ensiklopedik sahifa orqali yoritishga qaratilgan: har bir ishtirokchi uchun alohida sahifa tayyorlanadi va tasdiqlovchi sertifikat beriladi. Xohlasangiz, kirish tartibini bosqichma-bosqich tushuntirib beraman.'
  },
  certificate_question: {
    title: 'Sertifikat haqida so‘radi',
    lead_status: 'needs_info',
    text: 'Ha, ishtirokchiga loyiha doirasida tasdiqlovchi sertifikat beriladi. Sertifikat sahifa tayyorlanishi va ma’lumotlar tasdiqlanishi bilan bog‘liq jarayondan keyin rasmiylashtiriladi.'
  },
  search_visibility: {
    title: 'Google/qidiruv/AI ko‘rinishi haqida',
    lead_status: 'needs_info',
    text: 'Sahifa internetda ochiq joylashtiriladi. Shu sababli u qidiruv tizimlarida ko‘rinishi va keyinchalik portfolio, grant, forum yoki tanlovlarda havola sifatida ishlatilishi mumkin.'
  },
  payment_method: {
    title: 'To‘lov usuli so‘radi',
    lead_status: 'price_asked',
    notify_admin: true,
    text: 'To‘lov ma’lumotlarini yuboraman. To‘lovdan keyin chek/skrinshotni shu yerga tashlab qo‘ysangiz, arizangizni keyingi bosqichga o‘tkazamiz.'
  },
  later: {
    title: 'Keyinroq to‘layman / o‘ylab ko‘raman',
    lead_status: 'qualified',
    text: 'Mayli, tushunarli. Sizni ro‘yxatda saqlab turaman. Tayyor bo‘lganingizda yozsangiz, kirish tartibi va to‘lov bo‘yicha yordam beraman.'
  },
  not_interested: {
    title: 'Qiziqmadi / rad etdi',
    lead_status: 'not_interested',
    text: 'Tushunarli. Bezovta qilgan bo‘lsam uzr. Keyinchalik kerak bo‘lsa, bemalol yozishingiz mumkin.'
  },
  asks_human: {
    title: 'Operator/odam so‘radi',
    lead_status: 'human_needed',
    notify_admin: true,
    pause_bot: true,
    text: 'Albatta. Hozir murojaatingizni mas’ul odamga yetkazaman, sizga javob berishadi.'
  },
  bot_question: {
    title: 'Botmisan deb so‘radi',
    lead_status: 'qualified',
    text: 'Men murojaatlarga tezroq javob berishga yordam beruvchi avtomatlashtirilgan yordamchiman. Kerak bo‘lsa, mas’ul odamga ham ulab beraman.'
  },
  off_topic: {
    title: 'Mavzudan tashqari',
    lead_status: 'new',
    text: 'Men asosan “O‘zbekiston Lider Yoshlari Ensiklopediyasi” bo‘yicha ma’lumot bera olaman. Siz ariza yoki kirish tartibi bo‘yicha so‘rayapsizmi?'
  },
  unknown: {
    title: 'Tushunarsiz xabar',
    lead_status: 'new',
    text: 'Tushunarli. Aniqlashtirib olay: siz ensiklopediyaga kirish shartlari, foydali jihatlari yoki texnik badal haqida ma’lumot olmoqchimisiz?'
  }
};

export function templateListForPrompt() {
  return Object.entries(DEFAULT_TEMPLATES)
    .map(([key, value]) => `- ${key}: ${value.title}`)
    .join('\n');
}

export function renderTemplate(text, vars = {}) {
  return String(text || '').replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}
