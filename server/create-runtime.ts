import { AnswerService } from './answer-service.ts';
import { AnswerRequestService } from './answer-request-service.ts';
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
import type { QuestionLogRepository } from './modules/question-log/question-log-repository.ts';
import { QuestionLogService } from './modules/question-log/question-log-service.ts';
import { SqliteQuestionLogRepository } from './modules/question-log/sqlite-question-log-repository.ts';
import { UnavailableQuestionLogRepository } from './modules/question-log/unavailable-question-log-repository.ts';
import type { BookRepository } from './modules/books/book-repository.ts';
import { BookService } from './modules/books/book-service.ts';
import { SqliteBookRepository } from './modules/books/sqlite-book-repository.ts';
import { UnavailableBookRepository } from './modules/books/unavailable-book-repository.ts';
import { BookDocumentService } from './modules/books/book-document-service.ts';
import { BookDocumentEvidenceSource } from './modules/books/book-document-evidence.ts';
import type { ReviewRepository } from './modules/reviews/review-repository.ts';
import { ReviewService } from './modules/reviews/review-service.ts';
import { SqliteReviewRepository } from './modules/reviews/sqlite-review-repository.ts';
import { UnavailableReviewRepository } from './modules/reviews/unavailable-review-repository.ts';
import type { ApprovedAnswerRepository } from './modules/approved-answers/approved-answer-repository.ts';
import { PublishedApprovedAnswerEvidenceValidator } from './modules/approved-answers/approved-answer-evidence-validator.ts';
import { LocalPublishedEvidenceSource } from './knowledge/local-published-evidence-source.ts';
import type { FeedbackRepository } from './modules/feedback/feedback-repository.ts';
import { FeedbackService } from './modules/feedback/feedback-service.ts';
import { SqliteFeedbackRepository } from './modules/feedback/sqlite-feedback-repository.ts';
import { UnavailableFeedbackRepository } from './modules/feedback/unavailable-feedback-repository.ts';
import type { QualityMetricsRepository } from './modules/quality-metrics/quality-metrics-repository.ts';
import { QualityMetricsService } from './modules/quality-metrics/quality-metrics-service.ts';
import { SqliteQualityMetricsRepository } from './modules/quality-metrics/sqlite-quality-metrics-repository.ts';
import { UnavailableQualityMetricsRepository } from './modules/quality-metrics/unavailable-quality-metrics-repository.ts';
import type { DocumentProcessorPort } from './documents/document-processing-service.ts';

export interface RuntimeDependencies {
  documentProcessor?: DocumentProcessorPort;
}

export function createRuntime(config: LocalRuntimeConfig, dependencies: RuntimeDependencies = {}) {
  const documentStore = new DocumentStore(config.documentDirectory, config.knowledgeDirectory);
  const bookRepository = createBookRepository(config.booksDatabaseFile);
  const bookService = new BookService(bookRepository);
  const bookDocuments = new BookDocumentService(
    bookService,
    bookRepository,
    documentStore,
    undefined,
    dependencies.documentProcessor,
  );
  const embedder = new MultilingualEmbedder(
    config.semantic.model,
    config.semantic.cacheDirectory,
  );
  const semantic = new SemanticSearch(
    embedder,
    config.knowledgeDirectory,
    config.semantic.minimumScore,
  );
  const publishedEvidence = new BookDocumentEvidenceSource(bookRepository, documentStore);
  const knowledge = new LocalKnowledgeSource(
    config.knowledgeDirectory,
    semantic,
    publishedEvidence,
  );
  const localModel = new LocalTranslationAnswerModel(
    new NllbTranslator(config.translation.model, config.translation.cacheDirectory),
    { provider: 'huggingface-transformers', model: config.translation.model },
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
  const questionLogRepository = createQuestionLogRepository(config.questionLogDatabaseFile);
  const questionLogService = new QuestionLogService(questionLogRepository);
  const reviewRepository = createReviewRepository(config.questionLogDatabaseFile);
  const feedbackRepository = createFeedbackRepository(config.questionLogDatabaseFile);
  const qualityMetricsRepository = createQualityMetricsRepository(config.questionLogDatabaseFile);
  const answerService = new AnswerService(
    knowledge,
    config.matchCount,
    model,
    questionExpander,
    reviewRepository,
    new PublishedApprovedAnswerEvidenceValidator(
      new LocalPublishedEvidenceSource(config.knowledgeDirectory, publishedEvidence),
    ),
  );
  return {
    answerRequestService: new AnswerRequestService(answerService, questionLogService),
    answerService,
    bookDocuments,
    documentStore,
    bookRepository,
    bookService,
    feedbackRepository,
    feedbackService: new FeedbackService(feedbackRepository),
    knowledge,
    questionLogRepository,
    questionLogService,
    qualityMetricsRepository,
    qualityMetricsService: new QualityMetricsService(qualityMetricsRepository),
    reviewRepository,
    reviewService: new ReviewService(reviewRepository, questionLogRepository),
  };
}

function createQualityMetricsRepository(path: string): QualityMetricsRepository {
  try {
    return new SqliteQualityMetricsRepository(path);
  } catch (error) {
    console.warn('Local quality metrics could not be initialized; the dashboard is unavailable.');
    return new UnavailableQualityMetricsRepository(error);
  }
}

function createFeedbackRepository(path: string): FeedbackRepository {
  try {
    return new SqliteFeedbackRepository(path);
  } catch (error) {
    console.warn('Local feedback database could not be initialized; feedback is unavailable.');
    return new UnavailableFeedbackRepository(error);
  }
}

function createReviewRepository(path: string): ReviewRepository & ApprovedAnswerRepository {
  try {
    return new SqliteReviewRepository(path);
  } catch (error) {
    console.warn('Local review database could not be initialized; teacher review is unavailable.');
    return new UnavailableReviewRepository(error);
  }
}

function createBookRepository(path: string): BookRepository {
  try {
    return new SqliteBookRepository(path);
  } catch (error) {
    console.warn('Local book database could not be initialized; existing document upload remains available.');
    return new UnavailableBookRepository(error);
  }
}

function createQuestionLogRepository(path: string): QuestionLogRepository {
  try {
    return new SqliteQuestionLogRepository(path);
  } catch (error) {
    console.warn('Local question log could not be initialized; answers will continue without audit persistence.');
    return new UnavailableQuestionLogRepository(error);
  }
}
