import {
  insufficientEvidenceAnswer,
  type AnswerEvidence,
  type AnswerModelInput,
  type AnswerModelProvider,
  type AnswerModelResult,
} from './model-provider.ts';

const systemInstruction = `أنت مساعد تعليمي إسلامي، ولست جهة إصدار فتاوى.
أجب بالعربية فقط من الأدلة المرقمة التي ستُرسل إليك، ولا تستخدم معرفتك العامة أو الإنترنت.
إذا لم تكفِ الأدلة، أعد كلمة INSUFFICIENT وحدها.
إذا كانت الأدلة كافية، أعد الناتج بهذا الشكل فقط دون Markdown:
<answer>الإجابة</answer>
<evidence>أرقام الأدلة المستخدمة مفصولة بفواصل</evidence>
لا تذكر أسماء الملفات أو أرقام الصفحات. إذا كان السؤال فتوى شخصية تعتمد على ظروف السائل، وجّه المستخدم إلى معلم أو مختص.`;

interface OpenCodeProviderOptions {
  apiKey: string;
  endpoint: string;
  model: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

function buildEvidencePrompt(question: string, evidence: AnswerEvidence[]): string {
  const excerpts = evidence
    .map((item, index) => `[${index + 1}] ${item.content}`)
    .join('\n\n');

  return `السؤال:\n${question}\n\nالأدلة المعتمدة:\n${excerpts}`;
}

export function parseGroundedAnswer(content: string, evidenceCount: number): AnswerModelResult {
  if (content.trim() === 'INSUFFICIENT') {
    return { answer: insufficientEvidenceAnswer, grounded: false };
  }

  const answer = content.match(/<answer>([\s\S]*?)<\/answer>/i)?.[1]?.trim();
  const evidenceText = content.match(/<evidence>([\s\S]*?)<\/evidence>/i)?.[1] ?? '';
  const citedEvidence = evidenceText
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= evidenceCount);

  if (!answer || citedEvidence.length === 0) {
    return { answer: insufficientEvidenceAnswer, grounded: false };
  }

  return { answer, grounded: true };
}

export class OpenCodeProvider implements AnswerModelProvider {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly model: string;

  constructor(options: OpenCodeProviderOptions) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint;
    this.model = options.model;
  }

  async answer(input: AnswerModelInput): Promise<AnswerModelResult> {
    const evidence = input.evidence ?? [];
    if (evidence.length === 0) {
      return { answer: insufficientEvidenceAnswer, grounded: false };
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: buildEvidencePrompt(input.question, evidence) },
        ],
        temperature: 0.2,
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const payload = await response.json() as ChatCompletionResponse;
    if (!response.ok) {
      throw new Error(`OpenCode request failed (${response.status}): ${payload.error?.message ?? 'unknown error'}`);
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return { answer: insufficientEvidenceAnswer, grounded: false };
    }

    return parseGroundedAnswer(content, evidence.length);
  }
}
