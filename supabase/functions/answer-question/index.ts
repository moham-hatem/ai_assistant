import { createCorsHeaders, jsonResponse } from '../_shared/http.ts';
import { GeminiProvider } from './gemini-provider.ts';
import { KnowledgeRepository } from './knowledge-repository.ts';
import { insufficientEvidenceAnswer, type AnswerModelProvider } from './model-provider.ts';
import { OpenCodeProvider } from './opencode-provider.ts';

const defaultProvider = 'opencode';
const defaultGeminiModel = 'gemini-3.5-flash-lite';
const defaultOpenCodeEndpoint = 'https://opencode.ai/zen/v1/chat/completions';
const defaultOpenCodeModel = 'deepseek-v4-flash-free';
const minimumQuestionLength = 3;
const maximumQuestionLength = 1000;

interface AnswerQuestionBody {
  question?: unknown;
}

function getConfiguration() {
  return {
    provider: Deno.env.get('ANSWER_MODEL_PROVIDER')?.trim().toLowerCase() || defaultProvider,
    gemini: {
      apiKey: Deno.env.get('GEMINI_API_KEY')?.trim(),
      fileSearchStore: Deno.env.get('GEMINI_FILE_SEARCH_STORE')?.trim(),
      model: Deno.env.get('GEMINI_MODEL')?.trim() || defaultGeminiModel,
    },
    knowledge: {
      matchCount: Number.parseInt(Deno.env.get('KNOWLEDGE_MATCH_COUNT') ?? '6', 10),
      serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim(),
      supabaseUrl: Deno.env.get('SUPABASE_URL')?.trim(),
    },
    openCode: {
      apiKey: Deno.env.get('OPENCODE_API_KEY')?.trim(),
      endpoint: Deno.env.get('OPENCODE_API_ENDPOINT')?.trim() || defaultOpenCodeEndpoint,
      model: Deno.env.get('OPENCODE_MODEL')?.trim() || defaultOpenCodeModel,
    },
  };
}

function createGeminiProvider(configuration: ReturnType<typeof getConfiguration>): AnswerModelProvider | undefined {
  if (!configuration.gemini.apiKey || !configuration.gemini.fileSearchStore) {
    return undefined;
  }

  return new GeminiProvider({
    apiKey: configuration.gemini.apiKey,
    fileSearchStore: configuration.gemini.fileSearchStore,
    model: configuration.gemini.model,
  });
}

function createOpenCodeProvider(configuration: ReturnType<typeof getConfiguration>): AnswerModelProvider | undefined {
  if (!configuration.openCode.apiKey) {
    return undefined;
  }

  return new OpenCodeProvider({
    apiKey: configuration.openCode.apiKey,
    endpoint: configuration.openCode.endpoint,
    model: configuration.openCode.model,
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: createCorsHeaders(request) });
  }

  if (request.method !== 'POST') {
    return jsonResponse(request, { code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const requestId = crypto.randomUUID();

  try {
    const body = await request.json() as AnswerQuestionBody;
    const question = typeof body.question === 'string' ? body.question.trim() : '';

    if (question.length < minimumQuestionLength || question.length > maximumQuestionLength) {
      return jsonResponse(request, {
        code: 'INVALID_QUESTION',
        message: `يجب أن يكون السؤال بين ${minimumQuestionLength} و${maximumQuestionLength} حرفًا.`,
        requestId,
      }, 400);
    }

    const configuration = getConfiguration();
    const provider = configuration.provider === 'gemini'
      ? createGeminiProvider(configuration)
      : configuration.provider === 'opencode'
      ? createOpenCodeProvider(configuration)
      : undefined;

    if (!provider) {
      return jsonResponse(request, {
        code: 'KNOWLEDGE_BASE_NOT_CONFIGURED',
        message: 'لم يتم تجهيز مزود الإجابة بعد.',
        requestId,
      }, 503);
    }

    if (configuration.provider === 'opencode') {
      const matchCount = Number.isFinite(configuration.knowledge.matchCount)
        ? Math.min(Math.max(configuration.knowledge.matchCount, 1), 12)
        : 6;

      if (!configuration.knowledge.supabaseUrl || !configuration.knowledge.serviceRoleKey) {
        return jsonResponse(request, {
          code: 'KNOWLEDGE_BASE_NOT_CONFIGURED',
          message: 'لم يتم تجهيز قاعدة المعرفة بعد.',
          requestId,
        }, 503);
      }

      const knowledge = new KnowledgeRepository({
        matchCount,
        serviceRoleKey: configuration.knowledge.serviceRoleKey,
        supabaseUrl: configuration.knowledge.supabaseUrl,
      });
      const evidence = await knowledge.search(question);

      if (evidence.length === 0) {
        return jsonResponse(request, {
          answer: insufficientEvidenceAnswer,
          grounded: false,
          requestId,
        });
      }

      const result = await provider.answer({ question, evidence });
      return jsonResponse(request, { ...result, requestId });
    }

    const result = await provider.answer({ question });

    return jsonResponse(request, { ...result, requestId });
  } catch (error) {
    console.error('answer-question failed', { requestId, error });
    return jsonResponse(request, {
      code: 'ANSWER_SERVICE_UNAVAILABLE',
      message: 'تعذر إنشاء الإجابة الآن.',
      requestId,
    }, 502);
  }
});
