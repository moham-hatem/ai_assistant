import type {
  SystemDiagnosticCheck,
  SystemDiagnosticsResponse,
} from '../../shared/contracts/system-diagnostics.ts';

export function systemDiagnosticsPayload(): SystemDiagnosticsResponse {
  return {
    diagnostics: {
      checkedAt: '2026-08-10T12:30:00.000Z',
      checks: healthyChecks(),
      status: 'healthy',
      versions: { api: '1', app: '0.1.0' },
    },
    requestId: '123e4567-e89b-42d3-a456-426614174000',
  };
}

function healthyChecks(): SystemDiagnosticCheck[] {
  const pathDetails = (relativePath: string) => ({
    availableSpaceMiB: 4096,
    location: { relativePath, scope: 'workspace' as const },
    readable: true,
    writable: true,
  });
  return [
    { code: 'ready', details: pathDetails('data'), id: 'storage.data', required: true, status: 'healthy' },
    { code: 'ready', details: pathDetails('data/documents'), id: 'storage.documents', required: true, status: 'healthy' },
    { code: 'ready', details: pathDetails('data/knowledge'), id: 'storage.knowledge', required: true, status: 'healthy' },
    { code: 'ready', details: pathDetails('data/books.sqlite'), id: 'database.books', required: true, status: 'healthy' },
    { code: 'ready', details: pathDetails('data/question-log.sqlite'), id: 'database.questions', required: true, status: 'healthy' },
    { code: 'ready', details: pathDetails('data/auth.sqlite'), id: 'database.auth', required: true, status: 'healthy' },
    { code: 'integrity_valid', details: { integrity: 'valid' }, id: 'audit.integrity', required: true, status: 'healthy' },
    { code: 'configured', details: { configured: true, mode: 'remote_with_local_fallback' }, id: 'model.configuration', required: true, status: 'healthy' },
    {
      code: 'telegram_running',
      details: {
        configured: true,
        lastHandledUpdateAt: '2026-08-10T12:29:58.000Z',
        lastSuccessfulPoll: '2026-08-10T12:29:59.000Z',
        publicLink: 'https://t.me/LearningHelperBot',
        publicUsername: 'LearningHelperBot',
        retryCount: 0,
        running: true,
        runtimeState: 'running',
      },
      id: 'telegram.bot',
      required: false,
      status: 'healthy',
    },
    { code: 'tool_available', id: 'ocr.tesseract', required: false, status: 'healthy' },
    { code: 'tool_available', id: 'ocr.pdftoppm', required: false, status: 'healthy' },
  ];
}
