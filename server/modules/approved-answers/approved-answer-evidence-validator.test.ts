import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublishedEvidenceSource } from '../../knowledge/published-evidence-source.ts';
import { PublishedApprovedAnswerEvidenceValidator } from './approved-answer-evidence-validator.ts';

test('evidence validation accepts only a complete set of currently published references', async () => {
  const source: PublishedEvidenceSource = {
    load: async () => ({
      chunks: [
        { content: 'Published evidence.', id: 'books/book-1/editions/published:1' },
      ],
      fileCount: 1,
    }),
  };
  const validator = new PublishedApprovedAnswerEvidenceValidator(source);

  assert.deepEqual(
    await validator.validate(['books/book-1/editions/published:1']),
    {
      evidence: [{ content: 'Published evidence.', id: 'books/book-1/editions/published:1' }],
      valid: true,
    },
  );
  assert.equal((await validator.validate([
    'books/book-1/editions/published:1',
    'books/book-1/editions/archived:1',
  ])).valid, false);
  assert.equal((await validator.validate(['books/book-1/editions/missing:1'])).valid, false);
  assert.equal((await validator.validate([])).valid, false);
});
