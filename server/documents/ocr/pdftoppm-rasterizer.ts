import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { CliExecutionError, ExecFileCliRunner, type CliRunner } from './cli.ts';
import type { PageRasterizer, RasterizedPage, RasterizePageInput } from './types.ts';

export interface PdftoppmRasterizerOptions {
  dpi?: number;
  executable?: string;
  maxImageBytes?: number;
  maxOutputBytes?: number;
  timeoutMs?: number;
}

export class PdftoppmRasterizer implements PageRasterizer {
  private readonly dpi: number;
  private readonly executable: string;
  private readonly maxImageBytes: number;
  private readonly maxOutputBytes: number;
  private readonly runner: CliRunner;
  private readonly timeoutMs: number;

  constructor(options: PdftoppmRasterizerOptions = {}, runner: CliRunner = new ExecFileCliRunner()) {
    this.dpi = options.dpi ?? 300;
    this.executable = options.executable ?? 'pdftoppm';
    this.maxImageBytes = options.maxImageBytes ?? 50 * 1024 * 1024;
    this.maxOutputBytes = options.maxOutputBytes ?? 256 * 1024;
    this.runner = runner;
    this.timeoutMs = options.timeoutMs ?? 90_000;
  }

  async rasterize(input: RasterizePageInput): Promise<RasterizedPage> {
    const outputPrefix = join(input.outputDirectory, `page-${input.pageNumber}`);
    await this.runner.run(this.executable, [
      '-f', String(input.pageNumber),
      '-l', String(input.pageNumber),
      '-singlefile',
      '-png',
      '-r', String(this.dpi),
      input.pdfPath,
      outputPrefix,
    ], { maxOutputBytes: this.maxOutputBytes, timeoutMs: this.timeoutMs });

    const imagePath = `${outputPrefix}.png`;
    const image = await stat(imagePath).catch((error: unknown) => {
      throw new CliExecutionError('failed', { cause: error });
    });
    if (image.size > this.maxImageBytes) throw new CliExecutionError('output_limit');
    return { imagePath, pageNumber: input.pageNumber };
  }
}
