import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTelegramBotIdentity } from './identity.ts';
import { prepareTelegramBot } from './startup.ts';

test('startup verifies identity and registers localized command menus', async () => {
  const calls: Array<string | undefined> = [];
  const identity = parseTelegramBotIdentity({
    first_name: 'Daleel',
    id: 42,
    is_bot: true,
    username: 'DaleelBot',
  });
  const client = {
    async getMe() { return identity; },
    async setMyCommands(commands: ReadonlyArray<{ command: string; description: string }>, language?: string) {
      assert.equal(commands.length, 5);
      calls.push(language);
    },
  };

  assert.equal(await prepareTelegramBot(client), identity);
  assert.deepEqual(calls, [undefined, 'ar', 'sw']);
  assert.equal(identity.link, 'https://t.me/DaleelBot');
});

test('identity parser rejects users and unsafe or incomplete bot identities', () => {
  assert.throws(() => parseTelegramBotIdentity({
    first_name: 'Person', id: 1, is_bot: false, username: 'PersonBot',
  }), /invalid bot identity/);
  assert.throws(() => parseTelegramBotIdentity({
    first_name: 'Bot', id: 1, is_bot: true, username: '../BadBot',
  }), /invalid bot identity/);
  assert.throws(() => parseTelegramBotIdentity({
    first_name: 'Bot', id: 1, is_bot: true, username: 'Assistant',
  }), /invalid bot identity/);
  assert.throws(() => parseTelegramBotIdentity({
    first_name: '   ', id: 1, is_bot: true, username: 'AssistantBot',
  }), /invalid bot identity/);
});
