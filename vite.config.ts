import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createLocalConfig } from './server/config.ts';
import { localAnswerApi } from './server/vite/local-api.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const config = createLocalConfig(env, process.cwd());

  return {
    plugins: [react(), localAnswerApi(config)],
  };
});
