import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { LocalKnowledgeSource, selectDominantSource } from './knowledge/local-knowledge.ts';
import type { EmbeddingKind, TextEmbedder } from './knowledge/embedding.ts';
import { SemanticSearch } from './knowledge/semantic-search.ts';
import { rankSemanticEvidence } from './knowledge/semantic-rank.ts';
import { expandKnowledgeQuery } from './knowledge/query-expansion.ts';
import { expandWithNeighborEvidence } from './knowledge/neighbor-evidence.ts';
import { parseGroundedAnswer } from './model/parse-answer.ts';
import { assertAnswerQuality } from './model/answer-quality.ts';
import { splitQuestionParts } from './question-parts.ts';
import { parseAnswerInput } from './http/parse-input.ts';

test('local knowledge search returns a matching Arabic excerpt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'islamic-assistant-test-'));

  try {
    await writeFile(
      join(directory, 'lesson.txt'),
      'الصدق خلق كريم يحث عليه المحتوى التعليمي.\n\nهذا مقطع آخر عن التعاون.',
      'utf8',
    );

    const result = await new LocalKnowledgeSource(directory).search('ما معنى الصدق؟', 3);
    assert.equal(result.fileCount, 1);
    assert.equal(result.evidence.length, 1);
    assert.match(result.evidence[0].content, /الصدق/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('semantic search can match an Arabic question to foreign-language evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'semantic-search-test-'));
  const embedder: TextEmbedder = {
    modelId: 'test-multilingual-model',
    async embed(texts: string[], kind: EmbeddingKind) {
      return texts.map((text) => kind === 'query' || text.includes('shahada') ? [1, 0] : [0, 1]);
    },
  };

  try {
    await writeFile(
      join(directory, 'swahili.txt'),
      'Maana ya shahada ni kumuabudu Allah peke yake.\n\nHii ni aya nyingine kuhusu tabia.',
      'utf8',
    );
    const semantic = new SemanticSearch(embedder, directory, 0.8);
    const result = await new LocalKnowledgeSource(directory, semantic)
      .search('ما معنى الشهادة؟', 2);

    assert.equal(result.evidence.length, 1);
    assert.match(result.evidence[0].content, /shahada/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('semantic search uses dynamic alternatives for specialized foreign terms', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'semantic-alternatives-test-'));
  const embedder: TextEmbedder = {
    modelId: 'test-alternative-model',
    async embed(texts: string[], kind: EmbeddingKind) {
      return texts.map((text) => {
        if (kind === 'query') return /hadathi kubwa/i.test(text) ? [1, 0] : [0, 1];
        return /Hadathi kubwa/i.test(text) ? [1, 0] : [0, 1];
      });
    },
  };

  try {
    await writeFile(
      join(directory, 'lesson.txt'),
      `${'Maelezo mengine. '.repeat(70)}\n\nHadathi kubwa: kwa kuoga. Hadathi ndogo: kwa kutawadha.`,
      'utf8',
    );
    const semantic = new SemanticSearch(embedder, directory, 0.8);
    const result = await new LocalKnowledgeSource(directory, semantic).search(
      'ما الفرق بين الحدث الأكبر والأصغر؟',
      1,
      ['hadathi kubwa na hadathi ndogo'],
    );

    assert.equal(result.evidence.length, 1);
    assert.match(result.evidence[0].content, /Hadathi kubwa/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('semantic focus finds the relevant local passage without external translation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'semantic-focus-test-'));
  const embedder: TextEmbedder = {
    modelId: 'test-focus-model',
    async embed(texts: string[], kind: EmbeddingKind) {
      return texts.map((text) => kind === 'query' || /kutafuta Elimu|njia nyepesi kwa Pepo/i.test(text)
        ? [1, 0]
        : [0, 1]);
    },
  };
  const semantic = new SemanticSearch(embedder, directory, 0.8);
  const evidence = [{
    id: 'book:42',
    content: [
      'Utangulizi mwingine.',
      'Maelezo yasiyohusiana.',
      'Usisimamishe kujifunza Dini yako.',
      'Atakaye ingia kwenye njia',
      'kwa ajili ya kutafuta Elimu,',
      'Mwenyezi Mungu anamrahisishia',
      'kwa elimu hiyo njia nyepesi kwa Pepo.',
      'Rafiki ndiyo mvutaji wako.',
      'Maelezo mengine ya mwisho.',
    ].join('\n'),
  }];

  const focused = await semantic.focus(
    evidence,
    'لماذا يجب على المسلم الاستمرار في تعلم دينه؟',
    2,
  );

  assert.equal(focused.length, 1);
  assert.match(focused[0].content, /kutafuta Elimu/);
  assert.match(focused[0].content, /njia nyepesi kwa Pepo/);
});

test('why-question source selection prefers a coherent result cluster', () => {
  const ranked = [
    { id: 'unrelated-arabic.txt:2', content: 'تعلم وتذكير في موضوع آخر' },
    { id: 'swahili-book.txt:41', content: 'endelea na Dini yako' },
    { id: 'swahili-book.txt:1', content: 'kitabu cha dini' },
    { id: 'swahili-book.txt:40', content: 'sehemu ya elimu' },
    { id: 'other.txt:3', content: 'weak match' },
  ];

  const selected = selectDominantSource(ranked);

  assert.deepEqual(selected.map((item) => item.id), [
    'swahili-book.txt:41',
    'swahili-book.txt:1',
    'swahili-book.txt:40',
  ]);
});

test('model output is accepted only with a valid evidence number', () => {
  const grounded = parseGroundedAnswer(
    '<answer>إجابة موثقة</answer><evidence>1</evidence>',
    2,
  );
  const rejected = parseGroundedAnswer(
    '<answer>إجابة بلا دليل صالح</answer><evidence>9</evidence>',
    2,
  );
  const spaced = parseGroundedAnswer(
    '<answer>إجابة موثقة بأكثر من دليل</answer><evidence>1 2</evidence>',
    2,
  );
  const arabicDigits = parseGroundedAnswer(
    '<answer>إجابة موثقة بأرقام عربية</answer><evidence>١، ٢</evidence>',
    2,
  );

  assert.equal(grounded.grounded, true);
  assert.equal(grounded.answer, 'إجابة موثقة');
  assert.equal(rejected.grounded, false);
  assert.equal(spaced.grounded, true);
  assert.equal(arabicDigits.grounded, true);
});

test('procedure questions prefer directly numbered evidence with a close semantic match', () => {
  const ranked = rankSemanticEvidence([
    { id: 'prose', content: 'General prose', vector: [0.9, 0.1] },
    {
      id: 'steps',
      content: 'Numbered sequence:\n1. First action\n2. Second action\n3. Third action',
      vector: [0.84, 0.16],
    },
  ], [[1, 0]], 2, 0.7, 'كيفية تنفيذ الخطوات؟');

  assert.equal(ranked[0].id, 'steps');
});

test('Islamic Arabic terms add multilingual retrieval aliases', () => {
  assert.equal(expandKnowledgeQuery('كيفية الوضوء').length, 2);
  assert.match(expandKnowledgeQuery('ما معنى لا إله إلا الله')[1], /hapana mwabudiwa/i);
  assert.equal(expandKnowledgeQuery('How do I perform wudu?').length, 2);
  assert.equal(expandKnowledgeQuery('Ninatawadha vipi?').length, 2);
  assert.match(expandKnowledgeQuery('ما هي أركان الإسلام؟')[1], /nguzo tano/i);
  assert.match(expandKnowledgeQuery('What are the five pillars of Islam?')[1], /kutoa zaka/i);
  assert.deepEqual(expandKnowledgeQuery('سؤال عام'), ['سؤال عام']);
});

test('ranked evidence expands to consecutive chunks from the same book', () => {
  const chunks = Array.from({ length: 7 }, (_, index) => ({
    id: `book.txt:${index + 1}`,
    content: `Chunk ${index + 1}`,
  }));
  const expanded = expandWithNeighborEvidence(chunks, [chunks[2], chunks[4]], 6);

  assert.deepEqual(
    expanded.map((item) => item.id),
    ['book.txt:2', 'book.txt:3', 'book.txt:4', 'book.txt:5', 'book.txt:6', 'book.txt:7'],
  );
});

test('compound questions split in Arabic, English and Swahili', () => {
  assert.deepEqual(
    splitQuestionParts('كيفية الوضوء وما معنى الشهادة؟'),
    ['كيفية الوضوء', 'ما معنى الشهادة'],
  );
  assert.deepEqual(
    splitQuestionParts('How do I perform wudu and what does shahada mean?'),
    ['How do I perform wudu', 'what does shahada mean'],
  );
  assert.deepEqual(
    splitQuestionParts('Ninatawadha jinsi gani na maana ya shahada ni nini?'),
    ['Ninatawadha jinsi gani', 'maana ya shahada ni nini'],
  );
});

test('answer requests accept a supported response language', () => {
  assert.equal(parseAnswerInput({ question: 'Valid question', language: 'en' }).language, 'en');
  assert.equal(parseAnswerInput({ question: 'Swali halali', language: 'sw' }).language, 'sw');
  assert.equal(parseAnswerInput({ question: 'سؤال صالح' }).language, 'ar');
});

test('answer quality rejects incomplete or embellished numbered procedures', () => {
  const evidence = [{
    id: 'steps',
    content: 'Numbered sequence:\n1. Hatua ya kwanza\n2. Hatua ya pili\n3. Hatua ya tatu',
  }];

  assert.throws(() => assertAnswerQuality({
    answer: 'الخطوات مبينة أعلاه.',
    grounded: true,
  }, evidence), /required steps/);
  assert.throws(() => assertAnswerQuality({
    answer: '1. الأولى مرتين.\n2. الثانية.\n3. الثالثة.',
    grounded: true,
  }, evidence), /repetition count/);
  assert.doesNotThrow(() => assertAnswerQuality({
    answer: '1. الخطوة الأولى.\n2. الخطوة الثانية.\n3. الخطوة الثالثة.',
    grounded: true,
  }, evidence));
  assert.doesNotThrow(() => assertAnswerQuality({
    answer: '1. First step.\n2. Second step.\n3. Third step.',
    grounded: true,
  }, evidence, 'en'));
  assert.doesNotThrow(() => assertAnswerQuality({
    answer: '1. Hatua ya kwanza.\n2. Hatua ya pili.\n3. Hatua ya tatu.',
    grounded: true,
  }, evidence, 'sw'));
});

test('answer quality enforces the selected language for every answer type', () => {
  const proseEvidence = [{ id: 'lesson', content: 'Trusted prose evidence' }];

  assert.throws(() => assertAnswerQuality({
    answer: 'Maana ya kushuhudia kwamba hapana mungu mwingine ila Allah.',
    grounded: true,
  }, proseEvidence, 'ar'), /selected language/);
  assert.throws(() => assertAnswerQuality({
    answer: 'The steps are: Kuosha viganja viwili vya mikono na kuosha uso wote.',
    grounded: true,
  }, proseEvidence, 'en'), /selected language/);
  assert.doesNotThrow(() => assertAnswerQuality({
    answer: 'The meaning is that no deity is worthy of worship except Allah alone.',
    grounded: true,
  }, proseEvidence, 'en'));
  assert.doesNotThrow(() => assertAnswerQuality({
    answer: 'Maana yake ni kumuabudu Mwenyezi Mungu peke yake.',
    grounded: true,
  }, proseEvidence, 'sw'));
});

test('nearby numbered evidence does not turn a comparison question into a procedure', () => {
  const evidence = [{
    id: 'neighboring-steps',
    content: 'Numbered sequence:\n1. First step\n2. Second step\n3. Third step',
  }];

  assert.doesNotThrow(() => assertAnswerQuality({
    answer: 'الحدث الأكبر يحتاج إلى الغسل، والحدث الأصغر يحتاج إلى الوضوء.',
    grounded: true,
  }, evidence, 'ar', 'ما الفرق بين الحدث الأكبر والحدث الأصغر؟'));
});
