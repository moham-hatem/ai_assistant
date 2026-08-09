import type { AuthRole } from '../../../shared/contracts/auth';
import type { AppLanguage } from '../../i18n/language';

export interface AccessCopy {
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
  invitation: { body: string; conflict: string; open: string; title: string };
  listError: string;
  loading: string;
  next: string;
  noSelection: string;
  previous: string;
  recovery: { create: string; title: string };
  roles: Record<AuthRole, { description: string; label: string }>;
  rolesHeading: string;
  rolesRequired: string;
  secret: { copyFailed: string; invitationTitle: string; recoveryTitle: string; warning: string };
  sessions: string;
  status: string;
  title: string;
  updated: string;
  userError: string;
}

export const accessCopies: Record<AppLanguage, AccessCopy> = {
  ar: {
    actions: { cancel: 'إلغاء', close: 'إغلاق', copy: 'نسخ الرابط', copied: 'تم النسخ', create: 'إنشاء', retry: 'إعادة المحاولة', save: 'حفظ التغييرات' },
    actionError: 'تعذّر تنفيذ الإجراء. لم نعرض تفاصيل قد تكشف معلومات عن الحساب.',
    actionSuccess: { save: 'حُفظت بيانات المستخدم.', enable: 'أُعيد تفعيل الحساب.', disable: 'عُطّل الحساب.', sessions: 'أُبطلت جميع جلسات الحساب.' },
    confirm: { disable: 'سيُمنع هذا الحساب من تسجيل الدخول وتُبطل جلساته. هل تريد المتابعة؟', enable: 'سيتمكن هذا الحساب من تسجيل الدخول مجددًا. هل تريد المتابعة؟', sessions: 'سيُطلب من المستخدم تسجيل الدخول مجددًا على جميع الأجهزة. هل تريد المتابعة؟' },
    created: 'أُنشئ', details: 'تفاصيل المستخدم', disabled: 'معطّل', displayName: 'الاسم الظاهر', email: 'البريد الإلكتروني',
    empty: 'لا توجد حسابات فريق في هذه الصفحة.', enabled: 'مفعّل', expires: 'ينتهي',
    intro: 'أنشئ دعوات وأدِر حسابات الفريق وجلساته. يظل الخادم صاحب القرار النهائي لكل صلاحية وإجراء.',
    invitation: { body: 'أدخل بيانات عضو الفريق وحدد دورًا واحدًا على الأقل. يمكن جمع الأدوار الصحيحة معًا.', conflict: 'تعذّر إنشاء الدعوة. قد يكون الحساب أو الدعوة موجودًا بالفعل.', open: 'دعوة عضو', title: 'إنشاء دعوة فريق' },
    listError: 'تعذّر تحميل قائمة الفريق.', loading: 'جارٍ التحميل…', next: 'التالي', noSelection: 'اختر مستخدمًا لعرض التفاصيل.', previous: 'السابق',
    recovery: { create: 'إنشاء رابط استعادة', title: 'استعادة كلمة المرور' },
    roles: {
      reviewer: { label: 'مراجع', description: 'يراجع الإجابات ويعتمد المحتوى.' },
      content_manager: { label: 'مدير محتوى', description: 'يدير الكتب ويعتمد المحتوى ويتابع السجلات والمقاييس.' },
      operator: { label: 'مشغّل', description: 'يقرأ الكتب والسجلات والمقاييس، ولا يعتمد المحتوى.' },
      admin: { label: 'مسؤول إعدادات', description: 'يدير الإعدادات ووصول الفريق فقط؛ لا يمنح اعتماد المحتوى.' },
    },
    rolesHeading: 'الأدوار', rolesRequired: 'اختر دورًا واحدًا على الأقل.',
    secret: { copyFailed: 'تعذّر النسخ التلقائي؛ حدّد الرابط وانسخه يدويًا.', invitationTitle: 'رابط الدعوة السري', recoveryTitle: 'رابط الاستعادة السري', warning: 'سيظهر هذا الرابط مرة واحدة فقط. انسخه الآن وأرسله عبر قناة آمنة. من يملكه يستطيع استخدامه حتى انتهاء صلاحيته.' },
    sessions: 'إبطال جميع الجلسات', status: 'الحالة', title: 'وصول الفريق', updated: 'آخر تحديث', userError: 'تعذّر تحميل تفاصيل المستخدم.',
  },
  en: {
    actions: { cancel: 'Cancel', close: 'Close', copy: 'Copy link', copied: 'Copied', create: 'Create', retry: 'Try again', save: 'Save changes' },
    actionError: 'The action could not be completed. No account-revealing details are shown.',
    actionSuccess: { save: 'User details saved.', enable: 'Account enabled.', disable: 'Account disabled.', sessions: 'All account sessions revoked.' },
    confirm: { disable: 'This account will be unable to sign in and its sessions will be revoked. Continue?', enable: 'This account will be able to sign in again. Continue?', sessions: 'The user will need to sign in again on every device. Continue?' },
    created: 'Created', details: 'User details', disabled: 'Disabled', displayName: 'Display name', email: 'Email address',
    empty: 'There are no team accounts on this page.', enabled: 'Enabled', expires: 'Expires',
    intro: 'Invite team members and manage their accounts and sessions. The server remains the final authority for every permission and action.',
    invitation: { body: 'Enter the team member’s details and select at least one role. Valid roles may be combined.', conflict: 'The invitation could not be created. The account or an invitation may already exist.', open: 'Invite member', title: 'Create team invitation' },
    listError: 'The team list could not be loaded.', loading: 'Loading…', next: 'Next', noSelection: 'Select a user to see details.', previous: 'Previous',
    recovery: { create: 'Create recovery link', title: 'Password recovery' },
    roles: {
      reviewer: { label: 'Reviewer', description: 'Reviews answers and approves content.' },
      content_manager: { label: 'Content manager', description: 'Manages books, approves content, and reads logs and metrics.' },
      operator: { label: 'Operator', description: 'Reads books, logs, and metrics; does not approve content.' },
      admin: { label: 'Settings admin', description: 'Manages settings and team access only; it does not grant content approval.' },
    },
    rolesHeading: 'Roles', rolesRequired: 'Select at least one role.',
    secret: { copyFailed: 'Automatic copy failed. Select the link and copy it manually.', invitationTitle: 'Secret invitation link', recoveryTitle: 'Secret recovery link', warning: 'This link is shown once. Copy it now and send it through a secure channel. Anyone who has it can use it until it expires.' },
    sessions: 'Revoke all sessions', status: 'Status', title: 'Team access', updated: 'Last updated', userError: 'User details could not be loaded.',
  },
  sw: {
    actions: { cancel: 'Ghairi', close: 'Funga', copy: 'Nakili kiungo', copied: 'Kimenakiliwa', create: 'Unda', retry: 'Jaribu tena', save: 'Hifadhi mabadiliko' },
    actionError: 'Kitendo hakikukamilika. Maelezo yanayoweza kufichua akaunti hayaonyeshwi.',
    actionSuccess: { save: 'Maelezo ya mtumiaji yamehifadhiwa.', enable: 'Akaunti imewezeshwa.', disable: 'Akaunti imezimwa.', sessions: 'Vikao vyote vya akaunti vimebatilishwa.' },
    confirm: { disable: 'Akaunti hii haitaweza kuingia na vikao vyake vitabatilishwa. Uendelee?', enable: 'Akaunti hii itaweza kuingia tena. Uendelee?', sessions: 'Mtumiaji atalazimika kuingia tena kwenye vifaa vyote. Uendelee?' },
    created: 'Iliundwa', details: 'Maelezo ya mtumiaji', disabled: 'Imezimwa', displayName: 'Jina la kuonekana', email: 'Barua pepe',
    empty: 'Hakuna akaunti za timu kwenye ukurasa huu.', enabled: 'Imewezeshwa', expires: 'Inaisha',
    intro: 'Alika wanatimu na usimamie akaunti na vikao vyao. Seva ndiyo yenye uamuzi wa mwisho kwa kila ruhusa na kitendo.',
    invitation: { body: 'Weka maelezo ya mwanatimu na uchague angalau jukumu moja. Majukumu halali yanaweza kuunganishwa.', conflict: 'Mwaliko haukuweza kuundwa. Huenda akaunti au mwaliko tayari upo.', open: 'Alika mwanatimu', title: 'Unda mwaliko wa timu' },
    listError: 'Orodha ya timu haikuweza kupakiwa.', loading: 'Inapakia…', next: 'Inayofuata', noSelection: 'Chagua mtumiaji kuona maelezo.', previous: 'Iliyotangulia',
    recovery: { create: 'Unda kiungo cha urejeshaji', title: 'Urejeshaji wa nenosiri' },
    roles: {
      reviewer: { label: 'Mkaguzi', description: 'Hukagua majibu na kuidhinisha maudhui.' },
      content_manager: { label: 'Msimamizi wa maudhui', description: 'Husimamia vitabu, huidhinisha maudhui, na husoma kumbukumbu na vipimo.' },
      operator: { label: 'Mwendeshaji', description: 'Husoma vitabu, kumbukumbu na vipimo; haidhinishi maudhui.' },
      admin: { label: 'Msimamizi wa mipangilio', description: 'Husimamia mipangilio na ufikiaji wa timu pekee; hairuhusu kuidhinisha maudhui.' },
    },
    rolesHeading: 'Majukumu', rolesRequired: 'Chagua angalau jukumu moja.',
    secret: { copyFailed: 'Kunakili kiotomatiki kumeshindikana. Chagua kiungo na ukinakili mwenyewe.', invitationTitle: 'Kiungo cha siri cha mwaliko', recoveryTitle: 'Kiungo cha siri cha urejeshaji', warning: 'Kiungo hiki kinaonyeshwa mara moja. Kinakili sasa na ukitumie kwa njia salama. Mtu yeyote aliye nacho anaweza kukitumia hadi muda wake uishe.' },
    sessions: 'Batilisha vikao vyote', status: 'Hali', title: 'Ufikiaji wa timu', updated: 'Ilisasishwa', userError: 'Maelezo ya mtumiaji hayakuweza kupakiwa.',
  },
};
