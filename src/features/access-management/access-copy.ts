import type { AuthRole } from '../../../shared/contracts/auth';
import type { AppLanguage } from '../../i18n/language';

export interface AccessCopy {
  activeInvitations: { active: string; body: string; cancel: string; cancelBody: string; cancelError: string; cancelTitle: string; empty: string; error: string; recoveryHelp: string; review: string; title: string };
  actions: { cancel: string; close: string; copy: string; copied: string; create: string; retry: string; save: string };
  actionError: string;
  actionSuccess: Record<'save' | 'enable' | 'disable' | 'sessions', string>;
  confirm: { disable: string; enable: string; sessions: string };
  created: string;
  details: string;
  disabled: string;
  displayName: string;
  email: string;
  empty: string;
  enabled: string;
  expires: string;
  intro: string;
  invitation: { ambiguous: string; body: string; conflict: string; open: string; title: string };
  listError: string;
  loading: string;
  next: string;
  noSelection: string;
  previous: string;
  recovery: { create: string; invalidatesPrevious: string; title: string };
  roles: Record<AuthRole, { description: string; label: string }>;
  rolesHeading: string;
  rolesRequired: string;
  secret: { copyFailed: string; invitationTitle: string; recoveryInvalidation: string; recoveryTitle: string; warning: string };
  sessions: string;
  status: string;
  title: string;
  updated: string;
  userError: string;
}

export const accessCopies: Record<AppLanguage, AccessCopy> = {
  ar: {
    activeInvitations: { active: 'نشطة', body: 'تعرض هذه القائمة بيانات الدعوات النشطة فقط، ولا تعرض أي رابط أو رمز سري.', cancel: 'إلغاء الدعوة', cancelBody: 'سيبطل هذا الدعوة فورًا، وبعدها يمكنك إنشاء دعوة جديدة وإرسال رابطها الجديد.', cancelError: 'تعذّر إلغاء الدعوة. أعد تحميل القائمة وحاول مجددًا.', cancelTitle: 'إلغاء الدعوة النشطة', empty: 'لا توجد دعوات نشطة.', error: 'تعذّر تحميل الدعوات النشطة.', recoveryHelp: 'إذا فُقد رابط الدعوة بعد إعادة تحميل الصفحة أو انقطاع الشبكة، ابحث عن الدعوة هنا، ألغها، ثم أنشئ دعوة جديدة. لا يمكن استعادة الرابط السري القديم.', review: 'مراجعة الدعوات النشطة', title: 'الدعوات النشطة' },
    actions: { cancel: 'إلغاء', close: 'إغلاق', copy: 'نسخ الرابط', copied: 'تم النسخ', create: 'إنشاء', retry: 'إعادة المحاولة', save: 'حفظ التغييرات' },
    actionError: 'تعذّر تنفيذ الإجراء. لم نعرض تفاصيل قد تكشف معلومات عن الحساب.',
    actionSuccess: { save: 'حُفظت بيانات المستخدم.', enable: 'أُعيد تفعيل الحساب.', disable: 'عُطّل الحساب.', sessions: 'أُبطلت جميع جلسات الحساب.' },
    confirm: { disable: 'سيُمنع هذا الحساب من تسجيل الدخول وتُبطل جلساته. هل تريد المتابعة؟', enable: 'سيتمكن هذا الحساب من تسجيل الدخول مجددًا. هل تريد المتابعة؟', sessions: 'سيُطلب من المستخدم تسجيل الدخول مجددًا على جميع الأجهزة. هل تريد المتابعة؟' },
    created: 'أُنشئ', details: 'تفاصيل المستخدم', disabled: 'معطّل', displayName: 'الاسم الظاهر', email: 'البريد الإلكتروني',
    empty: 'لا توجد حسابات فريق في هذه الصفحة.', enabled: 'مفعّل', expires: 'ينتهي',
    intro: 'أنشئ دعوات وأدِر حسابات الفريق وجلساته. يظل الخادم صاحب القرار النهائي لكل صلاحية وإجراء.',
    invitation: { ambiguous: 'تعذّر تأكيد نتيجة الطلب بسبب الاتصال. لا تفترض نجاحه ولا تُعِد المحاولة فورًا؛ تحقّق أولًا من وجود دعوة نشطة. لن يكشف التعارض رابطًا سريًا سابقًا.', body: 'أدخل بيانات عضو الفريق وحدد دورًا واحدًا على الأقل. يمكن جمع الأدوار الصحيحة معًا.', conflict: 'يوجد حساب أو دعوة نشطة بالفعل. لا يمكن عرض رابط دعوة سابق مرة أخرى.', open: 'دعوة عضو', title: 'إنشاء دعوة فريق' },
    listError: 'تعذّر تحميل قائمة الفريق.', loading: 'جارٍ التحميل…', next: 'التالي', noSelection: 'اختر مستخدمًا لعرض التفاصيل.', previous: 'السابق',
    recovery: { create: 'إنشاء رابط استعادة', invalidatesPrevious: 'إصدار رابط استعادة جديد يبطل فورًا كل روابط الاستعادة السابقة لهذا المستخدم.', title: 'استعادة كلمة المرور' },
    roles: {
      reviewer: { label: 'مراجع', description: 'يراجع الإجابات ويعتمد المحتوى.' },
      content_manager: { label: 'مدير محتوى', description: 'يدير الكتب ويعتمد المحتوى ويتابع السجلات والمقاييس.' },
      operator: { label: 'مشغّل', description: 'يقرأ الكتب والسجلات والمقاييس، ولا يعتمد المحتوى.' },
      admin: { label: 'مسؤول إعدادات', description: 'يدير الإعدادات ووصول الفريق فقط؛ لا يمنح اعتماد المحتوى.' },
    },
    rolesHeading: 'الأدوار', rolesRequired: 'اختر دورًا واحدًا على الأقل.',
    secret: { copyFailed: 'تعذّر النسخ التلقائي؛ حدّد الرابط وانسخه يدويًا.', invitationTitle: 'رابط الدعوة السري', recoveryInvalidation: 'أُبطلت جميع روابط الاستعادة السابقة لهذا المستخدم عند إصدار هذا الرابط.', recoveryTitle: 'رابط الاستعادة السري', warning: 'سيظهر هذا الرابط مرة واحدة فقط. انسخه الآن وأرسله عبر قناة آمنة. من يملكه يستطيع استخدامه حتى انتهاء صلاحيته.' },
    sessions: 'إبطال جميع الجلسات', status: 'الحالة', title: 'وصول الفريق', updated: 'آخر تحديث', userError: 'تعذّر تحميل تفاصيل المستخدم.',
  },
  en: {
    activeInvitations: { active: 'Active', body: 'This list contains active invitation metadata only. It never includes a secret link or token.', cancel: 'Cancel invitation', cancelBody: 'This invitation will stop working immediately. You can then create a new invitation and share its new link.', cancelError: 'The invitation could not be canceled. Reload the list and try again.', cancelTitle: 'Cancel active invitation', empty: 'There are no active invitations.', error: 'Active invitations could not be loaded.', recoveryHelp: 'If an invitation link was lost after a reload or an uncertain network response, find the invitation here, cancel it, then create a new one. The old secret link cannot be recovered.', review: 'Review active invitations', title: 'Active invitations' },
    actions: { cancel: 'Cancel', close: 'Close', copy: 'Copy link', copied: 'Copied', create: 'Create', retry: 'Try again', save: 'Save changes' },
    actionError: 'The action could not be completed. No account-revealing details are shown.',
    actionSuccess: { save: 'User details saved.', enable: 'Account enabled.', disable: 'Account disabled.', sessions: 'All account sessions revoked.' },
    confirm: { disable: 'This account will be unable to sign in and its sessions will be revoked. Continue?', enable: 'This account will be able to sign in again. Continue?', sessions: 'The user will need to sign in again on every device. Continue?' },
    created: 'Created', details: 'User details', disabled: 'Disabled', displayName: 'Display name', email: 'Email address',
    empty: 'There are no team accounts on this page.', enabled: 'Enabled', expires: 'Expires',
    intro: 'Invite team members and manage their accounts and sessions. The server remains the final authority for every permission and action.',
    invitation: { ambiguous: 'The result could not be confirmed. Do not assume success or retry immediately; first check for an active invitation. A conflict will not reveal an earlier secret link.', body: 'Enter the team member’s details and select at least one role. Valid roles may be combined.', conflict: 'An account or active invitation already exists. A previous invitation link cannot be shown again.', open: 'Invite member', title: 'Create team invitation' },
    listError: 'The team list could not be loaded.', loading: 'Loading…', next: 'Next', noSelection: 'Select a user to see details.', previous: 'Previous',
    recovery: { create: 'Create recovery link', invalidatesPrevious: 'Issuing a new recovery link immediately invalidates every earlier recovery link for this user.', title: 'Password recovery' },
    roles: {
      reviewer: { label: 'Reviewer', description: 'Reviews answers and approves content.' },
      content_manager: { label: 'Content manager', description: 'Manages books, approves content, and reads logs and metrics.' },
      operator: { label: 'Operator', description: 'Reads books, logs, and metrics; does not approve content.' },
      admin: { label: 'Settings admin', description: 'Manages settings and team access only; it does not grant content approval.' },
    },
    rolesHeading: 'Roles', rolesRequired: 'Select at least one role.',
    secret: { copyFailed: 'Automatic copy failed. Select the link and copy it manually.', invitationTitle: 'Secret invitation link', recoveryInvalidation: 'All earlier recovery links for this user were invalidated when this link was issued.', recoveryTitle: 'Secret recovery link', warning: 'This link is shown once. Copy it now and send it through a secure channel. Anyone who has it can use it until it expires.' },
    sessions: 'Revoke all sessions', status: 'Status', title: 'Team access', updated: 'Last updated', userError: 'User details could not be loaded.',
  },
  sw: {
    activeInvitations: { active: 'Unatumika', body: 'Orodha hii ina maelezo ya mialiko inayotumika pekee. Haina kiungo wala tokeni ya siri.', cancel: 'Batilisha mwaliko', cancelBody: 'Mwaliko huu utaacha kufanya kazi mara moja. Kisha unaweza kuunda mwaliko mpya na kutuma kiungo chake kipya.', cancelError: 'Mwaliko haukuweza kubatilishwa. Pakia orodha upya na ujaribu tena.', cancelTitle: 'Batilisha mwaliko unaotumika', empty: 'Hakuna mialiko inayotumika.', error: 'Mialiko inayotumika haikuweza kupakiwa.', recoveryHelp: 'Ikiwa kiungo cha mwaliko kilipotea baada ya kupakia ukurasa upya au matokeo ya mtandao yasiyo na uhakika, tafuta mwaliko hapa, ubatilishe, kisha uunde mpya. Kiungo cha siri cha zamani hakiwezi kurejeshwa.', review: 'Kagua mialiko inayotumika', title: 'Mialiko inayotumika' },
    actions: { cancel: 'Ghairi', close: 'Funga', copy: 'Nakili kiungo', copied: 'Kimenakiliwa', create: 'Unda', retry: 'Jaribu tena', save: 'Hifadhi mabadiliko' },
    actionError: 'Kitendo hakikukamilika. Maelezo yanayoweza kufichua akaunti hayaonyeshwi.',
    actionSuccess: { save: 'Maelezo ya mtumiaji yamehifadhiwa.', enable: 'Akaunti imewezeshwa.', disable: 'Akaunti imezimwa.', sessions: 'Vikao vyote vya akaunti vimebatilishwa.' },
    confirm: { disable: 'Akaunti hii haitaweza kuingia na vikao vyake vitabatilishwa. Uendelee?', enable: 'Akaunti hii itaweza kuingia tena. Uendelee?', sessions: 'Mtumiaji atalazimika kuingia tena kwenye vifaa vyote. Uendelee?' },
    created: 'Iliundwa', details: 'Maelezo ya mtumiaji', disabled: 'Imezimwa', displayName: 'Jina la kuonekana', email: 'Barua pepe',
    empty: 'Hakuna akaunti za timu kwenye ukurasa huu.', enabled: 'Imewezeshwa', expires: 'Inaisha',
    intro: 'Alika wanatimu na usimamie akaunti na vikao vyao. Seva ndiyo yenye uamuzi wa mwisho kwa kila ruhusa na kitendo.',
    invitation: { ambiguous: 'Matokeo hayakuweza kuthibitishwa. Usidhani ombi lilifanikiwa wala usijaribu tena mara moja; kwanza kagua kama kuna mwaliko unaotumika. Mgongano hautaonyesha kiungo cha siri cha awali.', body: 'Weka maelezo ya mwanatimu na uchague angalau jukumu moja. Majukumu halali yanaweza kuunganishwa.', conflict: 'Akaunti au mwaliko unaotumika tayari upo. Kiungo cha mwaliko wa awali hakiwezi kuonyeshwa tena.', open: 'Alika mwanatimu', title: 'Unda mwaliko wa timu' },
    listError: 'Orodha ya timu haikuweza kupakiwa.', loading: 'Inapakia…', next: 'Inayofuata', noSelection: 'Chagua mtumiaji kuona maelezo.', previous: 'Iliyotangulia',
    recovery: { create: 'Unda kiungo cha urejeshaji', invalidatesPrevious: 'Kutolewa kwa kiungo kipya cha urejeshaji hubatilisha mara moja viungo vyote vya awali vya mtumiaji huyu.', title: 'Urejeshaji wa nenosiri' },
    roles: {
      reviewer: { label: 'Mkaguzi', description: 'Hukagua majibu na kuidhinisha maudhui.' },
      content_manager: { label: 'Msimamizi wa maudhui', description: 'Husimamia vitabu, huidhinisha maudhui, na husoma kumbukumbu na vipimo.' },
      operator: { label: 'Mwendeshaji', description: 'Husoma vitabu, kumbukumbu na vipimo; haidhinishi maudhui.' },
      admin: { label: 'Msimamizi wa mipangilio', description: 'Husimamia mipangilio na ufikiaji wa timu pekee; hairuhusu kuidhinisha maudhui.' },
    },
    rolesHeading: 'Majukumu', rolesRequired: 'Chagua angalau jukumu moja.',
    secret: { copyFailed: 'Kunakili kiotomatiki kumeshindikana. Chagua kiungo na ukinakili mwenyewe.', invitationTitle: 'Kiungo cha siri cha mwaliko', recoveryInvalidation: 'Viungo vyote vya awali vya urejeshaji vya mtumiaji huyu vilibatilishwa wakati kiungo hiki kilipotolewa.', recoveryTitle: 'Kiungo cha siri cha urejeshaji', warning: 'Kiungo hiki kinaonyeshwa mara moja. Kinakili sasa na ukitumie kwa njia salama. Mtu yeyote aliye nacho anaweza kukitumia hadi muda wake uishe.' },
    sessions: 'Batilisha vikao vyote', status: 'Hali', title: 'Ufikiaji wa timu', updated: 'Ilisasishwa', userError: 'Maelezo ya mtumiaji hayakuweza kupakiwa.',
  },
};
