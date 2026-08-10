import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { AuthPrincipal } from '../../../shared/contracts/auth.ts';
import { LOCAL_BACKUP_CONTENT_TYPE } from '../../../shared/contracts/backups.ts';
import { createBackupsHandler } from './handler.ts';
import { LocalBackupService } from './service.ts';

const admin: AuthPrincipal = {
  displayName: 'Admin', email: 'admin@example.test', id: crypto.randomUUID(),
  permissions: ['settings:manage'], roles: ['admin'],
};
const reviewer: AuthPrincipal = {
  displayName: 'Reviewer', email: 'reviewer@example.test', id: crypto.randomUUID(),
  permissions: ['content:review'], roles: ['reviewer'],
};

test('backup HTTP API is admin-only and supports create, list, validate, download, and restore', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-backup-http-'));
  const data = join(root, 'data');
  const databasePath = join(data, 'books.sqlite');
  await mkdir(join(data, 'backups'), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec('CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker VALUES (\'http snapshot\');');
  database.close();
  const service = new LocalBackupService({
    appVersion: 'http-test', backupDirectory: join(data, 'backups'), dataDirectory: data,
    directoryScopes: [], sqliteFiles: [databasePath],
  });
  const logged: unknown[] = [];
  const handler = createBackupsHandler(service, (_requestId, error) => logged.push(error));
  const server = createServer((request, response) => {
    const role = request.headers['x-test-role'];
    const principal = role === 'admin' ? admin : role === 'reviewer' ? reviewer : null;
    void handler(request, response, new URL(request.url ?? '/', 'http://localhost'), principal);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server did not bind.');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(`${base}/api/internal/backups`)).status, 401);
    assert.equal((await fetch(`${base}/api/internal/backups`, { headers: { 'x-test-role': 'reviewer' } })).status, 403);

    const create = await fetch(`${base}/api/internal/backups`, {
      headers: { 'x-test-role': 'admin' }, method: 'POST',
    });
    assert.equal(create.status, 201);
    const created = (await create.json()) as { backup: { id: string } };

    const list = await fetch(`${base}/api/internal/backups`, { headers: { 'x-test-role': 'admin' } });
    assert.equal(list.status, 200);
    assert.equal(((await list.json()) as { backups: unknown[] }).backups.length, 1);

    const validation = await fetch(`${base}/api/internal/backups/${created.backup.id}/validate`, {
      headers: { 'x-test-role': 'admin' }, method: 'POST',
    });
    assert.equal(validation.status, 200);
    assert.equal(((await validation.json()) as { validation: { status: string } }).validation.status, 'valid');

    const download = await fetch(`${base}/api/internal/backups/${created.backup.id}/download`, {
      headers: { 'x-test-role': 'admin' },
    });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), LOCAL_BACKUP_CONTENT_TYPE);
    assert.match(download.headers.get('content-disposition') ?? '', /^attachment;/u);
    assert.equal((await download.arrayBuffer()).byteLength > 0, true);

    const restore = await fetch(`${base}/api/internal/backups/${created.backup.id}/restore`, {
      headers: { 'x-test-role': 'admin' }, method: 'POST',
    });
    assert.equal(restore.status, 409);
    assert.match(
      ((await restore.json()) as { message: string }).message,
      /shutdown and restart coordinator/u,
    );

    const wrongMethod = await fetch(`${base}/api/internal/backups/${created.backup.id}/download`, {
      headers: { 'x-test-role': 'admin' }, method: 'POST',
    });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('allow'), 'GET');
    assert.equal((await fetch(`${base}/api/internal/backups?unexpected=true`, {
      headers: { 'x-test-role': 'admin' },
    })).status, 400);
    assert.deepEqual(logged, []);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(root, { force: true, recursive: true });
  }
});
