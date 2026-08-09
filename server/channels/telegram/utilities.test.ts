import assert from 'node:assert/strict';
import test from 'node:test';
import { TelegramHistory } from './history.ts';
import { message } from './messages.ts';
import { TelegramRateLimiter } from './rate-limit.ts';
import { splitTelegramMessage } from './split-message.ts';

test('history is memory-only, expires by TTL, and retains at most eight turns', () => {
  let now = 100;
  const history = new TelegramHistory(50, 8, () => now);
  for (let index = 0; index < 10; index += 1) {
    history.append('session', [{ content: String(index), role: index % 2 ? 'assistant' : 'user' }]);
  }
  assert.deepEqual(history.get('session').map((turn) => turn.content), ['2', '3', '4', '5', '6', '7', '8', '9']);
  now = 151;
  assert.deepEqual(history.get('session'), []);
});

test('rate limiter applies an isolated fixed window per session', () => {
  let now = 1_000;
  const limiter = new TelegramRateLimiter(2, 60_000, () => now);
  assert.equal(limiter.allow('a'), true);
  assert.equal(limiter.allow('a'), true);
  assert.equal(limiter.allow('a'), false);
  assert.equal(limiter.allow('b'), true);
  now += 60_000;
  assert.equal(limiter.allow('a'), true);
});

test('message splitting is Unicode-safe, exact, bounded, and prefers paragraph breaks', () => {
  const text = `${'فقرة أولى 😀 '.repeat(50)}\n\n${'second paragraph 👨‍👩‍👧‍👦 '.repeat(50)}`;
  const chunks = splitTelegramMessage(text, 120);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every((chunk) => chunk.length <= 120));
  assert.ok(chunks.some((chunk) => chunk.endsWith('\n\n')));
  for (const chunk of chunks) {
    assert.equal(/^[\uDC00-\uDFFF]/.test(chunk), false);
    assert.equal(/[\uD800-\uDBFF]$/.test(chunk), false);
  }
});

test('Arabic copy is loaded as genuine UTF-8 text', () => {
  assert.equal(message('ar', 'chooseLanguage'), 'اختر لغة الإجابة:');
  assert.match(message('ar', 'error'), /تعذر إكمال الطلب/);
});
