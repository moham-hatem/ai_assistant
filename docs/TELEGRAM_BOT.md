# بوت Telegram المحلي

## النطاق

القناة تعمل محليًا عبر Telegram Bot API باستخدام long polling. لا يوجد webhook أو خادم inbound. يقبل البوت المحادثات الخاصة فقط، ويمرر الأسئلة إلى `AnswerRequestService` بالقناة `telegram` كي تستخدم الإجابة وسجل الطلب نفسيهما المستخدمين في الويب.

## الإعداد والتشغيل

أنشئ بوتًا لدى BotFather، ثم ولّد سر الجلسة محليًا. الأمر لا يطبع السر ولا يستبدل قيمة موجودة:

```bash
npm run telegram:init
```

ضع token الحقيقي فقط في `.env.local` ولا تلتزم به في Git:

```env
TELEGRAM_BOT_TOKEN=ضع-token-الحقيقي-محليًا
TELEGRAM_DATABASE_FILE=data/telegram.sqlite
TELEGRAM_RUNTIME_STATUS_FILE=data/telegram-runtime-status.json
TELEGRAM_POLL_TIMEOUT_SECONDS=30
TELEGRAM_HTTP_TIMEOUT_MS=40000
TELEGRAM_MODEL_TIMEOUT_MS=15000
TELEGRAM_PROCESSING_DEADLINE_MS=130000
TELEGRAM_RETRY_DELAY_MS=1000
TELEGRAM_UPDATE_LEASE_MS=150000
TELEGRAM_RATE_LIMIT_COUNT=5
TELEGRAM_RATE_LIMIT_WINDOW_MS=60000
TELEGRAM_HISTORY_TTL_MS=1800000
```

شغّل البوت:

```bash
npm run telegram:poll
```

يتحقق runner من هوية البوت عبر Telegram ويسجل قائمة أوامره قبل polling. يرفض البدء عند غياب token أو سر الجلسة، أو عند token غير صالح، webhook متعارض، أو وجود poller آخر. عند أول تشغيل بلا مستخدم مصرح يطبع رابط اقتران سريًا؛ أول حساب يفتحه يصبح المستخدم الوحيد المصرح له، ولا ينبغي مشاركة الرابط. يغلق polling وقاعدة البيانات عند `SIGINT` أو `SIGTERM`.

## السلوك

- `/start <رمز-الاقتران>` يربط أول مستخدم، ثم يعرض الترحيب واختيار اللغة.
- `/language` يعرض أزرار العربية والإنجليزية والسواحيلية.
- `/help` يعرض المساعدة، و`/privacy` يشرح التخزين، و`/reset` يمسح سياق المحادثة القصير.
- المستخدمون غير المصرح لهم والمجموعات والوسائط غير النصية يتلقون ردًا آمنًا مناسبًا بدل تمريرها للمساعد.
- الأسئلة محدودة إلى 2000 حرف، والافتراضي 5 أسئلة لكل 60 ثانية لكل جلسة.
- الردود الأطول من 4096 تُقسّم على حدود Unicode مع تفضيل حدود الفقرات.
- history لا تتجاوز 8 turns، وتعيش في الذاكرة فقط حتى انتهاء TTL أو إعادة التشغيل.

## الخصوصية والتعافي

قاعدة `TELEGRAM_DATABASE_FILE` منفصلة عن قواعد المنتج. جدول الجلسات يحفظ اللغة وحالة التصريح ومفتاح HMAC-SHA256 مشتقًا من chat id باستخدام `TELEGRAM_SESSION_SECRET`؛ لا يحفظ chat id الخام. جدول updates يحفظ update id والحالة `processing/completed` والـlease وعدد المحاولات فقط. لا تُحفظ نصوص الأسئلة أو history في قاعدة Telegram، لكن `AnswerRequestService` يسجل السؤال ونتيجة التنفيذ في سجل الأسئلة المركزي لمراجعة الجودة والمعلمين.

يُحجز كل update ذريًا قبل المعالجة. update المكتمل لا يعاد، والحجز النشط يمنع معالجته بالتزامن، والحجز المنتهي أو المحرر بعد الفشل قابل لإعادة المحاولة. لا يتقدم polling offset قبل النجاح أو التجاهل النهائي. أخطاء Telegram أو خدمة الإجابة لا تعيد token أو URL أو نص الخطأ الداخلي إلى المستخدم.

يكتب البوت حالة تشغيل آمنة تقرؤها صفحة تشخيص النظام: هوية البوت العامة والرابط العام وآخر poll ناجح وعدد المحاولات ورمز خطأ من قائمة محدودة. لا يحتوي الملف على token أو chat id أو نص خطأ خام، ولا تتيح لوحة الإدارة تشغيل البوت أو إيقافه.

هذه نسخة تجريبية مغلقة لمستخدم واحد وليست جاهزة للإتاحة العامة. ما زال يلزم قبل الإعلان العام rate limit دائم وعالمي، سياسة احتفاظ دورية لقاعدة Telegram، وضمان أدق لاستكمال إرسال الردود المقسمة بعد تعطل جزئي.

## الاختبارات

كل اختبارات Telegram تستخدم عملاء وهميين وSQLite مؤقتًا أو في الذاكرة؛ لا تنفذ شبكة حقيقية:

```bash
npm run test:local
npm run typecheck
npm run build
```
