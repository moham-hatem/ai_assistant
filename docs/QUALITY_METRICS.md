# مقاييس الجودة والتشغيل المحلية

## النطاق وحدود الثقة

تقرأ لوحة `#/admin/quality` وواجهة `GET /api/internal/quality-metrics` تجميعات فقط من ملف
`question-log.sqlite` نفسه المستخدم لسجلات الأسئلة والتقييمات والمراجعات والإجابات المعتمدة.
المسار داخلي ومحلي لمشغّل موثوق. لا توجد مصادقة إدارية في التطبيق المحلي الحالي، ولا يُعد إخفاء
الرابط حدًا أمنيًا؛ يجب إضافة المصادقة والتفويض في الخادم قبل أي نشر. لم يضف هذا العمل مصادقة مفترضة.

لا تعيد الواجهة أسئلة أو إجابات أو اعتذارات أو تعليقات أو أسباب تقييم أو أدلة أو بيانات شخصية أو
معرّفات سجلات فردية. العقد يعيد أعدادًا ونسبًا ووسيط مدد وbreakdowns مجمعة فقط، إضافة إلى
`appliedFilters` و`generatedAt` و`requestId`.

## التعريفات الثابتة

- `answerAttempts`: كل `question_logs` التي يقع `started_at` لها ضمن الفترة.
- `answered` و`declined` و`failed`: حسب `question_logs.status`.
- `helpful` و`unhelpful`: حسب `feedback_entries.rating` للتقييمات التي يقع `created_at` لها ضمن الفترة.
- `satisfactionRate = helpful / (helpful + unhelpful)`، وتكون `null` عند عدم وجود تقييمات.
- `feedbackCoveredAnswerAttempts`: عدد محاولات الفترة المميزة التي لها تقييم واحد على الأقل داخل الفترة.
  لا يُعد السؤال أكثر من مرة حتى عند وجود تقييمات متعددة.
- `feedbackCoverageRate = feedbackCoveredAnswerAttempts / answerAttempts`، وتكون `null` عند عدم وجود محاولات.
- `escalatedCount`: عدد تقييمات الفترة التي لها `review_item_id`، سواء أنشأ التقييم المراجعة أو ارتبط بمراجعة موجودة.
- `escalationRate = escalatedCount / feedbackCount`، وتكون `null` عند عدم وجود تقييمات.
- `openReviewCount`: عدد `review_items` ذات الحالة `pending` أو الحالة المخزنة `in_review`، وهي حالة
  المراجعة المستلمة/claimed، وقت القراءة. هذا snapshot حالي لا يتأثر بـ`from` أو`to`.
- `medianReviewClosureMs`: وسيط `decided_at - created_at` للمراجعات التي يقع `decided_at` لها ضمن الفترة؛
  القيمة الوسطى للفردي ومتوسط القيمتين الوسطيتين للزوجي، و`null` عند غياب البيانات.
- `approvedAnswerUsageCount`: عدد `question_logs` التي `provider = 'approved-answer'` ويقع `started_at` لها ضمن الفترة.
- `breakdowns.byLanguage` حسب `answer_language` و`breakdowns.byChannel` حسب `channel`، وبالتعريفات نفسها.

## الفلاتر والعقد

المعاملات الأربعة اختيارية: `from` و`to` و`language` و`channel`. تقبل التواريخ ISO 8601 UTC ذات
لاحقة `Z` فقط. الحد `from` شامل والحد `to` غير شامل، ويجب أن يكون `from < to` عند وجودهما معًا.
تُرفض المعاملات المجهولة والمكررة والقيم الفارغة أو غير الصالحة بـ`400 INVALID_REQUEST`.

تطبّق الفترة على ساعة كل حقيقة: `question_logs.started_at` للمحاولات واستخدام الإجابة المعتمدة،
و`feedback_entries.created_at` للتقييمات والتصعيد، و`review_items.decided_at` لإغلاق المراجعات.
تطبق اللغة والقناة على snapshot المخزن في سجل الحقيقة أو على سجل السؤال المرتبط بالمراجعة.

لا يوجد مرشح كتاب أو طبعة: لا تحمل الجداول المستخدمة ارتباطًا منظمًا موثوقًا يسمح بذلك، ولا يجوز
استنتاجه من نص السؤال أو الإجابة أو `evidence_references`.

```json
{
  "metrics": {
    "totals": {},
    "breakdowns": { "byLanguage": [], "byChannel": [] }
  },
  "appliedFilters": { "from": null, "to": null, "language": null, "channel": null },
  "generatedAt": "2026-08-09T12:00:00.000Z",
  "requestId": "uuid"
}
```

## التنفيذ والتشغيل

يفصل الخادم العقد والمجال وقراءة SQLite والخدمة وتحليل query والـhandler. كل SQL parameterized،
وتجمع طبقة المجال النسب والوسيط مع حماية القسمة على صفر. لا توجد migration جديدة؛ الفهارس الحالية
على أوقات سجلات الأسئلة والتقييمات وطابور المراجعات كافية للنطاق المحلي الحالي، ويجري مسح الإغلاقات
المغلقة لحساب الوسيط الدقيق.

تفصل الواجهة العميل ذي parser صارم والحالة/hook والمنسقات والمكونات. تدعم العربية والإنجليزية
والسواحيلية وRTL/LTR، وتعرض المقامات بجوار النسب، وحالات loading/error/empty، وتخطيطًا متجاوبًا.
