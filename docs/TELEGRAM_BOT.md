# بوت Telegram المحلي

## النطاق

القناة تعمل محليًا عبر Telegram Bot API باستخدام long polling. لا يوجد webhook أو خادم inbound. يقبل البوت المحادثات الخاصة فقط، ويمرر الأسئلة إلى `AnswerRequestService` بالقناة `telegram` كي تستخدم الإجابة وسجل الطلب نفسيهما المستخدمين في الويب.

## الإعداد والتشغيل

أنشئ بوتًا لدى BotFather محليًا، ثم ضع القيم في `.env.local` ولا تلتزم بها في Git:

```env
TELEGRAM_BOT_TOKEN=ضع-token-الحقيقي-محليًا
TELEGRAM_SESSION_SECRET=ضع-سرًا-عشوائيًا-منفصلًا-بطول-32-حرفًا-على-الأقل
TELEGRAM_DATABASE_FILE=data/telegram.sqlite
TELEGRAM_POLL_TIMEOUT_SECONDS=30
TELEGRAM_HTTP_TIMEOUT_MS=40000
TELEGRAM_RETRY_DELAY_MS=1000
TELEGRAM_UPDATE_LEASE_MS=120000
TELEGRAM_RATE_LIMIT_COUNT=5
TELEGRAM_RATE_LIMIT_WINDOW_MS=60000
TELEGRAM_HISTORY_TTL_MS=1800000
```

شغّل البوت:

```bash
npm run telegram:poll
```

يرفض runner البدء عند غياب token أو سر الجلسة، أو إذا كان سر الجلسة أقصر من 32 حرفًا. يغلق polling وقاعدة البيانات عند `SIGINT` أو `SIGTERM`.

## السلوك

- `/start` يعرض الترحيب واختيار اللغة.
- `/language` يعرض أزرار العربية والإنجليزية والسواحيلية.
- الأسئلة محدودة إلى 2000 حرف، والافتراضي 5 أسئلة لكل 60 ثانية لكل جلسة.
- الردود الأطول من 4096 تُقسّم على حدود Unicode مع تفضيل حدود الفقرات.
- history لا تتجاوز 8 turns، وتعيش في الذاكرة فقط حتى انتهاء TTL أو إعادة التشغيل.

## الخصوصية والتعافي

قاعدة `TELEGRAM_DATABASE_FILE` منفصلة عن قواعد المنتج. جدول الجلسات يحفظ اللغة ومفتاح HMAC-SHA256 مشتقًا من chat id باستخدام `TELEGRAM_SESSION_SECRET`؛ لا يحفظ chat id الخام. جدول updates يحفظ update id والحالة `processing/completed` والـlease وعدد المحاولات فقط. لا تُحفظ الأسئلة أو history في قاعدة Telegram.

يُحجز كل update ذريًا قبل المعالجة. update المكتمل لا يعاد، والحجز النشط يمنع معالجته بالتزامن، والحجز المنتهي أو المحرر بعد الفشل قابل لإعادة المحاولة. لا يتقدم polling offset قبل النجاح أو التجاهل النهائي. أخطاء Telegram أو خدمة الإجابة لا تعيد token أو URL أو نص الخطأ الداخلي إلى المستخدم.

## الاختبارات

كل اختبارات Telegram تستخدم عملاء وهميين وSQLite مؤقتًا أو في الذاكرة؛ لا تنفذ شبكة حقيقية:

```bash
npm run test:local
npm run typecheck
npm run build
```
