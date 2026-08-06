# دليل — المساعد التعليمي الإسلامي

نسخة محلية أولية لمساعد متعدد اللغات يجيب من الكتب والمناهج المعتمدة فقط.

## التشغيل المحلي

1. انسخ `.env.example` إلى `.env.local`.
2. ضع مفتاح OpenCode في `OPENCODE_API_KEY` داخل `.env.local`، ولا ترسله إلى الشات أو تضعه في متغير يبدأ بـ`VITE_`.
3. افتح تبويب «الكتب» وارفع ملفات TXT أو Markdown أو PDF أو Word حتى 100 ميجابايت.
4. شغّل المشروع:

```bash
npm install
npm run dev
```

يفتح الموقع على `http://127.0.0.1:5173`. يشغّل Vite الواجهة وAPI المحلي معًا؛ لا يحتاج التشغيل الحالي إلى Supabase أو Docker أو قاعدة بيانات.

## الإعدادات

```env
OPENCODE_API_KEY=ضع-المفتاح-هنا
OPENCODE_MODEL=deepseek-v4-flash-free
OPENCODE_FALLBACK_MODELS=nemotron-3-ultra-free,ling-3.0-flash-free,laguna-s-2.1-free
OPENCODE_API_ENDPOINT=https://opencode.ai/zen/v1/chat/completions
OPENCODE_TIMEOUT_MS=60000
KNOWLEDGE_DIRECTORY=data/knowledge
DOCUMENT_DIRECTORY=data/documents
KNOWLEDGE_MATCH_COUNT=6
EMBEDDING_MODEL=Xenova/multilingual-e5-small
EMBEDDING_CACHE_DIRECTORY=data/models
TRANSLATION_MODEL=Xenova/nllb-200-distilled-600M
TRANSLATION_CACHE_DIRECTORY=data/models
SEMANTIC_MIN_SCORE=0.76
ANSWER_CACHE_FILE=data/cache/answers.json
QUESTION_EXPANSION_CACHE_FILE=data/cache/question-expansions.json
QUESTION_EXPANSION_TIMEOUT_MS=12000
```

ملف `.env.local` مستبعد من Git. مفتاح OpenCode يُقرأ داخل خادم Vite المحلي فقط ولا يُضمّن في ملفات React.

## تدفق الإجابة

1. يختار المستخدم العربية أو الإنجليزية أو السواحيلية عند أول دخول، ويُحفظ اختياره محليًا على جهازه.
2. ترسل الواجهة السؤال ولغة الإجابة إلى `/api/answer-question` على نفس الخادم المحلي.
3. يوسّع الخادم المصطلحات غير المعروفة تلقائيًا إلى صيغ بحث عربية وإنجليزية وسواحيلية، ويحفظها محليًا لإعادة استخدامها.
4. يحوّل الخادم السؤال وصيغه والمقاطع إلى تمثيل دلالي متعدد اللغات، ثم يختار الأقرب في المعنى حتى لو اختلفت اللغة، ويضم إليه المقاطع المتتابعة من نفس الكتاب عندما تكون الإجابة ممتدة عبر صفحات.
5. إذا لم يجد دليلًا، لا يستدعي موديل الإجابة ويعيد اعتذارًا باللغة المختارة.
6. يرسل السؤال والمقاطع المختارة ولغة الإجابة إلى `deepseek-v4-flash-free` عبر OpenCode Zen.
   إذا تأخر الموديل الأساسي أو فشل مؤقتًا، تتسابق مجموعة النماذج المجانية المحددة في `OPENCODE_FALLBACK_MODELS`، ويُقبل أول رد يجتاز التحقق.
7. لا يقبل الناتج إلا إذا أشار الموديل إلى دليل صالح من المقاطع المرسلة واجتاز فحص جودة الإجراءات.
8. يفحص الخادم لغة الرد كاملة، ويرفض الإجابة المختلطة أو المخالفة للغة المختارة قبل عرضها أو حفظها، ثم يجرب نموذجًا آخر.
9. إذا تعطلت كل النماذج الخارجية، يعرض الخادم مقتطفًا محليًا فقط عندما يطابق اللغة المختارة؛ وإلا يعيد اعتذارًا آمنًا باللغة المختارة.
10. تُحفظ الإجابات الموثقة محليًا داخل `data/cache/answers.json`، فتعود الأسئلة المكررة فورًا دون استدعاء OpenCode مرة أخرى.

تحتفظ الواجهة بذاكرة قصيرة داخل جلسة المتصفح للأسئلة المتتابعة، من غير تخزين المحادثة على القرص.

## إدارة الكتب

مسار `#/admin/books` هو واجهة إدارة الكتب والإصدارات، ويحوّل المسار القديم `#knowledge` إليه للتوافق. تُحفظ النسخة الأصلية والنص المستخرج المرحلي والبيانات الوصفية داخل `data/documents`، ويقرأ البحث فقط الإصدارات المنشورة. يحافظ مسار مؤقت على المستندات القديمة غير المرتبطة اعتمادًا على metadata حتى ترحيلها إلى كتب وإصدارات. مجلدات المحتوى وقواعد SQLite المحلية مستبعدة من Git لحماية البيانات وتقليل حجم المستودع.

ملفات PDF ذات الطبقة النصية تُقرأ مع مراعاة مواضع الأسطر والتسلسلات المرقمة حتى لا تختلط خطوات الإنفوجرافيك. بعد تطوير المستخرج يمكن إعادة معالجة الكتب الموجودة باستخدام `npm run rebuild:documents`، ثم تحديث الفهرس عبر `npm run prepare:semantic`. يمكن تجهيز المترجم المحلي مسبقًا عبر `npm run prepare:translation`. ملفات PDF المصورة ضوئيًا دون طبقة نص ما زالت تحتاج OCR. تُحفظ النماذج المحلية داخل `data/models`.

الكتب والبحث والـBackend محليون. يستخدم النظام OpenCode لتحسين الصياغة، وعند تعطله يترجم NLLB الدليل محليًا إلى اللغة المختارة بعد تنزيل ملفاته مرة واحدة. لا تضع معلومات شخصية أو سرية في الأسئلة المرسلة إلى OpenCode.

## التحقق

```bash
npm run typecheck
npm run build
npm run test:local
npm audit
```

## وثائق المنتج

- [نطاق المنتج ومعايير القبول](docs/PRODUCT_SCOPE.md)
- [خارطة الطريق](docs/ROADMAP.md)
- [المعايير الهندسية](docs/ENGINEERING_STANDARDS.md)
- [اختبارات القبول المحلية](docs/ACCEPTANCE_TESTING.md)
- [Backend الكتب والإصدارات](docs/BOOKS_BACKEND.md)
- [Backend مراجعة المعلمين](docs/TEACHER_REVIEW_BACKEND.md)

راجع أيضًا [البنية المحلية](docs/ARCHITECTURE.md) و[إعداد OpenCode](docs/OPENCODE_SETUP.md). مجلد `supabase` محفوظ كمرجع لمرحلة استضافة مستقبلية، لكنه غير مستخدم في التشغيل الحالي.
