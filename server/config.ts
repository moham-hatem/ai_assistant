import { resolve } from 'node:path';
import { APP_VERSION } from '../shared/contracts/api-version.ts';

export interface LocalRuntimeConfig {
  appVersion: string;
  answerCacheFile: string;
  backupDirectory: string;
  booksDatabaseFile: string;
  documentDirectory: string;
  knowledgeDirectory: string;
  matchCount: number;
  ocr: {
    confidenceThreshold: number;
    languages: string[];
    pdftoppmPath: string;
    pdftoppmTimeoutMs: number;
    tesseractPath: string;
    tesseractTimeoutMs: number;
  };
  questionLogDatabaseFile: string;
  questionExpansionCacheFile: string;
  questionExpansionTimeoutMs: number;
  semantic: {
    cacheDirectory: string;
    minimumScore: number;
    model: string;
  };
  translation: {
    cacheDirectory: string;
    model: string;
  };
  openCode: {
    apiKey?: string;
    endpoint: string;
    fallbackModels: string[];
    model: string;
    timeoutMs: number;
  };
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
  minimum = 1,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : fallback;
}

function boundedNumber(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : fallback;
}

export function createLocalConfig(env: Record<string, string>, cwd: string): LocalRuntimeConfig {
  return {
    appVersion: APP_VERSION,
    answerCacheFile: resolve(cwd, env.ANSWER_CACHE_FILE?.trim() || 'data/cache/answers.json'),
    backupDirectory: resolve(cwd, env.BACKUP_DIRECTORY?.trim() || 'data/backups'),
    booksDatabaseFile: resolve(cwd, env.BOOKS_DATABASE_FILE?.trim() || 'data/books.sqlite'),
    documentDirectory: resolve(cwd, env.DOCUMENT_DIRECTORY?.trim() || 'data/documents'),
    knowledgeDirectory: resolve(cwd, env.KNOWLEDGE_DIRECTORY?.trim() || 'data/knowledge'),
    matchCount: boundedInteger(env.KNOWLEDGE_MATCH_COUNT, 6, 12),
    ocr: {
      confidenceThreshold: boundedNumber(env.OCR_CONFIDENCE_THRESHOLD, 0.75, 0, 1),
      languages: parseLanguages(env.OCR_LANGUAGES),
      pdftoppmPath: env.PDFTOPPM_PATH?.trim() || 'pdftoppm',
      pdftoppmTimeoutMs: boundedInteger(env.PDFTOPPM_TIMEOUT_MS, 90_000, 300_000, 1_000),
      tesseractPath: env.TESSERACT_PATH?.trim() || 'tesseract',
      tesseractTimeoutMs: boundedInteger(env.TESSERACT_TIMEOUT_MS, 60_000, 300_000, 1_000),
    },
    questionLogDatabaseFile: resolve(
      cwd,
      env.QUESTION_LOG_DATABASE_FILE?.trim() || 'data/question-log.sqlite',
    ),
    questionExpansionCacheFile: resolve(
      cwd,
      env.QUESTION_EXPANSION_CACHE_FILE?.trim() || 'data/cache/question-expansions.json',
    ),
    questionExpansionTimeoutMs: boundedInteger(
      env.QUESTION_EXPANSION_TIMEOUT_MS,
      12_000,
      30_000,
      3_000,
    ),
    semantic: {
      cacheDirectory: resolve(cwd, env.EMBEDDING_CACHE_DIRECTORY?.trim() || 'data/models'),
      minimumScore: boundedNumber(env.SEMANTIC_MIN_SCORE, 0.76, 0, 1),
      model: env.EMBEDDING_MODEL?.trim() || 'Xenova/multilingual-e5-small',
    },
    translation: {
      cacheDirectory: resolve(cwd, env.TRANSLATION_CACHE_DIRECTORY?.trim() || 'data/models'),
      model: env.TRANSLATION_MODEL?.trim() || 'Xenova/nllb-200-distilled-600M',
    },
    openCode: {
      apiKey: env.OPENCODE_API_KEY?.trim() || undefined,
      endpoint: env.OPENCODE_API_ENDPOINT?.trim()
        || 'https://opencode.ai/zen/v1/chat/completions',
      fallbackModels: parseModels(
        env.OPENCODE_FALLBACK_MODELS || env.OPENCODE_FALLBACK_MODEL,
        ['nemotron-3-ultra-free', 'ling-3.0-flash-free', 'laguna-s-2.1-free'],
      ),
      model: env.OPENCODE_MODEL?.trim() || 'deepseek-v4-flash-free',
      timeoutMs: boundedInteger(env.OPENCODE_TIMEOUT_MS, 60_000, 120_000, 5_000),
    },
  };
}

function parseLanguages(value: string | undefined): string[] {
  const languages = (value ?? '')
    .split(/[,+]/u)
    .map((language) => language.trim())
    .filter((language) => /^[a-z0-9_-]+$/iu.test(language));
  return languages.length > 0 ? [...new Set(languages)] : ['ara', 'eng', 'swa'];
}

function parseModels(value: string | undefined, fallback: string[]): string[] {
  const models = (value ?? '').split(',').map((model) => model.trim()).filter(Boolean);
  return models.length > 0 ? [...new Set(models)] : fallback;
}
