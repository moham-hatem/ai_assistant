import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import type { AuthPrincipal } from '../../../shared/contracts/auth.ts';
import { LOCAL_BACKUP_CONTENT_TYPE } from '../../../shared/contracts/backups.ts';
import { AppError } from '../../errors.ts';
import { sendError, type ErrorLogger } from '../../http/error-response.ts';
import { discardRequestBody, sendJson } from '../../http/json.ts';
import type { LocalBackupService } from './service.ts';

export function createBackupsHandler(service: LocalBackupService, logError: ErrorLogger) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    principal: AuthPrincipal | null,
    boundaryRequestId: string = crypto.randomUUID(),
  ): Promise<void> => {
    const requestId = boundaryRequestId;
    try {
      requireAdmin(principal);
      if (url.search) invalid('Backup endpoints do not accept query parameters.');

      if (url.pathname === '/api/internal/backups') {
        if (request.method === 'GET') {
          sendJson(response, 200, { backups: await service.list(), requestId });
          return;
        }
        if (request.method === 'POST') {
          await discardRequestBody(request);
          sendJson(response, 201, { backup: await service.create(), requestId });
          return;
        }
        return methodNotAllowed(response, requestId, 'GET, POST');
      }

      const match = url.pathname.match(/^\/api\/internal\/backups\/([^/]+)\/(download|validate)$/u);
      if (!match) throw new AppError('ROUTE_NOT_FOUND', 'Backup route not found.', 404);
      const [, id, action] = match;
      if (action === 'download') {
        if (request.method !== 'GET') return methodNotAllowed(response, requestId, 'GET');
        const download = await service.download(decode(id));
        await sendDownload(response, download.path, download.fileName);
        return;
      }
      if (request.method !== 'POST') return methodNotAllowed(response, requestId, 'POST');
      await discardRequestBody(request);
      sendJson(response, 200, { validation: await service.validate(decode(id)), requestId });
    } catch (error) {
      sendError(response, requestId, error, logError);
    }
  };
}

function requireAdmin(principal: AuthPrincipal | null): void {
  if (!principal) throw new AppError('UNAUTHENTICATED', 'Authentication is required.', 401);
  if (!principal.roles.includes('admin')) {
    throw new AppError('FORBIDDEN', 'Only administrators can manage backups.', 403);
  }
}

async function sendDownload(response: ServerResponse, path: string, fileName: string): Promise<void> {
  const size = (await lstat(path)).size;
  response.statusCode = 200;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  response.setHeader('Content-Length', size);
  response.setHeader('Content-Type', LOCAL_BACKUP_CONTENT_TYPE);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  await pipeline(createReadStream(path), response);
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return invalid('Backup id is invalid.');
  }
}

function methodNotAllowed(response: ServerResponse, requestId: string, allow: string): void {
  response.setHeader('Allow', allow);
  sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId });
}

function invalid(message: string): never {
  throw new AppError('INVALID_REQUEST', message, 400);
}
