import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { SafeDiagnosticLocation } from '../../../shared/contracts/system-diagnostics.ts';

export function safeDiagnosticLocation(
  workspaceRoot: string,
  targetPath: string,
): SafeDiagnosticLocation {
  if (targetPath === ':memory:') return { scope: 'memory' };
  const root = resolve(workspaceRoot);
  const target = resolve(targetPath);
  const relativePath = relative(root, target);
  if (relativePath === '' || (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))) {
    const normalized = relativePath.replaceAll(sep, '/');
    return normalized === 'data' || normalized.startsWith('data/')
      ? { relativePath: normalized, scope: 'workspace' }
      : { scope: 'workspace' };
  }
  return { scope: 'external' };
}
