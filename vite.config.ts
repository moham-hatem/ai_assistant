import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readAuthConfig } from './server/auth/config.ts';
import { createLocalConfig } from './server/config.ts';
import { createLocalApiPlugin } from './server/vite/local-api.ts';
import { readSecurityAuditConfig } from './server/modules/security-audit/config.ts';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const config = createLocalConfig(env, process.cwd());
  const localApi = command === 'serve'
    ? createLocalApiPlugin(
      config,
      readAuthConfig({
        ...env,
        NODE_ENV: mode === 'production' ? 'production' : 'development',
      }, process.cwd()),
      readSecurityAuditConfig(env, process.cwd()),
    )
    : undefined;

  return {
    plugins: [react(), ...(localApi ? [localApi] : [])],
  };
});
