import type { SecurityAuditIntegritySummary } from '../../../shared/contracts/security-audit.ts';
import type {
  SystemDiagnosticCheck,
  SystemDiagnosticCheckId,
  SystemDiagnosticStatus,
  SystemDiagnosticsReport,
} from '../../../shared/contracts/system-diagnostics.ts';
import { API_VERSION } from '../../../shared/contracts/api-version.ts';
import {
  localDiagnosticProbePorts,
  type LocalDiagnosticProbePorts,
} from './local-probes.ts';
import {
  aggregateStatus,
  databaseResult,
  failedPath,
  pathResult,
  safeVersion,
} from './check-results.ts';
import { ProbeTimeoutError, withProbeTimeout } from './probe-timeout.ts';

export interface SystemDiagnosticsOptions {
  appVersion: string;
  audit: {
    configured: boolean;
    verifyIntegrity?: () => Promise<SecurityAuditIntegritySummary>;
  };
  databases: ReadonlyArray<{
    id: Extract<SystemDiagnosticCheckId, `database.${string}`>;
    path: string;
  }>;
  model: {
    localConfigured: boolean;
    remoteConfigured: boolean;
  };
  ocr: {
    pdftoppmPath: string;
    tesseractPath: string;
  };
  paths: {
    data: string;
    documents: string;
    knowledge: string;
  };
  probeTimeoutMs?: number;
  workspaceRoot: string;
}

export class SystemDiagnosticsService {
  constructor(
    private readonly options: SystemDiagnosticsOptions,
    private readonly probes: LocalDiagnosticProbePorts = localDiagnosticProbePorts,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async inspect(): Promise<SystemDiagnosticsReport> {
    const checks = await Promise.all([
      this.pathCheck('storage.data', this.options.paths.data, true),
      this.pathCheck('storage.documents', this.options.paths.documents, true),
      this.pathCheck('storage.knowledge', this.options.paths.knowledge, true),
      ...this.options.databases.map(({ id, path }) => this.databaseCheck(id, path)),
      this.auditCheck(),
      Promise.resolve(this.modelCheck()),
      this.toolCheck('ocr.tesseract', this.options.ocr.tesseractPath, ['--version']),
      this.toolCheck('ocr.pdftoppm', this.options.ocr.pdftoppmPath, ['-v']),
    ]);
    return {
      checkedAt: this.now().toISOString(),
      checks,
      status: aggregateStatus(checks),
      versions: { api: API_VERSION, app: safeVersion(this.options.appVersion) },
    };
  }

  private async pathCheck(
    id: Extract<SystemDiagnosticCheckId, `storage.${string}`>,
    path: string,
    required: boolean,
  ): Promise<SystemDiagnosticCheck> {
    try {
      const result = await withProbeTimeout(this.probes.inspectPath(path, 'directory'), this.timeoutMs());
      return pathResult(id, path, required, result, this.options.workspaceRoot);
    } catch (error) {
      return failedPath(id, path, required, this.options.workspaceRoot, error);
    }
  }

  private async databaseCheck(
    id: Extract<SystemDiagnosticCheckId, `database.${string}`>,
    path: string,
  ): Promise<SystemDiagnosticCheck> {
    try {
      const result = await withProbeTimeout(this.probes.inspectPath(path, 'database'), this.timeoutMs());
      return databaseResult(id, path, result, this.options.workspaceRoot);
    } catch (error) {
      return failedPath(id, path, true, this.options.workspaceRoot, error);
    }
  }

  private async auditCheck(): Promise<SystemDiagnosticCheck> {
    if (!this.options.audit.configured) {
      return { code: 'audit_configuration_invalid', id: 'audit.integrity', required: true, status: 'unavailable' };
    }
    if (!this.options.audit.verifyIntegrity) {
      return { code: 'integrity_probe_not_connected', id: 'audit.integrity', required: true, status: 'degraded' };
    }
    try {
      const integrity = await withProbeTimeout(
        this.options.audit.verifyIntegrity(),
        this.timeoutMs(),
      );
      if (integrity.status === 'valid') {
        return { code: 'integrity_valid', details: { integrity: 'valid' }, id: 'audit.integrity', required: true, status: 'healthy' };
      }
      if (integrity.status === 'invalid') {
        return { code: 'integrity_invalid', details: { integrity: 'invalid' }, id: 'audit.integrity', required: true, status: 'unavailable' };
      }
      return { code: 'integrity_unverifiable', details: { integrity: 'unverifiable' }, id: 'audit.integrity', required: true, status: 'degraded' };
    } catch (error) {
      return {
        code: error instanceof ProbeTimeoutError ? 'integrity_probe_timeout' : 'integrity_unavailable',
        id: 'audit.integrity',
        required: true,
        status: 'unavailable',
      };
    }
  }

  private modelCheck(): SystemDiagnosticCheck {
    const { localConfigured, remoteConfigured } = this.options.model;
    if (remoteConfigured && localConfigured) {
      return { code: 'configured', details: { configured: true, mode: 'remote_with_local_fallback' }, id: 'model.configuration', required: true, status: 'healthy' };
    }
    if (localConfigured) {
      return { code: 'local_only', details: { configured: true, mode: 'local_only' }, id: 'model.configuration', required: true, status: 'healthy' };
    }
    return { code: 'path_unavailable', details: { configured: false, mode: 'unconfigured' }, id: 'model.configuration', required: true, status: 'unavailable' };
  }

  private async toolCheck(
    id: Extract<SystemDiagnosticCheckId, `ocr.${string}`>,
    executable: string,
    args: readonly string[],
  ): Promise<SystemDiagnosticCheck> {
    try {
      const result = await withProbeTimeout(
        this.probes.inspectTool(executable, args, this.timeoutMs()),
        this.timeoutMs(),
      );
      if (result === 'available') return { code: 'tool_available', id, required: false, status: 'healthy' };
      return {
        code: result === 'timeout' ? 'tool_timeout' : 'tool_unavailable',
        id,
        required: false,
        status: 'unavailable',
      };
    } catch (error) {
      return {
        code: error instanceof ProbeTimeoutError ? 'tool_timeout' : 'tool_unavailable',
        id,
        required: false,
        status: 'unavailable',
      };
    }
  }

  private timeoutMs(): number {
    return Math.min(Math.max(this.options.probeTimeoutMs ?? 2_000, 100), 5_000);
  }
}
