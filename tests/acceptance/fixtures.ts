import type { AnswerInput, AnswerResult, Evidence } from '../../server/domain.ts';

export interface AcceptanceFixture {
  expectedEvidence: Evidence[];
  expectedResult: AnswerResult;
  expectedSearches: string[];
  id: string;
  input: AnswerInput;
  modelResult?: AnswerResult;
  searchResults: Readonly<Record<string, Evidence[]>>;
  title: string;
}

export const acceptanceFixtures: AcceptanceFixture[] = [
  {
    id: 'arabic-grounded-answer',
    title: 'answers an Arabic question only from matching evidence',
    input: {
      question: 'ما فائدة المراجعة اليومية؟',
      history: [],
      language: 'ar',
    },
    searchResults: {
      'ما فائدة المراجعة اليومية': [{
        id: 'fixture:ar:review',
        content: 'المراجعة اليومية تساعد المتعلم على تذكر الأفكار وترتيبها.',
      }],
    },
    modelResult: {
      answer: 'تساعد المراجعة اليومية المتعلم على تذكر الأفكار وترتيبها.',
      grounded: true,
    },
    expectedResult: {
      answer: 'تساعد المراجعة اليومية المتعلم على تذكر الأفكار وترتيبها.',
      grounded: true,
    },
    expectedSearches: ['ما فائدة المراجعة اليومية'],
    expectedEvidence: [{
      id: 'fixture:ar:review',
      content: 'المراجعة اليومية تساعد المتعلم على تذكر الأفكار وترتيبها.',
      questionPart: 'ما فائدة المراجعة اليومية',
    }],
  },
  {
    id: 'history-is-not-evidence',
    title: 'refuses an English question when only chat history contains an answer',
    input: {
      question: 'What color is the imaginary school gate?',
      history: [
        { role: 'user', content: 'Someone told me the imaginary school gate is blue.' },
        { role: 'assistant', content: 'That claim has not been checked against a lesson.' },
      ],
      language: 'en',
    },
    searchResults: {
      'What color is the imaginary school gate': [],
    },
    expectedResult: {
      answer: 'I could not find enough information in the local educational content to answer this question. You can rephrase it or ask a qualified teacher.',
      grounded: false,
    },
    expectedSearches: ['What color is the imaginary school gate'],
    expectedEvidence: [],
  },
  {
    id: 'swahili-why-answer',
    title: 'keeps the relevant reason and answers a Swahili why question',
    input: {
      question: 'Kwa nini mapumziko mafupi yanafaa wakati wa kujifunza?',
      history: [],
      language: 'sw',
    },
    searchResults: {
      'Kwa nini mapumziko mafupi yanafaa wakati wa kujifunza': [{
        id: 'fixture:sw:pause',
        content: [
          'Mapumziko mafupi yanafaa wakati wa kujifunza.',
          'Yanamsaidia mwanafunzi kurejea akiwa makini.',
          'Mlango wa darasa una rangi ya kijani.',
        ].join('\n'),
      }],
    },
    modelResult: {
      answer: 'Mapumziko mafupi humsaidia mwanafunzi kurejea akiwa makini.',
      grounded: true,
    },
    expectedResult: {
      answer: 'Mapumziko mafupi humsaidia mwanafunzi kurejea akiwa makini.',
      grounded: true,
    },
    expectedSearches: ['Kwa nini mapumziko mafupi yanafaa wakati wa kujifunza'],
    expectedEvidence: [{
      id: 'fixture:sw:pause',
      content: [
        'Mapumziko mafupi yanafaa wakati wa kujifunza.',
        'Yanamsaidia mwanafunzi kurejea akiwa makini.',
      ].join('\n'),
      questionPart: 'Kwa nini mapumziko mafupi yanafaa wakati wa kujifunza',
    }],
  },
  {
    id: 'compound-question',
    title: 'grounds both parts of a compound English question',
    input: {
      question: 'What does the lesson map show and why is a short pause useful?',
      history: [],
      language: 'en',
    },
    searchResults: {
      'What does the lesson map show': [{
        id: 'fixture:en:map',
        content: 'The lesson map shows the three topics in their study order.',
      }],
      'why is a short pause useful': [{
        id: 'fixture:en:pause',
        content: [
          'A short pause is useful during study.',
          'It helps the learner return with attention.',
          'The classroom window faces the garden.',
        ].join('\n'),
      }],
    },
    modelResult: {
      answer: 'The map shows the three topics in study order, and a short pause helps the learner return with attention.',
      grounded: true,
    },
    expectedResult: {
      answer: 'The map shows the three topics in study order, and a short pause helps the learner return with attention.',
      grounded: true,
    },
    expectedSearches: [
      'What does the lesson map show',
      'why is a short pause useful',
    ],
    expectedEvidence: [
      {
        id: 'fixture:en:map',
        content: 'The lesson map shows the three topics in their study order.',
        questionPart: 'What does the lesson map show',
      },
      {
        id: 'fixture:en:pause',
        content: [
          'A short pause is useful during study.',
          'It helps the learner return with attention.',
        ].join('\n'),
        questionPart: 'why is a short pause useful',
      },
    ],
  },
  {
    id: 'ordered-procedure',
    title: 'preserves every numbered step and excludes nearby prose',
    input: {
      question: 'كيف أرتب بطاقات الدرس؟',
      history: [],
      language: 'ar',
    },
    searchResults: {
      'كيف أرتب بطاقات الدرس': [{
        id: 'fixture:ar:cards',
        content: [
          'Numbered sequence:',
          '1. اكتب عنوانًا قصيرًا على كل بطاقة',
          '2. رتب البطاقات حسب تسلسل الدرس',
          '3. راجع الترتيب من البداية إلى النهاية',
          '',
          'هذه ملاحظة مصطنعة لا تنتمي إلى الإجراء.',
        ].join('\n'),
      }],
    },
    modelResult: {
      answer: [
        '1. اكتب عنوانًا قصيرًا على كل بطاقة.',
        '2. رتب البطاقات حسب تسلسل الدرس.',
        '3. راجع الترتيب من البداية إلى النهاية.',
      ].join('\n'),
      grounded: true,
    },
    expectedResult: {
      answer: [
        '1. اكتب عنوانًا قصيرًا على كل بطاقة.',
        '2. رتب البطاقات حسب تسلسل الدرس.',
        '3. راجع الترتيب من البداية إلى النهاية.',
      ].join('\n'),
      grounded: true,
    },
    expectedSearches: ['كيف أرتب بطاقات الدرس'],
    expectedEvidence: [{
      id: 'fixture:ar:cards',
      content: [
        'Numbered sequence:',
        '1. اكتب عنوانًا قصيرًا على كل بطاقة',
        '2. رتب البطاقات حسب تسلسل الدرس',
        '3. راجع الترتيب من البداية إلى النهاية',
      ].join('\n'),
      questionPart: 'كيف أرتب بطاقات الدرس',
    }],
  },
  {
    id: 'question-answer-language-mismatch',
    title: 'uses the selected English response language for an Arabic question',
    input: {
      question: 'ماذا تعرض خريطة الدرس؟',
      history: [],
      language: 'en',
    },
    searchResults: {
      'ماذا تعرض خريطة الدرس': [{
        id: 'fixture:sw:lesson-map',
        content: 'Ramani ya somo inaonyesha mada tatu kwa mpangilio wa kujifunza.',
      }],
    },
    modelResult: {
      answer: 'The lesson map shows three topics in their study order.',
      grounded: true,
    },
    expectedResult: {
      answer: 'The lesson map shows three topics in their study order.',
      grounded: true,
    },
    expectedSearches: ['ماذا تعرض خريطة الدرس'],
    expectedEvidence: [{
      id: 'fixture:sw:lesson-map',
      content: 'Ramani ya somo inaonyesha mada tatu kwa mpangilio wa kujifunza.',
      questionPart: 'ماذا تعرض خريطة الدرس',
    }],
  },
];
