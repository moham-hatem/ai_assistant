import { AnswerService } from './answer-service.ts';
import type { LocalRuntimeConfig } from './config.ts';
import { DocumentStore } from './documents/document-store.ts';
import { LocalKnowledgeSource } from './knowledge/local-knowledge.ts';
import { MultilingualEmbedder } from './knowledge/multilingual-embedder.ts';
import { SemanticSearch } from './knowledge/semantic-search.ts';
import { OpenCodeModel } from './model/opencode-model.ts';
import { AnswerCache } from './model/answer-cache.ts';
import { CachedAnswerModel } from './model/cached-answer-model.ts';
import { LocalTranslationAnswerModel } from './model/local-translation-answer-model.ts';
import { NllbTranslator } from './model/nllb-translator.ts';
import { ResilientAnswerModel } from './model/resilient-answer-model.ts';
import { CachedQuestionExpander } from './knowledge/cached-question-expander.ts';
import { OpenCodeQuestionExpander } from './knowledge/opencode-question-expander.ts';
import { QuestionExpansionCache } from './knowledge/question-expansion-cache.ts';

export function createRuntime(config: LocalRuntimeConfig) {
  const embedder = new MultilingualEmbedder(
    config.semantic.model,
    config.semantic.cacheDirectory,
  );
  const semantic = new SemanticSearch(
    embedder,
    config.knowledgeDirectory,
    config.semantic.minimumScore,
  );
  const knowledge = new LocalKnowledgeSource(config.knowledgeDirectory, semantic);
  const localModel = new LocalTranslationAnswerModel(
    new NllbTranslator(config.translation.model, config.translation.cacheDirectory),
  );
  const answerModel = config.openCode.apiKey
    ? new ResilientAnswerModel(
      new OpenCodeModel({ ...config.openCode, apiKey: config.openCode.apiKey }),
      localModel,
    )
    : localModel;
  const model = new CachedAnswerModel(answerModel, new AnswerCache(config.answerCacheFile));
  const questionExpander = config.openCode.apiKey
    ? new CachedQuestionExpander(
      new OpenCodeQuestionExpander({
        apiKey: config.openCode.apiKey,
        endpoint: config.openCode.endpoint,
        fallbackModels: config.openCode.fallbackModels,
        model: config.openCode.model,
        timeoutMs: config.questionExpansionTimeoutMs,
      }),
      new QuestionExpansionCache(config.questionExpansionCacheFile),
    )
    : undefined;

  return {
    answerService: new AnswerService(knowledge, config.matchCount, model, questionExpander),
    documentStore: new DocumentStore(config.documentDirectory, config.knowledgeDirectory),
    knowledge,
  };
}
