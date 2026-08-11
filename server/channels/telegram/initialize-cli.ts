import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initializeTelegramSecret } from './initialize.ts';

async function main(): Promise<void> {
  try {
    await initializeTelegramSecret();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'telegram:init failed.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
