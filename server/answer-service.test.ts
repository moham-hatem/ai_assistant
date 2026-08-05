import assert from 'node:assert/strict';
import test from 'node:test';
import { AnswerService } from './answer-service.ts';
import type { AnswerModel, KnowledgeSource, QuestionExpander } from './domain.ts';

test('answer service does not call the model without evidence', async () => {
  let modelCalls = 0;
  const knowledge: KnowledgeSource = {
    search: async () => ({ evidence: [], fileCount: 1 }),
  };
  const model: AnswerModel = {
    answer: async () => {
      modelCalls += 1;
      return { answer: 'unexpected', grounded: true };
    },
  };

  const result = await new AnswerService(knowledge, 6, model).answer({
    question: 'سؤال صالح',
    history: [],
    language: 'ar',
  });

  assert.equal(result.grounded, false);
  assert.equal(modelCalls, 0);
});

test('answer service delegates grounded requests through its contracts', async () => {
  const knowledge: KnowledgeSource = {
    search: async () => ({
      evidence: [{ id: 'lesson:1', content: 'دليل موثوق' }],
      fileCount: 1,
    }),
  };
  const model: AnswerModel = {
    answer: async (input, evidence) => ({
      answer: `${input.history.length}:${evidence[0].content}`,
      grounded: true,
    }),
  };

  const result = await new AnswerService(knowledge, 6, model).answer({
    question: 'سؤال صالح',
    history: [{ role: 'user', content: 'سؤال سابق' }],
    language: 'ar',
  });

  assert.deepEqual(result, { answer: '1:دليل موثوق', grounded: true });
});

test('answer service searches compound questions as separate parts', async () => {
  const searches: string[] = [];
  const knowledge: KnowledgeSource = {
    search: async (question) => {
      searches.push(question);
      return {
        evidence: [{ id: question, content: `دليل: ${question}` }],
        fileCount: 1,
      };
    },
  };
  const model: AnswerModel = {
    answer: async (_input, evidence) => ({
      answer: evidence.map((item) => `${item.questionPart}:${item.content}`).join(' | '),
      grounded: true,
    }),
  };

  const result = await new AnswerService(knowledge, 6, model).answer({
    question: 'كيفية الوضوء وما معنى لا إله إلا الله؟',
    history: [],
    language: 'ar',
  });

  assert.deepEqual(searches, ['كيفية الوضوء', 'ما معنى لا إله إلا الله']);
  assert.match(result.answer, /دليل: كيفية الوضوء/);
  assert.match(result.answer, /دليل: ما معنى لا إله إلا الله/);
  assert.match(result.answer, /كيفية الوضوء:دليل/);
});

test('answer service sends only the numbered procedure to the model', async () => {
  let supplied = '';
  const knowledge: KnowledgeSource = {
    search: async () => ({
      evidence: [{
        id: 'book:1',
        content: 'Numbered sequence:\n1. First\n2. Second\n3. Third\n\nUnrelated nearby note',
      }],
      fileCount: 1,
    }),
  };
  const model: AnswerModel = {
    answer: async (_input, evidence) => {
      supplied = evidence[0].content;
      return { answer: 'ok', grounded: true };
    },
  };

  await new AnswerService(knowledge, 6, model).answer({
    question: 'كيفية التنفيذ؟',
    history: [],
    language: 'ar',
  });

  assert.match(supplied, /3\. Third/);
  assert.doesNotMatch(supplied, /Unrelated nearby note/);
});

test('answer service ignores an unrelated numbered procedure', async () => {
  let supplied = '';
  const knowledge: KnowledgeSource = {
    search: async () => ({
      evidence: [
        { id: 'friday:1', content: 'صلاة الجمعة\n\nوقتها وقت صلاة الظهر.\n\nكيفيتها ركعتان جهريتان.' },
        { id: 'wudu:1', content: 'Numbered sequence:\n1. Wudu first\n2. Wudu second' },
      ],
      fileCount: 1,
    }),
  };
  const model: AnswerModel = {
    answer: async (_input, evidence) => {
      supplied = evidence.map((item) => item.content).join('\n');
      return { answer: 'ok', grounded: true };
    },
  };

  await new AnswerService(knowledge, 6, model).answer({
    question: 'ما هي صلاة الجمعة وما وقتها وما كيفيتها؟',
    history: [],
    language: 'ar',
  });

  assert.match(supplied, /ركعتان جهريتان/);
  assert.doesNotMatch(supplied, /Wudu first/);
});

test('answer service supplies automatic multilingual alternatives to knowledge search', async () => {
  let suppliedAlternatives: string[] = [];
  const knowledge: KnowledgeSource = {
    search: async (_question, _limit, alternatives) => {
      suppliedAlternatives = alternatives ?? [];
      return { evidence: [{ id: 'lesson:1', content: 'Hadathi kubwa kwa kuoga' }], fileCount: 1 };
    },
  };
  const expander: QuestionExpander = {
    expand: async () => ['major ritual impurity', 'hadathi kubwa'],
  };
  const model: AnswerModel = {
    answer: async () => ({ answer: 'الحدث الأكبر يحتاج إلى الغسل.', grounded: true }),
  };

  await new AnswerService(knowledge, 6, model, expander).answer({
    question: 'ما الفرق بين الحدث الأكبر والأصغر؟',
    history: [],
    language: 'ar',
  });

  assert.deepEqual(suppliedAlternatives, ['major ritual impurity', 'hadathi kubwa']);
});

test('answer service focuses comparison evidence on both compared terms', async () => {
  let supplied = '';
  const knowledge: KnowledgeSource = {
    search: async () => ({
      evidence: [{
        id: 'lesson:7',
        content: [
          'Hadathi kubwa: kwa kuoga',
          'Na hadathi ndogo: kwa kutawadha',
          'Kukatika damu ya hedhi kwa mwanamke',
          'Numbered sequence:',
          '1. Kukusudia udhu',
        ].join('\n'),
      }],
      fileCount: 1,
    }),
  };
  const model: AnswerModel = {
    answer: async (_input, evidence) => {
      supplied = evidence.map((item) => item.content).join('\n');
      return { answer: 'الحدث الأكبر بالغسل، والأصغر بالوضوء.', grounded: true };
    },
  };

  await new AnswerService(knowledge, 6, model).answer({
    question: 'ما الفرق بين الحدث الأكبر والحدث الأصغر؟',
    history: [],
    language: 'ar',
  });

  assert.match(supplied, /Hadathi kubwa: kwa kuoga/);
  assert.match(supplied, /hadathi ndogo: kwa kutawadha/i);
  assert.doesNotMatch(supplied, /Kukatika damu|Numbered sequence/);
});

test('answer service focuses why questions on the matching reason and nearby lines', async () => {
  let supplied = '';
  const knowledge: KnowledgeSource = {
    search: async () => ({
      evidence: [{
        id: 'lesson:42',
        content: [
          'Usisimamishe kujifunza kuhusiana',
          'na Mola wako, Dini yako, na Mtume wako.',
          'Na kumbuka hadithi ya Mtume.',
          'Elimu',
          'Atakaye ingia kwenye njia',
          'kwa ajili ya kutafuta Elimu,',
          'Mwenyezi Mungu anamrahisishia',
          'kwa elimu hiyo njia nyepesi kwa Pepo.',
          'Rafiki ndiyo mvutaji wako.',
          'Chagua marafiki wema.',
        ].join('\n'),
      }],
      fileCount: 1,
    }),
  };
  const expander: QuestionExpander = {
    expand: async () => [
      'kwa nini muislamu aendelee kujifunza dini yake',
      'kutafuta elimu ni njia nyepesi kwa Pepo',
    ],
  };
  const model: AnswerModel = {
    answer: async (_input, evidence) => {
      supplied = evidence.map((item) => item.content).join('\n');
      return { answer: 'طلب العلم طريق إلى الجنة.', grounded: true };
    },
  };

  await new AnswerService(knowledge, 6, model, expander).answer({
    question: 'لماذا يجب على المسلم الاستمرار في تعلم دينه؟',
    history: [],
    language: 'ar',
  });

  assert.match(supplied, /kutafuta Elimu/);
  assert.match(supplied, /njia nyepesi kwa Pepo/);
  assert.doesNotMatch(supplied, /Chagua marafiki/);
});
