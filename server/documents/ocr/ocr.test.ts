import assert from 'node:assert/strict';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CliExecutionError, ExecFileCliRunner, type CliRunner } from './cli.ts';
import { LocalPdfOcr } from './local-pdf-ocr.ts';
import { TextQualityOcrPolicy } from './page-policy.ts';
import { PdftoppmRasterizer } from './pdftoppm-rasterizer.ts';
import { TesseractOcrEngine } from './tesseract-engine.ts';
import type { OcrEngine, PageRasterizer } from './types.ts';

test('text quality policy identifies short and corrupted pages while accepting sufficient multilingual text', () => {
  const policy = new TextQualityOcrPolicy({ minCharacters: 20, minWords: 4 });

  const healthy = policy.evaluate('[PDF page 1]\nتعلم الصلاة الصحيحة with clear instructions kwa wanafunzi');
  const short = policy.evaluate('[PDF page 2]\nTitle');
  const corrupted = new TextQualityOcrPolicy({
    maxSuspiciousCharacterRatio: 0.1,
    minCharacters: 1,
    minWords: 1,
  }).evaluate('\uFFFD\uFFFDvalid');

  assert.equal(healthy.needsOcr, false);
  assert.ok(healthy.confidence > 0.9);
  assert.deepEqual(short.reasons, ['too_few_characters', 'too_few_words']);
  assert.match(corrupted.reasons.join(','), /suspicious_characters/u);
});

test('Tesseract engine uses configurable languages and computes page confidence from TSV words', async () => {
  const calls: Array<{ args: readonly string[]; executable: string }> = [];
  const runner: CliRunner = {
    async run(executable, args) {
      calls.push({ args, executable });
      return {
        stderr: '',
        stdout: [
          'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
          '5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t90\tالسلام',
          '5\t1\t1\t1\t1\t2\t0\t0\t1\t1\t70\tworld',
          '5\t1\t1\t1\t2\t1\t0\t0\t1\t1\t80\thabari',
        ].join('\n'),
      };
    },
  };
  const engine = new TesseractOcrEngine({ executable: 'custom-tesseract' }, runner);

  const result = await engine.recognize({
    imagePath: 'page.png',
    languages: ['ara', 'eng', 'swa'],
    pageNumber: 4,
  });

  assert.deepEqual(calls, [{
    args: ['page.png', 'stdout', '-l', 'ara+eng+swa', 'tsv'],
    executable: 'custom-tesseract',
  }]);
  assert.equal(result.text, 'السلام world\nhabari');
  assert.ok(Math.abs(result.confidence - 0.8) < Number.EPSILON * 2);
  assert.equal(result.pageNumber, 4);
});

test('local OCR uses unique temporary directories and always cleans them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'local-pdf-ocr-test-'));
  const directories: string[] = [];
  const languages: string[][] = [];
  const rasterizer: PageRasterizer = {
    async rasterize(input) {
      directories.push(input.outputDirectory);
      await access(input.pdfPath);
      return { imagePath: join(input.outputDirectory, `${input.pageNumber}.png`), pageNumber: input.pageNumber };
    },
  };
  const engine: OcrEngine = {
    async recognize(input) {
      languages.push([...input.languages]);
      const confidence = input.pageNumber === 1 ? 1.5 : -0.5;
      return { confidence, pageNumber: input.pageNumber, text: `page ${input.pageNumber}` };
    },
  };

  try {
    const ocr = new LocalPdfOcr(rasterizer, engine, { temporaryRoot: root });
    const [first, second] = await Promise.all([
      ocr.recognize(Buffer.from('one'), [2, 1, 2]),
      ocr.recognize(Buffer.from('two'), [3]),
    ]);

    assert.equal(first.status, 'completed');
    assert.equal(second.status, 'completed');
    if (first.status === 'completed') {
      assert.deepEqual(first.pages.map((page) => page.pageNumber), [1, 2]);
      assert.deepEqual(first.pages.map((page) => page.confidence), [1, 0]);
      assert.equal(first.averageConfidence, 0.5);
    }
    assert.equal(new Set(directories).size, 2);
    assert.deepEqual(languages[0], ['ara', 'eng', 'swa']);
    for (const directory of new Set(directories)) await assert.rejects(() => access(directory));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('execFile runner bounds stdout and stderr without invoking a shell', async () => {
  for (const stream of ['stdout', 'stderr']) {
    await assert.rejects(
      () => new ExecFileCliRunner().run(
        process.execPath,
        ['-e', `process.${stream}.write("x".repeat(2048))`],
        { maxOutputBytes: 64, timeoutMs: 5_000 },
      ),
      (error: unknown) => error instanceof CliExecutionError && error.reason === 'output_limit',
    );
  }
});

test('execFile runner terminates commands at its configured timeout', async () => {
  await assert.rejects(
    () => new ExecFileCliRunner().run(
      process.execPath,
      ['-e', 'setInterval(() => undefined, 1000)'],
      { maxOutputBytes: 64, timeoutMs: 50 },
    ),
    (error: unknown) => error instanceof CliExecutionError && error.reason === 'timeout',
  );
});

test('local OCR classifies missing CLI tools and cleans its temporary directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'local-pdf-ocr-failure-test-'));
  let directory = '';
  const rasterizer: PageRasterizer = {
    async rasterize(input) {
      directory = input.outputDirectory;
      throw new CliExecutionError('tool_unavailable');
    },
  };
  const engine: OcrEngine = {
    async recognize() {
      throw new Error('not reached');
    },
  };

  try {
    const result = await new LocalPdfOcr(rasterizer, engine, { temporaryRoot: root })
      .recognize(Buffer.from('pdf'), [1]);
    assert.deepEqual(result, { pages: [], reason: 'tool_unavailable', status: 'unavailable' });
    await assert.rejects(() => access(directory));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('local OCR cleans raster output when its injected engine times out', async () => {
  const root = await mkdtemp(join(tmpdir(), 'local-pdf-ocr-engine-failure-test-'));
  let directory = '';
  const rasterizer: PageRasterizer = {
    async rasterize(input) {
      directory = input.outputDirectory;
      const imagePath = join(directory, 'page.png');
      await writeFile(imagePath, 'image');
      return { imagePath, pageNumber: input.pageNumber };
    },
  };
  const engine: OcrEngine = {
    async recognize() {
      throw new CliExecutionError('timeout');
    },
  };

  try {
    const result = await new LocalPdfOcr(rasterizer, engine, { temporaryRoot: root })
      .recognize(Buffer.from('pdf'), [1]);
    assert.deepEqual(result, { pages: [], reason: 'timeout', status: 'unavailable' });
    await assert.rejects(() => access(directory));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('pdftoppm rasterizer invokes its executable without a shell and enforces image size', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pdftoppm-test-'));
  const calls: Array<{ args: readonly string[]; executable: string }> = [];
  const runner: CliRunner = {
    async run(executable, args) {
      calls.push({ args, executable });
      await writeFile(`${args.at(-1)}.png`, Buffer.alloc(8));
      return { stderr: '', stdout: '' };
    },
  };

  try {
    const rasterizer = new PdftoppmRasterizer({
      dpi: 200,
      executable: 'custom-pdftoppm',
      maxImageBytes: 4,
    }, runner);
    await assert.rejects(
      () => rasterizer.rasterize({ outputDirectory: root, pageNumber: 7, pdfPath: 'source.pdf' }),
      (error: unknown) => error instanceof CliExecutionError && error.reason === 'output_limit',
    );
    assert.equal(calls[0]?.executable, 'custom-pdftoppm');
    assert.deepEqual(calls[0]?.args.slice(0, 9), [
      '-f', '7', '-l', '7', '-singlefile', '-png', '-r', '200', 'source.pdf',
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
