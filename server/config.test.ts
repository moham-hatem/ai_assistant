import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalConfig } from './config.ts';

test('local OCR configuration uses safe offline defaults and bounded overrides', () => {
  const defaults = createLocalConfig({}, '/workspace');
  assert.deepEqual(defaults.ocr, {
    confidenceThreshold: 0.75,
    languages: ['ara', 'eng', 'swa'],
    pdftoppmPath: 'pdftoppm',
    pdftoppmTimeoutMs: 90_000,
    tesseractPath: 'tesseract',
    tesseractTimeoutMs: 60_000,
  });

  const configured = createLocalConfig({
    OCR_CONFIDENCE_THRESHOLD: '2',
    OCR_LANGUAGES: 'ara+eng,invalid language+swa',
    PDFTOPPM_PATH: 'C:\\tools\\pdftoppm.exe',
    PDFTOPPM_TIMEOUT_MS: '999999',
    TESSERACT_PATH: 'C:\\tools\\tesseract.exe',
    TESSERACT_TIMEOUT_MS: '500',
  }, '/workspace');
  assert.deepEqual(configured.ocr, {
    confidenceThreshold: 1,
    languages: ['ara', 'eng', 'swa'],
    pdftoppmPath: 'C:\\tools\\pdftoppm.exe',
    pdftoppmTimeoutMs: 300_000,
    tesseractPath: 'C:\\tools\\tesseract.exe',
    tesseractTimeoutMs: 1_000,
  });
});
