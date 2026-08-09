import type { AppLanguage } from '../../i18n/language';

export interface AuthCopy {
  admin: string; checking: string; email: string; password: string; signIn: string; signingIn: string;
  title: string; intro: string; invalidCredentials: string; unavailable: string; invalidResponse: string;
  sessionError: string; retry: string; forbidden: string; forbiddenBody: string; logout: string; loggingOut: string;
  signedInAs: string; back: string;
  close: string;
}

export const authCopies: Record<AppLanguage, AuthCopy> = {
  ar: {
    admin: 'دخول الفريق', checking: 'جارٍ التحقق من الجلسة…', email: 'البريد الإلكتروني', password: 'كلمة المرور',
    signIn: 'تسجيل الدخول', signingIn: 'جارٍ تسجيل الدخول…', title: 'مرحبًا بعودتك',
    intro: 'سجّل الدخول بحساب الفريق للوصول إلى أدوات الإدارة المصرّح بها.',
    invalidCredentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.', unavailable: 'تعذّر الوصول إلى خدمة الدخول. حاول مرة أخرى.',
    invalidResponse: 'وصل رد غير صالح من خدمة الدخول.', sessionError: 'تعذّر التحقق من جلستك بأمان.', retry: 'إعادة المحاولة',
    forbidden: 'صلاحية ناقصة', forbiddenBody: 'حسابك مسجّل، لكنه لا يملك الصلاحية المطلوبة لهذا الإجراء.',
    logout: 'تسجيل الخروج', loggingOut: 'جارٍ الخروج…', signedInAs: 'مسجّل باسم', back: 'العودة إلى المساعد', close: 'إغلاق',
  },
  en: {
    admin: 'Team sign in', checking: 'Checking your session…', email: 'Email address', password: 'Password',
    signIn: 'Sign in', signingIn: 'Signing in…', title: 'Welcome back',
    intro: 'Sign in with your team account to access the administration tools you are allowed to use.',
    invalidCredentials: 'The email address or password is incorrect.', unavailable: 'The sign-in service is unavailable. Try again.',
    invalidResponse: 'The sign-in service returned an invalid response.', sessionError: 'We could not verify your session safely.', retry: 'Try again',
    forbidden: 'Permission required', forbiddenBody: 'You are still signed in, but your account cannot perform this action.',
    logout: 'Sign out', loggingOut: 'Signing out…', signedInAs: 'Signed in as', back: 'Back to assistant', close: 'Close',
  },
  sw: {
    admin: 'Kuingia kwa timu', checking: 'Tunakagua kikao chako…', email: 'Barua pepe', password: 'Nenosiri',
    signIn: 'Ingia', signingIn: 'Inaingia…', title: 'Karibu tena',
    intro: 'Ingia kwa akaunti ya timu ili utumie zana za usimamizi ulizoruhusiwa.',
    invalidCredentials: 'Barua pepe au nenosiri si sahihi.', unavailable: 'Huduma ya kuingia haipatikani. Jaribu tena.',
    invalidResponse: 'Huduma ya kuingia imerudisha jibu lisilofaa.', sessionError: 'Hatukuweza kuthibitisha kikao chako kwa usalama.', retry: 'Jaribu tena',
    forbidden: 'Ruhusa inahitajika', forbiddenBody: 'Bado umeingia, lakini akaunti yako hairuhusiwi kufanya kitendo hiki.',
    logout: 'Toka', loggingOut: 'Inatoka…', signedInAs: 'Umeingia kama', back: 'Rudi kwa msaidizi', close: 'Funga',
  },
};
