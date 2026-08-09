import type { AppLanguage } from '../../i18n/language';

export interface PasswordAccessCopy {
  back: string;
  changeLanguage: string;
  confirm: string;
  error: string;
  introInvitation: string;
  introRecovery: string;
  mismatch: string;
  password: string;
  policy: string;
  submit: string;
  submitting: string;
  success: string;
  titleInvitation: string;
  titleRecovery: string;
}

export const passwordAccessCopies: Record<AppLanguage, PasswordAccessCopy> = {
  ar: {
    back: 'الانتقال إلى تسجيل دخول الفريق', changeLanguage: 'تغيير اللغة', confirm: 'تأكيد كلمة المرور',
    error: 'تعذّر إكمال الطلب. تحقق من الرابط والبيانات أو اطلب رابطًا جديدًا، ثم حاول مرة أخرى.',
    introInvitation: 'أنشئ كلمة مرور لحساب الفريق المدعو.', introRecovery: 'عيّن كلمة مرور جديدة لحساب الفريق.',
    mismatch: 'كلمتا المرور غير متطابقتين.', password: 'كلمة المرور الجديدة',
    policy: 'استخدم 12 بايتًا على الأقل. تجنب كلمة مرور مستخدمة في خدمة أخرى.', submit: 'حفظ كلمة المرور', submitting: 'جارٍ الحفظ…',
    success: 'تم حفظ كلمة المرور. سننقلك إلى تسجيل الدخول.', titleInvitation: 'إعداد حساب الفريق', titleRecovery: 'استعادة الوصول',
  },
  en: {
    back: 'Go to team sign in', changeLanguage: 'Change language', confirm: 'Confirm password',
    error: 'The request could not be completed. Check the link and details or request a new link, then try again.',
    introInvitation: 'Create a password for the invited team account.', introRecovery: 'Set a new password for the team account.',
    mismatch: 'The passwords do not match.', password: 'New password',
    policy: 'Use at least 12 bytes. Avoid a password used for another service.', submit: 'Save password', submitting: 'Saving…',
    success: 'Password saved. Taking you to sign in.', titleInvitation: 'Set up team account', titleRecovery: 'Recover access',
  },
  sw: {
    back: 'Nenda kwenye kuingia kwa timu', changeLanguage: 'Badilisha lugha', confirm: 'Thibitisha nenosiri',
    error: 'Ombi halikukamilika. Kagua kiungo na maelezo au omba kiungo kipya, kisha ujaribu tena.',
    introInvitation: 'Unda nenosiri la akaunti ya timu iliyoalikwa.', introRecovery: 'Weka nenosiri jipya la akaunti ya timu.',
    mismatch: 'Manenosiri hayalingani.', password: 'Nenosiri jipya',
    policy: 'Tumia angalau baiti 12. Epuka nenosiri linalotumiwa kwenye huduma nyingine.', submit: 'Hifadhi nenosiri', submitting: 'Inahifadhi…',
    success: 'Nenosiri limehifadhiwa. Tunakupeleka kwenye kuingia.', titleInvitation: 'Sanidi akaunti ya timu', titleRecovery: 'Rejesha ufikiaji',
  },
};
