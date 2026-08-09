import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import test from 'node:test';
import { SameOriginAuthPolicy } from '../auth/origin.ts';
import { SameOriginRequestGuard } from './same-origin-request-guard.ts';

const guard = new SameOriginRequestGuard(new SameOriginAuthPolicy('http://localhost:4000'));

test('same-origin guard accepts the exact request origin', async () => {
  await guard.assertAllowed(request('http://localhost:4000', 'attacker-controlled.example'));
});

test('same-origin guard rejects missing, malformed, cross-site, and scheme-mismatched origins', async () => {
  const rejected = [
    request(undefined, 'localhost:4000'),
    request('not-an-origin', 'localhost:4000'),
    request('http://attacker.example', 'attacker.example'),
    request('https://localhost:4000', 'localhost:4000'),
    request('http://localhost:4000', 'localhost:4000', 'cross-site'),
  ];

  for (const candidate of rejected) {
    await assert.rejects(guard.assertAllowed(candidate), {
      code: 'FORBIDDEN',
      status: 403,
    });
  }
});

function request(
  origin: string | undefined,
  host: string | undefined,
  fetchSite?: string,
): IncomingMessage {
  return {
    headers: { host, origin, 'sec-fetch-site': fetchSite },
    socket: { encrypted: false },
  } as unknown as IncomingMessage;
}
