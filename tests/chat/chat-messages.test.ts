import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerMessage, createWelcomeMessage, getChatHistory } from '../../src/features/chat/chat-messages.ts';
import type { ChatMessage } from '../../src/features/chat/types.ts';

test('only a successful assistant answer keeps the question log requestId', () => {
  const welcome = createWelcomeMessage('Welcome');
  const user: ChatMessage = { content: 'Question', id: 'user-1', role: 'user' };
  const answer = createAnswerMessage({ answer: 'Answer', grounded: true, requestId: 'question-log-1' }, 'answer-ui-1');

  assert.equal('requestId' in welcome, false);
  assert.equal('requestId' in user, false);
  assert.deepEqual(answer, {
    content: 'Answer',
    id: 'answer-ui-1',
    kind: 'answer',
    requestId: 'question-log-1',
    role: 'assistant',
  });
  assert.notEqual(answer.id, answer.requestId);
});

test('answer history contains conversation text only and omits UI and feedback identifiers', () => {
  const messages: ChatMessage[] = [
    createWelcomeMessage('Welcome'),
    { content: 'Question', id: 'user-1', role: 'user' },
    createAnswerMessage({ answer: 'Answer', grounded: false, requestId: 'private-log-id' }, 'answer-ui-1'),
  ];

  assert.deepEqual(getChatHistory(messages), [
    { content: 'Question', role: 'user' },
    { content: 'Answer', role: 'assistant' },
  ]);
  assert.equal(JSON.stringify(getChatHistory(messages)).includes('private-log-id'), false);
});
