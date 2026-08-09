import type { AnswerInput, AnswerModel, AnswerResult, Evidence, KnowledgeSource, QuestionExpander } from './domain.ts';
import { insufficientEvidenceAnswer } from './domain.ts';
import { AppError } from './errors.ts';
import { normalizeArabic, tokenize } from './knowledge/arabic-text.ts';
import { expandKnowledgeQuery } from './knowledge/query-expansion.ts';
import { splitQuestionParts } from './question-parts.ts';
import { normalizeApprovedQuestion } from './modules/approved-answers/approved-answer-domain.ts';
import type { ApprovedAnswerRepository } from './modules/approved-answers/approved-answer-repository.ts';
import type { ApprovedAnswerEvidenceValidator } from './modules/approved-answers/approved-answer-evidence-validator.ts';

export interface AnswerExecution {
  evidenceReferences: string[];
  result: AnswerResult;
}

export class AnswerService {
  private readonly knowledge: KnowledgeSource;
  private readonly matchCount: number;
  private readonly model?: AnswerModel;
  private readonly questionExpander?: QuestionExpander;
  private readonly approvedAnswers?: ApprovedAnswerRepository;
  private readonly approvedAnswerEvidence?: ApprovedAnswerEvidenceValidator;

  constructor(
    knowledge: KnowledgeSource,
    matchCount: number,
    model?: AnswerModel,
    questionExpander?: QuestionExpander,
    approvedAnswers?: ApprovedAnswerRepository,
    approvedAnswerEvidence?: ApprovedAnswerEvidenceValidator,
  ) {
    this.knowledge = knowledge;
    this.matchCount = matchCount;
    this.model = model;
    this.questionExpander = questionExpander;
    this.approvedAnswers = approvedAnswers;
    this.approvedAnswerEvidence = approvedAnswerEvidence;
  }

  async answer(input: AnswerInput): Promise<AnswerResult> {
    return (await this.answerWithContext(input)).result;
  }

  async answerWithContext(input: AnswerInput): Promise<AnswerExecution> {
    const approved = await this.findApprovedAnswer(input);
    if (approved) return approved;

    if (!this.model) {
      throw new AppError(
        'MODEL_NOT_CONFIGURED',
        'أضف مفتاح OpenCode داخل ملف .env.local لتشغيل الإجابات.',
        503,
      );
    }

    const questionParts = splitQuestionParts(input.question);
    const matchesPerPart = this.matchCount;
    const alternatives = await Promise.all(
      questionParts.map((question) => this.expandQuestion(question)),
    );
    const results = await Promise.all(
      questionParts.map((question, index) =>
        this.knowledge.search(question, matchesPerPart, alternatives[index])),
    );
    if (results.every((result) => result.fileCount === 0)) {
      throw new AppError(
        'KNOWLEDGE_NOT_CONFIGURED',
        'أضف أول ملف نصي أو Markdown داخل data/knowledge.',
        503,
      );
    }

    const groupedEvidence = results.map((result, index) =>
      selectEvidence(questionParts[index], result.evidence, alternatives[index]),
    );
    const evidenceLimit = Math.min(8, this.matchCount * questionParts.length);
    const evidence = mergeEvidence(groupedEvidence, evidenceLimit);
    const result = evidence.length > 0
      ? this.model.answer(input, evidence)
      : { answer: insufficientEvidenceAnswer(input.language), grounded: false };
    return {
      evidenceReferences: evidence.map((item) => item.id),
      result: await result,
    };
  }

  private async findApprovedAnswer(input: AnswerInput): Promise<AnswerExecution | undefined> {
    if (!this.approvedAnswers || !this.approvedAnswerEvidence) return undefined;
    try {
      const answer = await this.approvedAnswers.findActiveExact({
        answerLanguage: input.language,
        normalizedQuestion: normalizeApprovedQuestion(input.question),
      });
      if (!answer || answer.evidenceReferences.length === 0) return undefined;
      const validation = await this.approvedAnswerEvidence.validate(answer.evidenceReferences);
      if (!validation.valid) return undefined;
      return {
        evidenceReferences: [...answer.evidenceReferences],
        result: {
          answer: answer.answer,
          generation: {
            model: `approved-answer/v${answer.version}`,
            provider: 'approved-answer',
          },
          grounded: true,
        },
      };
    } catch (error) {
      console.warn('Approved-answer lookup unavailable; continuing with the normal answer path.', error);
      return undefined;
    }
  }

  private async expandQuestion(question: string): Promise<string[]> {
    if (!this.questionExpander) return [];
    try {
      return await this.questionExpander.expand(question);
    } catch (error) {
      console.warn('Dynamic query expansion unavailable; continuing with local search.', error);
      return [];
    }
  }
}

function selectEvidence(question: string, evidence: Evidence[], alternatives: string[] = []): Evidence[] {
  const focusRadius = /(?:الفرق\s+بين|difference\s+between|tofauti\s+kati)/iu.test(question)
    ? 0
    : /(?:لماذا|ليه|why|kwa\s+nini|kwanini)/iu.test(question) ? 1 : undefined;
  if (focusRadius !== undefined && !evidence.every((item) => item.id.endsWith('#focus'))) {
    const focused = focusEvidenceLines(question, evidence, alternatives, focusRadius);
    if (focused.length > 0) {
      return focused.map((item) => ({ ...item, questionPart: question }));
    }
  }
  const isProcedure = /(?:كيف|كيفية|طريقة|خطوات|مراحل)/u.test(question);
  const directlyNumbered = evidence.find((item, index) =>
    /Numbered sequence:/i.test(item.content)
      && (index === 0 || sharesQueryTerm(item.content, question)));
  const relevantEvidence = evidence.filter((item, index) =>
    !/Numbered sequence:/i.test(item.content)
      || item === directlyNumbered
      || (index === 0 && sharesQueryTerm(item.content, question)));
  const selected = isProcedure && directlyNumbered
    ? [{ ...directlyNumbered, content: numberedSequenceOnly(directlyNumbered.content) }]
    : relevantEvidence.slice(0, 6);
  return selected.map((item) => ({ ...item, questionPart: question }));
}

function focusEvidenceLines(
  question: string,
  evidence: Evidence[],
  alternatives: string[],
  neighborRadius: number,
): Evidence[] {
  const terms = [...new Set(
    [...expandKnowledgeQuery(question), ...alternatives]
      .flatMap((query) => tokenize(normalizeArabic(query)))
      .filter((term) => term.length >= 3),
  )];
  const documents = evidence.map((item) => item.content.split(/\r?\n/u));
  const lines = evidence.flatMap((item, evidenceIndex) =>
    documents[evidenceIndex].map((text, lineIndex) => {
      const start = Math.max(0, lineIndex - neighborRadius);
      const end = lineIndex + neighborRadius + 1;
      const windowTerms = new Set(tokenize(normalizeArabic(
        documents[evidenceIndex].slice(start, end).join(' '),
      )));
      const ownTerms = new Set(tokenize(normalizeArabic(text)));
      const score = terms.reduce((total, term) => total + Number(windowTerms.has(term)), 0);
      const ownScore = terms.reduce((total, term) => total + Number(ownTerms.has(term)), 0);
      return { evidenceIndex, item, lineIndex, ownScore, score, text: text.trim() };
    }));
  const maximum = Math.max(0, ...lines.map((line) => line.score));
  if (maximum < 2) return [];

  const threshold = Math.max(2, maximum - 1);
  const anchors = lines
    .filter((line) => line.ownScore > 0 && (line.score >= threshold || line.ownScore >= 2))
    .sort((first, second) =>
      first.evidenceIndex - second.evidenceIndex || first.lineIndex - second.lineIndex)
    .slice(0, 8);
  const selectedKeys = new Set<string>();
  for (const anchor of anchors) {
    for (let offset = -neighborRadius; offset <= neighborRadius; offset += 1) {
      const lineIndex = anchor.lineIndex + offset;
      if (lineIndex >= 0 && lineIndex < documents[anchor.evidenceIndex].length) {
        selectedKeys.add(`${anchor.evidenceIndex}:${lineIndex}`);
      }
    }
  }
  const selected = lines.filter((line) =>
    line.text.length > 1 && selectedKeys.has(`${line.evidenceIndex}:${line.lineIndex}`));
  const grouped = new Map<string, Evidence>();
  for (const line of selected) {
    const existing = grouped.get(line.item.id);
    grouped.set(line.item.id, {
      id: line.item.id,
      content: existing ? `${existing.content}\n${line.text}` : line.text,
    });
  }
  return [...grouped.values()];
}

function sharesQueryTerm(content: string, question: string): boolean {
  const contentTerms = new Set(tokenize(normalizeArabic(content)));
  return expandKnowledgeQuery(question)
    .flatMap((query) => tokenize(normalizeArabic(query)))
    .some((term) => term.length >= 3 && contentTerms.has(term));
}

function numberedSequenceOnly(content: string): string {
  const match = content.match(/Numbered sequence:\s*\n((?:\d{1,2}\. [^\n]+\n?)+)/i);
  return match ? `Numbered sequence:\n${match[1].trim()}` : content;
}

function mergeEvidence(groups: Evidence[][], limit: number): Evidence[] {
  const merged: Evidence[] = [];
  const seen = new Set<string>();
  const maximumLength = Math.max(0, ...groups.map((group) => group.length));

  for (let index = 0; index < maximumLength && merged.length < limit; index += 1) {
    for (const group of groups) {
      const evidence = group[index];
      if (!evidence || seen.has(evidence.id)) continue;
      seen.add(evidence.id);
      merged.push(evidence);
      if (merged.length === limit) break;
    }
  }

  return merged;
}
