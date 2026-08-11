import assert from 'node:assert/strict';
import test from 'node:test';
import { botCommands, isSupportedCommand, parseTelegramCommand } from './commands.ts';
import { closedBetaMessage, commandMessage, privateOnlyMessage } from './command-messages.ts';

test('command parser supports bot mentions and a safe start payload', () => {
  assert.deepEqual(parseTelegramCommand('/start opaque_invite-123'), {
    argument: 'opaque_invite-123',
    name: 'start',
  });
  assert.deepEqual(parseTelegramCommand('/HELP@DaleelBot'), { name: 'help' });
  assert.deepEqual(parseTelegramCommand('/unknown value'), { argument: 'value', name: 'unknown' });
  assert.equal(parseTelegramCommand('plain question'), undefined);
  assert.equal(parseTelegramCommand('/start\nsecond-line'), undefined);
  assert.equal(isSupportedCommand('privacy'), true);
  assert.equal(isSupportedCommand('unknown'), false);
});

test('command menus provide native Arabic, English, and Swahili descriptions', () => {
  const ar = botCommands('ar');
  const en = botCommands('en');
  const sw = botCommands('sw');
  assert.deepEqual(ar.map(({ command }) => command), ['start', 'help', 'language', 'privacy', 'reset']);
  assert.match(ar[1]?.description ?? '', /المساعدة/);
  assert.match(en[1]?.description ?? '', /help/);
  assert.match(sw[1]?.description ?? '', /msaada/);
  for (const commands of [ar, en, sw]) {
    assert.ok(commands.every(({ description }) => description.length > 0 && !description.includes('\n')));
  }
});

test('visible UX and privacy disclosures are translated in all supported languages', () => {
  assert.match(commandMessage('ar', 'unknownCommand'), /غير معروف/);
  assert.match(commandMessage('en', 'unknownCommand'), /not recognized/);
  assert.match(commandMessage('sw', 'unknownCommand'), /haitambuliki/);
  assert.match(commandMessage('ar', 'privacy'), /سجل الأسئلة المركزي/);
  assert.match(commandMessage('en', 'privacy'), /central question log/);
  assert.match(commandMessage('sw', 'privacy'), /kumbukumbu kuu ya maswali/);
  assert.match(privateOnlyMessage(), /private chat/);
  assert.match(closedBetaMessage(), /Jaribio limefungwa/);
});
