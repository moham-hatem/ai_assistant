import { execFile } from 'node:child_process';

export interface CliRunOptions {
  maxOutputBytes: number;
  timeoutMs: number;
}

export interface CliRunResult {
  stderr: string;
  stdout: string;
}

export interface CliRunner {
  run(executable: string, args: readonly string[], options: CliRunOptions): Promise<CliRunResult>;
}

export type CliFailureReason = 'failed' | 'output_limit' | 'timeout' | 'tool_unavailable';

export class CliExecutionError extends Error {
  readonly reason: CliFailureReason;

  constructor(reason: CliFailureReason, options?: ErrorOptions) {
    super(`OCR command ${reason.replace('_', ' ')}.`, options);
    this.name = 'CliExecutionError';
    this.reason = reason;
  }
}

export class ExecFileCliRunner implements CliRunner {
  run(executable: string, args: readonly string[], options: CliRunOptions): Promise<CliRunResult> {
    return new Promise((resolve, reject) => {
      execFile(
        executable,
        [...args],
        {
          encoding: 'utf8',
          maxBuffer: options.maxOutputBytes,
          timeout: options.timeoutMs,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({ stderr, stdout });
            return;
          }

          reject(new CliExecutionError(classifyFailure(error), { cause: error }));
        },
      );
    });
  }
}

function classifyFailure(error: {
  code?: number | string;
  killed?: boolean;
  signal?: NodeJS.Signals;
}): CliFailureReason {
  if (error.code === 'ENOENT') return 'tool_unavailable';
  if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'output_limit';
  if (error.killed || error.signal === 'SIGTERM') return 'timeout';
  return 'failed';
}
