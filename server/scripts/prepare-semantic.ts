import { loadEnv } from 'vite';
import { createLocalConfig } from '../config.ts';
import { createRuntime } from '../create-runtime.ts';
import { acquireRuntimeAdmission } from '../modules/backups/runtime-admission.ts';

const cwd = process.cwd();
const config = createLocalConfig(loadEnv('development', cwd, ''), cwd);
const admission = await acquireRuntimeAdmission(config.backupDirectory, { scope: 'prepare-semantic' });
let runtime: ReturnType<typeof createRuntime> | undefined;
try {
  runtime = createRuntime(config);
  const startedAt = performance.now();
  const result = await runtime.knowledge.prepare();
  const seconds = ((performance.now() - startedAt) / 1_000).toFixed(1);

  console.log(`Semantic index ready: ${result.fileCount} files, ${result.chunkCount} chunks (${seconds}s).`);
} finally {
  try { runtime?.close(); }
  finally { await admission.release(); }
}
