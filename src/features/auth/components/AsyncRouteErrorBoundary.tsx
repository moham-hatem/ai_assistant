import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { AppLanguage, LanguageOption } from '../../../i18n/language';

const errorCopy: Record<AppLanguage, { body: string; retry: string; title: string }> = {
  ar: { body: 'تعذّر تحميل ملفات هذه الصفحة. تحقق من الاتصال ثم أعد المحاولة.', retry: 'إعادة تحميل الصفحة', title: 'تعذّر تحميل الصفحة' },
  en: { body: 'The files for this page could not be loaded. Check the connection and try again.', retry: 'Reload page', title: 'Page loading failed' },
  sw: { body: 'Faili za ukurasa huu hazikuweza kupakiwa. Kagua muunganisho kisha ujaribu tena.', retry: 'Pakia ukurasa upya', title: 'Ukurasa haukuweza kupakiwa' },
};

interface AsyncRouteErrorBoundaryProps {
  children?: ReactNode;
  language: LanguageOption;
  onRetry?: () => void;
}

interface AsyncRouteErrorBoundaryState { failed: boolean }

export class AsyncRouteErrorBoundary extends Component<AsyncRouteErrorBoundaryProps, AsyncRouteErrorBoundaryState> {
  state: AsyncRouteErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AsyncRouteErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo): void {}

  render() {
    if (!this.state.failed) return this.props.children;
    const copy = errorCopy[this.props.language.code];
    return <section className="async-route-error" dir={this.props.language.dir} role="alert">
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
      <button type="button" onClick={this.props.onRetry ?? reloadPage}>{copy.retry}</button>
    </section>;
  }
}

function reloadPage(): void {
  window.location.reload();
}
