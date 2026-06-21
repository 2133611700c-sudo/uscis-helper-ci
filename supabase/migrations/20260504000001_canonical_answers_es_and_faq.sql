-- ============================================================
-- Migration: 20260504000001_canonical_answers_es_and_faq
-- Add Spanish FAQ columns to canonical_answers
-- Seed 12 re-parole U4U FAQ entries in EN/ES/UK/RU
--
-- USCIS facts verified 2026-05-03 from uscis.gov
-- ============================================================

-- ─── 1. Add Spanish columns ──────────────────────────────────────────────────
ALTER TABLE public.canonical_answers
  ADD COLUMN IF NOT EXISTS question_es TEXT,
  ADD COLUMN IF NOT EXISTS answer_es   TEXT;

COMMENT ON COLUMN public.canonical_answers.question_es IS 'Spanish translation of question (verified)';
COMMENT ON COLUMN public.canonical_answers.answer_es   IS 'Spanish translation of answer (verified)';

-- ─── 2. Seed re-parole U4U FAQ (12 entries) ─────────────────────────────────

-- Q1: What is U4U Re-Parole?
INSERT INTO public.canonical_answers (
  slug, category, is_published, verified_at,
  question_en, answer_en,
  question_es, answer_es,
  question_uk, answer_uk,
  question_ru, answer_ru
) VALUES (
  'reparole-u4u-what-is',
  'parole',
  true,
  now(),
  'What is Re-Parole under the Uniting for Ukraine (U4U) program?',
  'Re-parole is the process that allows certain Ukrainians who entered the U.S. under the U4U humanitarian parole program to apply for a new period of parole when their initial parole is expiring. Applicants file Form I-131 with USCIS. As of June 2025, USCIS reviews re-parole requests on a case-by-case basis. Source: uscis.gov/humanitarian/uniting-for-ukraine/re-parole-process-for-certain-ukrainian-citizens-and-their-immediate-family-members',
  '¿Qué es el Re-Parole bajo el programa Uniting for Ukraine (U4U)?',
  'El re-parole es el proceso que permite a ciertos ucranianos que ingresaron a los EE.UU. bajo el programa de parole humanitario U4U solicitar un nuevo período de parole cuando su parole inicial está por expirar. Los solicitantes presentan el Formulario I-131 ante USCIS. A partir de junio de 2025, USCIS revisa las solicitudes de re-parole caso por caso.',
  'Що таке повторний парол за програмою Uniting for Ukraine (U4U)?',
  'Повторний парол — це процес, який дозволяє певним українцям, що в''їхали до США за програмою гуманітарного паролу U4U, подати заявку на новий період паролу, коли їх первісний парол закінчується. Заявники подають Форму I-131 до USCIS. З червня 2025 року USCIS розглядає запити на повторний парол в індивідуальному порядку.',
  'Что такое повторный пароль по программе Uniting for Ukraine (U4U)?',
  'Повторный пароль — это процесс, позволяющий определённым гражданам Украины, въехавшим в США по гуманитарной программе U4U, подать заявление на новый период пароля при истечении первоначального. Заявители подают Форму I-131 в USCIS. С июня 2025 года USCIS рассматривает запросы на повторный пароль в индивидуальном порядке.'
)
ON CONFLICT (slug) DO UPDATE SET
  question_es = EXCLUDED.question_es,
  answer_es   = EXCLUDED.answer_es,
  question_uk = EXCLUDED.question_uk,
  answer_uk   = EXCLUDED.answer_uk,
  question_ru = EXCLUDED.question_ru,
  answer_ru   = EXCLUDED.answer_ru,
  updated_at  = now();

-- Q2: When can I apply for re-parole?
INSERT INTO public.canonical_answers (
  slug, category, is_published, verified_at,
  question_en, answer_en,
  question_es, answer_es,
  question_uk, answer_uk,
  question_ru, answer_ru
) VALUES (
  'reparole-u4u-when-apply',
  'parole',
  true,
  now(),
  'When can I apply for U4U re-parole?',
  'USCIS allows filing no earlier than 180 days (6 months) before your current parole expires. Do not wait until the last days — processing takes significant time. Check your parole expiration date on your I-94 record at i94.cbp.dhs.gov.',
  '¿Cuándo puedo solicitar el re-parole U4U?',
  'USCIS permite presentar la solicitud no antes de 180 días (6 meses) antes de que expire su parole actual. No espere hasta los últimos días — el procesamiento toma tiempo significativo. Verifique su fecha de vencimiento en su registro I-94 en i94.cbp.dhs.gov.',
  'Коли я можу подати заявку на повторний парол U4U?',
  'USCIS дозволяє подавати заявку не раніше ніж за 180 днів (6 місяців) до закінчення вашого поточного паролу. Не чекайте до останніх днів — обробка займає значний час. Перевірте дату закінчення паролу в записі I-94 на i94.cbp.dhs.gov.',
  'Когда можно подать заявление на повторный пароль U4U?',
  'USCIS разрешает подачу не ранее чем за 180 дней (6 месяцев) до истечения текущего пароля. Не ждите до последних дней — рассмотрение занимает значительное время. Проверьте дату окончания пароля в записи I-94 на i94.cbp.dhs.gov.'
)
ON CONFLICT (slug) DO UPDATE SET
  question_es = EXCLUDED.question_es,
  answer_es   = EXCLUDED.answer_es,
  question_uk = EXCLUDED.question_uk,
  answer_uk   = EXCLUDED.answer_uk,
  question_ru = EXCLUDED.question_ru,
  answer_ru   = EXCLUDED.answer_ru,
  updated_at  = now();

-- Q3: What form do I need?
INSERT INTO public.canonical_answers (
  slug, category, is_published, verified_at,
  question_en, answer_en,
  question_es, answer_es,
  question_uk, answer_uk,
  question_ru, answer_ru
) VALUES (
  'reparole-u4u-which-form',
  'parole',
  true,
  now(),
  'What form do I need for U4U re-parole?',
  'File Form I-131 (Application for Travel Document), edition 02/27/26. This is the current edition as of April 1, 2026. Do not use older editions — USCIS may reject them. Download from https://www.uscis.gov/i-131',
  '¿Qué formulario necesito para el re-parole U4U?',
  'Presente el Formulario I-131 (Solicitud de Documento de Viaje), edición 02/27/26. Esta es la edición vigente a partir del 1 de abril de 2026. No use ediciones anteriores — USCIS puede rechazarlas. Descargue en https://www.uscis.gov/i-131',
  'Яку форму мені потрібно заповнити для повторного паролу U4U?',
  'Подайте Форму I-131 (Заявка на Документ для Подорожей), видання 02/27/26. Це поточне видання станом на 1 квітня 2026 року. Не використовуйте старіші видання — USCIS може їх відхилити. Завантажте на https://www.uscis.gov/i-131',
  'Какая форма нужна для повторного пароля U4U?',
  'Подайте Форму I-131 (Заявление о выдаче документа для путешествий), издание 02/27/26. Это актуальное издание по состоянию на 1 апреля 2026 года. Не используйте более старые издания — USCIS может их отклонить. Скачать на https://www.uscis.gov/i-131'
)
ON CONFLICT (slug) DO UPDATE SET
  question_es = EXCLUDED.question_es,
  answer_es   = EXCLUDED.answer_es,
  question_uk = EXCLUDED.question_uk,
  answer_uk   = EXCLUDED.answer_uk,
  question_ru = EXCLUDED.question_ru,
  answer_ru   = EXCLUDED.answer_ru,
  updated_at  = now();

-- Q4: What does "Ukraine RE-PAROLE" at the top mean?
INSERT INTO public.canonical_answers (
  slug, category, is_published, verified_at,
  question_en, answer_en,
  question_es, answer_es,
  question_uk, answer_uk,
  question_ru, answer_ru
) VALUES (
  'reparole-u4u-top-of-form',
  'parole',
  true,
  now(),
  'What does writing "Ukraine RE-PAROLE" at the top of Form I-131 mean?',
  'USCIS officially instructs Ukrainian re-parole applicants to handwrite "Ukraine RE-PAROLE" in pen at the very top of the paper form. This helps USCIS route the application to the correct processing team. This instruction is on the official USCIS re-parole page at uscis.gov.',
  '¿Qué significa escribir "Ukraine RE-PAROLE" en la parte superior del Formulario I-131?',
  'USCIS instruye oficialmente a los solicitantes de re-parole ucranianos a escribir a mano "Ukraine RE-PAROLE" con bolígrafo en la parte superior del formulario en papel. Esto ayuda a USCIS a enrutar la solicitud al equipo de procesamiento correcto. Esta instrucción está en la página oficial de re-parole de USCIS.',
  'Що означає написання "Ukraine RE-PAROLE" у верхній частині Форми I-131?',
  'USCIS офіційно інструктує українських заявників на повторний парол писати від руки "Ukraine RE-PAROLE" ручкою у самому верху паперової форми. Це допомагає USCIS направити заявку до правильної команди обробки. Ця інструкція є на офіційній сторінці USCIS з повторного паролу.',
  'Что означает надпись "Ukraine RE-PAROLE" в верхней части формы I-131?',
  'USCIS официально инструктирует украинских заявителей на повторный пароль писать от руки "Ukraine RE-PAROLE" ручкой в самом верху бумажной формы. Это помогает USCIS направить заявление в правильную команду обработки. Эта инструкция размещена на официальной странице USCIS о повторном пароле.'
)
ON CONFLICT (slug) DO UPDATE SET
  question_es = EXCLUDED.question_es,
  answer_es   = EXCLUDED.answer_es,
  question_uk = EXCLUDED.question_uk,
  answer_uk   = EXCLUDED.answer_uk,
  question_ru = EXCLUDED.question_ru,
  answer_ru   = EXCLUDED.answer_ru,
  updated_at  = now();

-- Q5: What is the correct item on Form I-131?
INSERT INTO public.canonical_answers (
  slug, category, is_published, verified_at,
  question_en, answer_en,
  question_es, answer_es,
  question_uk, answer_uk,
  question_ru, answer_ru
) VALUES (
  'reparole-u4u-form-item',
  'parole',
  true,
  now(),
  'What is the correct item to select on Form I-131 for U4U re-parole?',
  'For paper filing: check Part 2, Item 1.e ("I am outside the United States, and I am applying for Advance Parole Document") — select this EVEN IF you are inside the US. For online filing: select "I am outside the United States applying for Advance Parole Document" from the dropdown, then answer "Yes" to the re-parole question. IMPORTANT: Item 10.C was used under the old streamlined process, which was eliminated in June 2025. Item 10.C is no longer correct.',
  '¿Cuál es el ítem correcto a seleccionar en el Formulario I-131 para el re-parole U4U?',
  'Para presentación en papel: marque la Parte 2, Ítem 1.e ("Estoy fuera de los Estados Unidos y estoy solicitando un Documento de Parole Adelantado") — seleccione esto INCLUSO SI está dentro de los EE.UU. Para presentación en línea: seleccione "Estoy fuera de los Estados Unidos solicitando un Documento de Parole Adelantado" en el menú desplegable. IMPORTANTE: El Ítem 10.C fue eliminado en junio de 2025 y ya no es correcto.',
  'Який правильний пункт для вибору у Формі I-131 для повторного паролу U4U?',
  'Для паперової подачі: відмітьте Частину 2, Пункт 1.e ("Я перебуваю за межами США і подаю заявку на Документ Advance Parole") — виберіть це НАВІТЬ ЯКЩО ви перебуваєте в США. Для онлайн-подачі: виберіть відповідний пункт зі спадного списку. ВАЖЛИВО: Пункт 10.C використовувався за старим спрощеним процесом, скасованим у червні 2025 року. Пункт 10.C більше не є правильним.',
  'Какой правильный пункт нужно выбрать в форме I-131 для повторного пароля U4U?',
  'Для бумажной подачи: отметьте Часть 2, Пункт 1.e ("Я нахожусь за пределами США и подаю заявление на документ Advance Parole") — выберите это, ДАЖЕ ЕСЛИ вы находитесь в США. Для онлайн-подачи: выберите соответствующий пункт из раскрывающегося списка. ВАЖНО: Пункт 10.C использовался по старому упрощённому процессу, отменённому в июне 2025 года. Пункт 10.C больше не является правильным.'
)
ON CONFLICT (slug) DO UPDATE SET
  question_es = EXCLUDED.question_es,
  answer_es   = EXCLUDED.answer_es,
  question_uk = EXCLUDED.question_uk,
  answer_uk   = EXCLUDED.answer_uk,
  question_ru = EXCLUDED.question_ru,
  answer_ru   = EXCLUDED.answer_ru,
  updated_at  = now();

-- Q6: What are the USCIS fees?
INSERT INTO public.canonical_answers (
  slug, category, is_published, verified_at,
  question_en, answer_en,
  question_es, answer_es,
  question_uk, answer_uk,
  question_ru, answer_ru
) VALUES (
  'reparole-u4u-fees',
  'parole',
  true,
  now(),
  'What are the USCIS fees for U4U re-parole?',
  'USCIS charges two separate fees: (1) a filing fee paid when you submit Form I-131, and (2) a parole grant fee charged upon conditional approval. Fee amounts change — never rely on third-party sources. Use the official USCIS Fee Calculator at uscis.gov/feecalculator and check the G-1055 fee schedule at uscis.gov/g-1055.',
  '¿Cuáles son las tarifas de USCIS para el re-parole U4U?',
  'USCIS cobra dos tarifas por separado: (1) una tarifa de presentación que se paga al enviar el Formulario I-131, y (2) una tarifa de concesión de parole cobrada al recibir aprobación condicional. Los montos de las tarifas cambian — nunca dependa de fuentes de terceros. Use la Calculadora de Tarifas oficial de USCIS en uscis.gov/feecalculator y el programa de tarifas G-1055 en uscis.gov/g-1055.',
  'Які збори USCIS стягує за повторний парол U4U?',
  'USCIS стягує два окремі збори: (1) збір за подачу, який сплачується при поданні Форми I-131, і (2) збір за надання паролу, який стягується при умовному схваленні. Суми зборів змінюються — ніколи не покладайтесь на сторонні джерела. Використовуйте офіційний Калькулятор зборів USCIS на uscis.gov/feecalculator та розклад зборів G-1055 на uscis.gov/g-1055.',
  'Каковы сборы USCIS за повторный пароль U4U?',
  'USCIS взимает два отдельных сбора: (1) сбор за подачу заявления при отправке Формы I-131 и (2) сбор за предоставление пароля при условном одобрении. Суммы сборов меняются — никогда не полагайтесь на сторонние источники. Используйте официальный Калькулятор сборов USCIS на uscis.gov/feecalculator и расписание сборов G-1055 на uscis.gov/g-1055.'
)
ON CONFLICT (slug) DO UPDATE SET
  question_es = EXCLUDED.question_es,
  answer_es   = EXCLUDED.answer_es,
  question_uk = EXCLUDED.question_uk,
  answer_uk   = EXCLUDED.answer_uk,
  question_ru = EXCLUDED.question_ru,
  answer_ru   = EXCLUDED.answer_ru,
  updated_at  = now();

-- Q7: Is a fee waiver available?
INSERT INTO public.canonical_answers (
  slug, category, is_published, verified_at,
  question_en, answer_en,
  question_es, answer_es,
  question_uk, answer_uk,
  question_ru, answer_ru
) VALUES (
  'reparole-u4u-fee-waiver',
  'parole',
  true,
  now(),
  'Is a fee waiver available for U4U re-parole?',
  'If you are unable to pay the filing fee, you may request a fee waiver using Form I-912 (Request for Fee Waiver). Fee waiver requests are typically for paper-only filing. Verify current USCIS eligibility requirements at uscis.gov/i-912 before submitting.',
  '¿Hay una exención de tarifas disponible para el re-parole U4U?',
  'Si no puede pagar la tarifa de presentación, puede solicitar una exención de tarifas usando el Formulario I-912 (Solicitud de Exención de Tarifas). Las solicitudes de exención de tarifas son típicamente solo para presentación en papel. Verifique los requisitos de elegibilidad actuales de USCIS en uscis.gov/i-912 antes de presentar.',
  'Чи доступне звільнення від сплати зборів для повторного паролу U4U?',
  'Якщо ви не можете сплатити збір за подачу, ви можете подати запит на звільнення від сплати зборів за допомогою Форми I-912 (Запит на звільнення від сплати зборів). Запити на звільнення від сплати, як правило, доступні лише для паперової подачі. Перевірте актуальні вимоги USCIS до права на звільнення на uscis.gov/i-912 перед поданням.',
  'Доступно ли освобождение от уплаты сборов для повторного пароля U4U?',
  'Если вы не можете оплатить сбор за подачу, вы можете подать запрос на освобождение от уплаты сборов с помощью Формы I-912 (Запрос на освобождение от уплаты сборов). Запросы на освобождение от уплаты, как правило, доступны только для бумажной подачи. Проверьте актуальные требования USCIS к праву на освобождение на uscis.gov/i-912 перед подачей.'
)
ON CONFLICT (slug) DO UPDATE SET
  question_es = EXCLUDED.question_es,
  answer_es   = EXCLUDED.answer_es,
  question_uk = EXCLUDED.question_uk,
  answer_uk   = EXCLUDED.answer_uk,
  question_ru = EXCLUDED.question_ru,
  answer_ru   = EXCLUDED.answer_ru,
  updated_at  = now();

-- Q8: What medical documentation is required?
INSERT INTO public.canonical_answers (
  slug, category, is_published, verified_at,
  question_en, answer_en,
  question_es, answer_es,
  question_uk, answer_uk,
  question_ru, answer_ru
) VALUES (
  'reparole-u4u-medical',
  'parole',
  true,
  now(),
  'What medical documentation is required for U4U re-parole?',
  'USCIS requires medical attestation for U4U re-parole, including proof of vaccinations and TB/IGRA test where applicable. Follow the current USCIS instructions for medical requirements, as these can change. Verify at the official USCIS re-parole page.',
  '¿Qué documentación médica se requiere para el re-parole U4U?',
  'USCIS requiere atestación médica para el re-parole U4U, incluyendo prueba de vacunas y prueba de TB/IGRA cuando corresponda. Siga las instrucciones actuales de USCIS para los requisitos médicos, ya que pueden cambiar. Verifique en la página oficial de re-parole de USCIS.',
  'Яка медична документація потрібна для повторного паролу U4U?',
  'USCIS вимагає медичного засвідчення для повторного паролу U4U, включаючи підтвердження вакцинації та тест TB/IGRA де це застосовно. Дотримуйтесь поточних інструкцій USCIS щодо медичних вимог, оскільки вони можуть змінюватися. Перевірте на офіційній сторінці USCIS з повторного паролу.',
  'Какая медицинская документация требуется для повторного пароля U4U?',
  'USCIS требует медицинского подтверждения для повторного пароля U4U, включая доказательство вакцинации и тест TB/IGRA там, где это применимо. Следуйте актуальным инструкциям USCIS по медицинским требованиям, так как они могут меняться. Проверьте на официальной странице USCIS о повторном пароле.'
)
ON CONFLICT (slug) DO UPDATE SET
  question_es = EXCLUDED.question_es,
  answer_es   = EXCLUDED.answer_es,
  question_uk = EXCLUDED.question_uk,
  answer_uk   = EXCLUDED.answer_uk,
  question_ru = EXCLUDED.question_ru,
  answer_ru   = EXCLUDED.answer_ru,
  updated_at  = now();

-- Q9: When can I apply for EAD?
INSERT INTO public.canonical_answers (
  slug, category, is_published, verified_at,
  question_en, answer_en,
  question_es, answer_es,
  question_uk, answer_uk,
  question_ru, answer_ru
) VALUES (
  'reparole-u4u-ead-timing',
  'parole',
  true,
  now(),
  'When can I apply for an Employment Authorization Document (EAD) based on my re-parole?',
  'Do NOT file Form I-765 for employment authorization based on your re-parole request until your I-131 has been approved and USCIS guidance specifically authorizes EAD filing. Filing too early can result in rejection. EAD category for re-parolees is (c)(11) on Form I-765. Verify current USCIS instructions at uscis.gov/i-765.',
  '¿Cuándo puedo solicitar un Documento de Autorización de Empleo (EAD) basado en mi re-parole?',
  'NO presente el Formulario I-765 para autorización de empleo basada en su solicitud de re-parole hasta que su I-131 haya sido APROBADO y las instrucciones de USCIS autoricen específicamente la presentación del EAD. Presentar demasiado pronto puede resultar en rechazo. La categoría de EAD para re-parolees es (c)(11) en el Formulario I-765.',
  'Коли я можу подати заявку на Документ про Дозвіл на Роботу (EAD) на основі мого повторного паролу?',
  'НЕ подавайте Форму I-765 для отримання дозволу на роботу на підставі вашого запиту на повторний парол до тих пір, поки ваш I-131 не буде СХВАЛЕНИЙ і вказівки USCIS конкретно не дозволять подачу EAD. Занадто рання подача може призвести до відмови. Категорія EAD для re-parolees — (c)(11) у Формі I-765.',
  'Когда я могу подать заявление на разрешение на работу (EAD) на основании повторного пароля?',
  'НЕ подавайте Форму I-765 на разрешение на работу на основании запроса на повторный пароль до тех пор, пока ваш I-131 не будет ОДОБРЕН и инструкции USCIS конкретно не разрешат подачу EAD. Слишком ранняя подача может привести к отказу. Категория EAD для re-parolees — (c)(11) в Форме I-765.'
)
ON CONFLICT (slug) DO UPDATE SET
  question_es = EXCLUDED.question_es,
  answer_es   = EXCLUDED.answer_es,
  question_uk = EXCLUDED.question_uk,
  answer_uk   = EXCLUDED.answer_uk,
  question_ru = EXCLUDED.question_ru,
  answer_ru   = EXCLUDED.answer_ru,
  updated_at  = now();

-- Q10: How long does processing take?
INSERT INTO public.canonical_answers (
  slug, category, is_published, verified_at,
  question_en, answer_en,
  question_es, answer_es,
  question_uk, answer_uk,
  question_ru, answer_ru
) VALUES (
  'reparole-u4u-processing-time',
  'parole',
  true,
  now(),
  'How long does USCIS take to process a U4U re-parole application?',
  'USCIS processing times vary significantly and change frequently. Do not rely on fixed estimates. Check current processing time data at https://egov.uscis.gov/processing-times/ and plan for substantial waiting periods. File as early as allowed (within 180 days before parole expiration).',
  '¿Cuánto tiempo tarda USCIS en procesar una solicitud de re-parole U4U?',
  'Los tiempos de procesamiento de USCIS varían significativamente y cambian con frecuencia. No dependa de estimados fijos. Consulte los datos actuales de tiempo de procesamiento en https://egov.uscis.gov/processing-times/ y planifique para períodos de espera sustanciales. Presente la solicitud tan pronto como sea permitido (dentro de 180 días antes del vencimiento del parole).',
  'Скільки часу USCIS обробляє заявку на повторний парол U4U?',
  'Терміни обробки USCIS значно варіюються і часто змінюються. Не покладайтесь на фіксовані оцінки. Перевіряйте поточні дані про терміни обробки на https://egov.uscis.gov/processing-times/ та плануйте з урахуванням значних термінів очікування. Подавайте якомога раніше (в межах 180 днів до закінчення паролу).',
  'Сколько времени USCIS рассматривает заявление на повторный пароль U4U?',
  'Сроки рассмотрения USCIS значительно варьируются и часто меняются. Не полагайтесь на фиксированные оценки. Проверяйте актуальные данные о сроках рассмотрения на https://egov.uscis.gov/processing-times/ и планируйте с учётом значительного ожидания. Подавайте как можно раньше (в пределах 180 дней до истечения пароля).'
)
ON CONFLICT (slug) DO UPDATE SET
  question_es = EXCLUDED.question_es,
  answer_es   = EXCLUDED.answer_es,
  question_uk = EXCLUDED.question_uk,
  answer_uk   = EXCLUDED.answer_uk,
  question_ru = EXCLUDED.question_ru,
  answer_ru   = EXCLUDED.answer_ru,
  updated_at  = now();

-- Q11: Where can I get legal help?
INSERT INTO public.canonical_answers (
  slug, category, is_published, verified_at,
  question_en, answer_en,
  question_es, answer_es,
  question_uk, answer_uk,
  question_ru, answer_ru
) VALUES (
  'reparole-u4u-legal-help',
  'parole',
  true,
  now(),
  'Where can I get legal help with my U4U re-parole application?',
  'For legal advice specific to your situation, contact a licensed immigration attorney or a DOJ-accredited representative. The DOJ maintains a list of recognized organizations and accredited representatives at https://www.justice.gov/eoir/list-of-pro-bono-legal-service-providers. Messenginfo is not a law firm and cannot provide legal advice.',
  '¿Dónde puedo obtener ayuda legal con mi solicitud de re-parole U4U?',
  'Para asesoría legal específica para su situación, contacte a un abogado de inmigración licenciado o a un representante acreditado por el DOJ. El DOJ mantiene una lista de organizaciones reconocidas y representantes acreditados en https://www.justice.gov/eoir/list-of-pro-bono-legal-service-providers. Messenginfo no es un bufete de abogados y no puede proporcionar asesoría legal.',
  'Де я можу отримати юридичну допомогу щодо моєї заявки на повторний парол U4U?',
  'Для отримання юридичної поради щодо вашої конкретної ситуації зверніться до ліцензованого імміграційного адвоката або акредитованого DOJ представника. DOJ підтримує список визнаних організацій та акредитованих представників на https://www.justice.gov/eoir/list-of-pro-bono-legal-service-providers. Messenginfo не є юридичною фірмою і не може надавати юридичні консультації.',
  'Где я могу получить юридическую помощь с заявлением на повторный пароль U4U?',
  'Для получения юридической консультации по вашей конкретной ситуации обратитесь к лицензированному иммиграционному адвокату или аккредитованному DOJ представителю. DOJ ведёт список признанных организаций и аккредитованных представителей на https://www.justice.gov/eoir/list-of-pro-bono-legal-service-providers. Messenginfo не является юридической фирмой и не может давать юридические консультации.'
)
ON CONFLICT (slug) DO UPDATE SET
  question_es = EXCLUDED.question_es,
  answer_es   = EXCLUDED.answer_es,
  question_uk = EXCLUDED.question_uk,
  answer_uk   = EXCLUDED.answer_uk,
  question_ru = EXCLUDED.question_ru,
  answer_ru   = EXCLUDED.answer_ru,
  updated_at  = now();

-- Q12: Is the U4U program currently active?
INSERT INTO public.canonical_answers (
  slug, category, is_published, verified_at,
  question_en, answer_en,
  question_es, answer_es,
  question_uk, answer_uk,
  question_ru, answer_ru
) VALUES (
  'reparole-u4u-program-status',
  'parole',
  true,
  now(),
  'Is the U4U re-parole program currently active?',
  'As of 2026-05-03: The U4U re-parole program was paused on January 27, 2025, placed on administrative hold on February 14, 2025, and resumed on June 9, 2025 by federal court order. USCIS is currently processing requests on a case-by-case basis. The streamlined re-parole process has been eliminated. Always verify current program status at uscis.gov before filing, as it may change.',
  '¿Está vigente el programa de re-parole U4U actualmente?',
  'A fecha de 2026-05-03: El programa de re-parole U4U fue suspendido el 27 de enero de 2025, puesto en espera administrativa el 14 de febrero de 2025, y reanudado el 9 de junio de 2025 por orden judicial federal. USCIS actualmente procesa las solicitudes caso por caso. El proceso de re-parole simplificado ha sido eliminado. Verifique siempre el estado actual del programa en uscis.gov antes de presentar, ya que puede cambiar.',
  'Чи діє зараз програма повторного паролу U4U?',
  'Станом на 2026-05-03: Програма повторного паролу U4U була призупинена 27 січня 2025 року, переведена на адміністративне утримання 14 лютого 2025 року та відновлена 9 червня 2025 року за рішенням федерального суду. USCIS зараз розглядає запити в індивідуальному порядку. Спрощений процес повторного паролу скасовано. Завжди перевіряйте поточний статус програми на uscis.gov перед поданням, оскільки він може змінитися.',
  'Действует ли сейчас программа повторного пароля U4U?',
  'По состоянию на 2026-05-03: Программа повторного пароля U4U была приостановлена 27 января 2025 года, переведена на административное удержание 14 февраля 2025 года и возобновлена 9 июня 2025 года по решению федерального суда. USCIS в настоящее время рассматривает запросы в индивидуальном порядке. Упрощённый процесс повторного пароля ликвидирован. Всегда проверяйте актуальный статус программы на uscis.gov перед подачей, так как он может измениться.'
)
ON CONFLICT (slug) DO UPDATE SET
  question_es = EXCLUDED.question_es,
  answer_es   = EXCLUDED.answer_es,
  question_uk = EXCLUDED.question_uk,
  answer_uk   = EXCLUDED.answer_uk,
  question_ru = EXCLUDED.question_ru,
  answer_ru   = EXCLUDED.answer_ru,
  updated_at  = now();
