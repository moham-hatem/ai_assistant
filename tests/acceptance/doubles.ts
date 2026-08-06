import type {
  AnswerInput,
  AnswerModel,
  AnswerResult,
  Evidence,
  KnowledgeSource,
} from '../../server/domain.ts';

export interface SearchCall {
  alternatives: string[];
  limit: number;
  question: string;
}

export interface ModelCall {
  evidence: Evidence[];
  input: AnswerInput;
}

export class FixtureKnowledgeSource implements KnowledgeSource {
  readonly calls: SearchCall[] = [];
  private readonly results: Readonly<Record<string, Evidence[]>>;

  constructor(results: Readonly<Record<string, Evidence[]>>) {
    this.results = results;
  }

  async search(question: string, limit: number, alternatives: string[] = []) {
    this.calls.push({ alternatives: [...alternatives], limit, question });
    const evidence = this.results[question] ?? [];
    return {
      evidence: evidence.map((item) => ({ ...item })),
      fileCount: 1,
    };
  }
}

export class FixtureAnswerModel implements AnswerModel {
  readonly calls: ModelCall[] = [];
  private readonly result?: AnswerResult;

  constructor(result?: AnswerResult) {
    this.result = result;
  }

  async answer(input: AnswerInput, evidence: Evidence[]): Promise<AnswerResult> {
    this.calls.push({
      evidence: evidence.map((item) => ({ ...item })),
      input: { ...input, history: input.history.map((turn) => ({ ...turn })) },
    });
    if (!this.result) {
      throw new Error('The model double was called for a fixture that must refuse.');
    }
    return { ...this.result };
  }
}
