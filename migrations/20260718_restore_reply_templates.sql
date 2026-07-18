-- Restore account-scoped reply templates from existing repository seed data.
-- This migration touches only UZLYE and second rows resolved through existing_account_key.

-- Preview expected template keys and current state before restore.
with expected(template_key) as (
  values
    ('reach_greeting'), ('ask_application'), ('ask_info'), ('known_info_preface'),
    ('unknown_info_preface'), ('short_intro'), ('full_intro'), ('offer_end'), ('application_link_reply'),
    ('media_text_request'), ('clarify_application'), ('finished_notice_admin'), ('offer_followup')
), accounts as (
  select id, workspace_id, existing_account_key
  from workspace_business_accounts
  where existing_account_key in ('uzlye', 'second')
)
select
  a.existing_account_key as account_key,
  e.template_key,
  t.key as existing_storage_key,
  t.is_active,
  length(t.body) as existing_text_length
from accounts a
cross join expected e
left join reply_templates t
  on t.key = a.existing_account_key || ':' || e.template_key
order by a.existing_account_key, e.template_key;

-- Source bodies below are copied from the repository's existing default_template_packs
-- and legacy reply_templates seeds. No new copy is invented here.
with accounts as (
  select id, workspace_id, existing_account_key
  from workspace_business_accounts
  where existing_account_key in ('uzlye', 'second')
), pack_templates as (
  select template_key, title, body
  from default_template_packs
  where pack_key = 'info_only_v1'
    and is_active is true
    and template_key in (
      'reach_greeting', 'ask_application', 'ask_info', 'known_info_preface',
      'unknown_info_preface', 'full_intro', 'offer_end', 'application_link_reply',
      'media_text_request'
    )
), legacy_extras(template_key, title, body) as (
  values
    ('short_intro', 'Qisqa tanishtiruv', '“O‘zbekiston Lider Yoshlari Ensiklopediyasi” — faol, iqtidorli va tashabbuskor yoshlar haqida biografik maqola tayyorlab, ularni ensiklopediya formatida yoritadigan loyiha.

Bu siz uchun internetda ko‘rinish, shaxsiy portfolio, grant, tanlov, forum va turli arizalarda havola sifatida foydalanish imkonini beradi.'),
    ('clarify_application', 'Ariza aniqlashtirish', 'Aniqlik uchun ayting: ariza qoldirganmisiz? Ha yoki yo‘q deb javob bersangiz bo‘ladi.'),
    ('finished_notice_admin', 'Bot to‘xtadi admin eslatma', '✅ Bot ma’lumot va oferta xabarini yubordi. Endi ushbu chatni qo‘lda davom ettiring.'),
    ('offer_followup', 'Oferta eslatma', 'Tanishib chiqdingizmi? Biz sizni kutyapmiz.')
), account_overrides(account_key, template_key, title, body) as (
  values
    ('uzlye', 'ask_application', 'Ariza qoldirganini so‘rash', 'Assalomu alaykum. Siz “O‘zbekiston Lider Yoshlari Ensiklopediyasi”ga kirish uchun ariza qoldirgansiz. Shunaqami?'),
    ('uzlye', 'ask_info', 'Ma’lumot bor-yo‘qligini so‘rash', 'Ajoyib. Siz ensiklopediyamizga kirishning foydali jihatlari haqida batafsil ma’lumotga egamisiz?'),
    ('uzlye', 'known_info_preface', 'Ma’lumot bor desa kirish', 'Keling, unda yana bir bor qisqacha tanishtirib o‘taman.'),
    ('uzlye', 'unknown_info_preface', 'Ma’lumot yo‘q desa kirish', 'Keling, unda batafsil tushuntirib beraman.'),
    ('uzlye', 'full_intro', 'Batafsil ma’lumot', $uzlye_full$“O‘zbekiston Lider Yoshlari Ensiklopediyasi” — faol, iqtidorli va tashabbuskor yoshlar haqida biografik maqola tayyorlab, ularni ensiklopediya formatida yoritadigan loyiha.

Loyihaga kiritilgan ishtirokchi haqida maxsus biografik maqola tayyorlanadi. Bu maqola orqali siz haqingizdagi ma’lumotlar internetda tartibli, rasmiy va chiroyli ko‘rinishda joylashadi.

Foydali jihatlari:
— Google va boshqa qidiruv tizimlarida ko‘rinish;
— shaxsiy portfolio sifatida foydalanish;
— grant, forum, tanlov va arizalarda havola sifatida berish;
— kelajakda Wikipedia sahifasi uchun asos bo‘lishi mumkin;
— maxsus sertifikat taqdim etiladi.$uzlye_full$),
    ('uzlye', 'offer_end', 'Oferta oxiri', 'Oferta va xabar bilan tanishib chiqing va ayting!!!'),
    ('uzlye', 'application_link_reply', 'Ariza havolasi', 'Keling, unda avval ushbu havola orqali ariza qoldiring va qayta yozing.

{APPLICATION_LINK}'),
    ('uzlye', 'media_text_request', 'Media o‘rniga matn so‘rash', 'Iltimos, javobingizni qisqa matn ko‘rinishida yuborsangiz, davom ettiramiz.'),
    ('second', 'ask_application', 'Ariza qoldirganini so‘rash', 'Siz “Millat Iftixorlari ensiklopediyasi”ga kirish uchun ariza qoldirgansiz. Shunaqami?'),
    ('second', 'ask_info', 'Ma’lumot bor-yo‘qligini so‘rash', 'Siz ensiklopediyamizga kirishning foydali jihatlari haqida batafsil ma’lumotga egamisiz?'),
    ('second', 'known_info_preface', 'Ma’lumot bor desa kirish', 'Ajoyib, keling unda yana bir bor tanishtirib o‘taman.'),
    ('second', 'offer_end', 'Oferta yakuni', 'Ensiklopediyamizning ommaviy ofertasi bilan quyidagi link orqali batafsil tanishishingiz mumkin:\nhttps://t.me/mie_rasmiy/3\n\n👨‍🎓 Vebsayt | 📱 Instagram | 📱 Telegram\n\nOferta va xabar bilan tanishib chiqing va ayting.')
), source_templates as (
  select template_key, title, body from pack_templates
  union all
  select template_key, title, body from legacy_extras
), rows_to_restore as (
  select
    a.existing_account_key as account_key,
    a.workspace_id,
    a.id as workspace_business_account_id,
    s.template_key,
    coalesce(o.title, s.title) as title,
    coalesce(o.body, s.body) as body
  from accounts a
  cross join source_templates s
  left join account_overrides o
    on o.account_key = a.existing_account_key
   and o.template_key = s.template_key
  union all
  select
    a.existing_account_key,
    a.workspace_id,
    a.id,
    o.template_key,
    o.title,
    o.body
  from accounts a
  join account_overrides o
    on o.account_key = a.existing_account_key
  where not exists (select 1 from source_templates s where s.template_key = o.template_key)
), restored as (
  insert into reply_templates (
    key, account_key, template_key, title, body,
    workspace_id, workspace_business_account_id,
    is_active, is_archived, updated_at
  )
  select
    account_key || ':' || template_key,
    account_key,
    template_key,
    title,
    body,
    workspace_id,
    workspace_business_account_id,
    true,
    false,
    now()
  from rows_to_restore
  where body is not null and length(body) > 0
  on conflict (key) do update
  set account_key = excluded.account_key,
      template_key = excluded.template_key,
      title = excluded.title,
      body = excluded.body,
      workspace_id = excluded.workspace_id,
      workspace_business_account_id = excluded.workspace_business_account_id,
      is_active = true,
      is_archived = false,
      updated_at = now()
  returning key, account_key, template_key, workspace_id, workspace_business_account_id, length(body) as text_length
)
select count(*) as restored_row_count, coalesce(jsonb_agg(restored), '[]'::jsonb) as restored_rows
from restored;

-- Post-restore verification for all flow/menu template keys restored by this migration.
select
  t.account_key,
  t.template_key,
  t.key,
  t.workspace_id,
  t.workspace_business_account_id,
  t.is_active,
  length(t.body) as text_length
from reply_templates t
where t.account_key in ('uzlye', 'second')
  and t.template_key in (
    'reach_greeting', 'ask_application', 'ask_info', 'known_info_preface',
    'unknown_info_preface', 'short_intro', 'full_intro', 'offer_end', 'application_link_reply',
    'media_text_request', 'clarify_application', 'finished_notice_admin', 'offer_followup'
  )
order by t.account_key, t.template_key;
