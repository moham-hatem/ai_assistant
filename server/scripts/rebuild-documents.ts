import { loadEnv } from 'vite';
import { createLocalConfig } from '../config.ts';
import { DocumentStore } from '../documents/document-store.ts';

const cwd = process.cwd();
const config = createLocalConfig(loadEnv('development', cwd, ''), cwd);
const store = new DocumentStore(config.documentDirectory, config.knowledgeDirectory);
const startedAt = performance.now();
const documents = await store.rebuildAll();
const seconds = ((performance.now() - startedAt) / 1_000).toFixed(1);

console.log(`Rebuilt ${documents.length} local document(s) (${seconds}s).`);
