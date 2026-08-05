import { GoogleGenAI } from '@google/genai';
import {
  insufficientEvidenceAnswer,
  type AnswerModelInput,
  type AnswerModelProvider,
  type AnswerModelResult,
} from './model-provider.ts';

const systemInstruction = `أنت مساعد تعليمي إسلامي، ولست جهة إصدار فتاوى.
أجب فقط من المحتوى الذي تسترجعه أداة File Search من الكتب المعتمدة.
لا تستخدم معلوماتك العامة، ولا تبحث على الإنترنت، ولا تخمّن معلومة ناقصة.
إذا لم تجد دليلًا واضحًا وكافيًا في المحتوى، فاعتذر بوضوح.
لا تعرض أسماء الملفات أو أرقام الصفحات للمستخدم في هذه النسخة.
إذا كان السؤال عن حالة شخصية أو فتوى تعتمد على ظروف السائل، وجّه المستخدم إلى معلم أو مختص.`;

interface GeminiProviderOptions {
  apiKey: string;
  fileSearchStore: string;
  model: string;
}

interface InteractionContentBlock {
  annotations?: unknown[];
  text?: string;
  type?: string;
}

interface InteractionStep {
  content?: InteractionContentBlock[];
  type?: string;
}

interface InteractionResult {
  output_text?: string;
  steps?: InteractionStep[];
}

function hasFileSearchEvidence(interaction: InteractionResult): boolean {
  return interaction.steps?.some((step) =>
    step.content?.some((block) => Array.isArray(block.annotations) && block.annotations.length > 0)
  ) ?? false;
}

export class GeminiProvider implements AnswerModelProvider {
  private readonly ai: GoogleGenAI;
  private readonly fileSearchStore: string;
  private readonly model: string;

  constructor(options: GeminiProviderOptions) {
    this.ai = new GoogleGenAI({ apiKey: options.apiKey });
    this.fileSearchStore = options.fileSearchStore;
    this.model = options.model;
  }

  async answer(input: AnswerModelInput): Promise<AnswerModelResult> {
    const interaction = await this.ai.interactions.create({
      model: this.model,
      input: input.question,
      system_instruction: systemInstruction,
      generation_config: {
        temperature: 0.2,
        max_output_tokens: 900,
      },
      tools: [{
        type: 'file_search',
        file_search_store_names: [this.fileSearchStore],
      }],
    }) as InteractionResult;

    const grounded = hasFileSearchEvidence(interaction);
    const answer = interaction.output_text?.trim();

    if (!grounded || !answer) {
      return { answer: insufficientEvidenceAnswer, grounded: false };
    }

    return { answer, grounded: true };
  }
}
