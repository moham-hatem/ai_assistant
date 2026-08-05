import { loadEnv } from 'vite';
import { createLocalConfig } from '../config.ts';
import { createRuntime } from '../create-runtime.ts';

const cwd = process.cwd();
const config = createLocalConfig(loadEnv('development', cwd, ''), cwd);
const { knowledge } = createRuntime(config);

const startedAt = performance.now();
const result = await knowledge.prepare();
const seconds = ((performance.now() - startedAt) / 1_000).toFixed(1);

console.log(`Semantic index ready: ${result.fileCount} files, ${result.chunkCount} chunks (${seconds}s).`);
