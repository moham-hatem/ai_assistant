import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
const encoder = new TextEncoder();

export interface ScryptParameters {
  blockSize: number;
  cost: number;
  keyLength: number;
  maxMemory: number;
  parallelization: number;
  saltBytes: number;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, encodedHash: string): Promise<boolean>;
}

export const DEFAULT_SCRYPT_PARAMETERS: Readonly<ScryptParameters> = {
  blockSize: 8,
  cost: 131_072,
  keyLength: 64,
  maxMemory: 256 * 1024 * 1024,
  parallelization: 1,
  saltBytes: 16,
};

export const PASSWORD_LIMITS = { minUtf8Bytes: 12, maxUtf8Bytes: 1_024 } as const;

export class PasswordPolicyError extends Error {}

export class ScryptPasswordHasher implements PasswordHasher {
  private readonly parameters: ScryptParameters;

  constructor(parameters: Partial<ScryptParameters> = {}) {
    this.parameters = { ...DEFAULT_SCRYPT_PARAMETERS, ...parameters };
    validateParameters(this.parameters);
  }

  async hash(password: string): Promise<string> {
    validatePassword(password);
    const salt = randomBytes(this.parameters.saltBytes);
    const derived = await derive(password, salt, this.parameters);
    const logCost = Math.log2(this.parameters.cost);
    return [
      'scrypt',
      'v=1',
      `ln=${logCost},r=${this.parameters.blockSize},p=${this.parameters.parallelization}`,
      salt.toString('base64url'),
      derived.toString('base64url'),
    ].join('$');
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    if (!passwordWithinVerificationLimits(password)) return false;
    const parsed = parseHash(encodedHash);
    if (!parsed) return false;
    try {
      const actual = await derive(password, parsed.salt, {
        blockSize: parsed.blockSize,
        cost: parsed.cost,
        keyLength: parsed.expected.length,
        maxMemory: Math.max(
          DEFAULT_SCRYPT_PARAMETERS.maxMemory,
          128 * parsed.cost * parsed.blockSize + 1024 * 1024,
        ),
        parallelization: parsed.parallelization,
        saltBytes: parsed.salt.length,
      });
      return actual.length === parsed.expected.length
        && timingSafeEqual(actual, parsed.expected);
    } catch {
      return false;
    }
  }
}

async function derive(
  password: string,
  salt: Buffer,
  parameters: ScryptParameters,
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, parameters.keyLength, {
      N: parameters.cost,
      maxmem: parameters.maxMemory,
      p: parameters.parallelization,
      r: parameters.blockSize,
    }, (error, derivedKey) => error ? reject(error) : resolve(derivedKey));
  });
}

function validatePassword(password: string): void {
  const length = encoder.encode(password).length;
  if (length < PASSWORD_LIMITS.minUtf8Bytes || length > PASSWORD_LIMITS.maxUtf8Bytes) {
    throw new PasswordPolicyError(
      `Password must be ${PASSWORD_LIMITS.minUtf8Bytes}-${PASSWORD_LIMITS.maxUtf8Bytes} UTF-8 bytes.`,
    );
  }
}

function passwordWithinVerificationLimits(password: string): boolean {
  const length = encoder.encode(password).length;
  return length > 0 && length <= PASSWORD_LIMITS.maxUtf8Bytes;
}

function validateParameters(parameters: ScryptParameters): void {
  if (!Number.isSafeInteger(parameters.cost) || parameters.cost < 2 ||
      (parameters.cost & (parameters.cost - 1)) !== 0) {
    throw new Error('scrypt cost must be a power of two.');
  }
  for (const value of [parameters.blockSize, parameters.parallelization, parameters.keyLength]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid scrypt parameters.');
  }
  if (!Number.isSafeInteger(parameters.saltBytes) || parameters.saltBytes < 16) {
    throw new Error('scrypt salts must contain at least 16 bytes.');
  }
  const requiredMemory = 128 * parameters.cost * parameters.blockSize;
  if (parameters.maxMemory <= requiredMemory) throw new Error('scrypt maxMemory is too small.');
}

function parseHash(value: string): {
  blockSize: number;
  cost: number;
  expected: Buffer;
  parallelization: number;
  salt: Buffer;
} | undefined {
  const match = /^scrypt\$v=1\$ln=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(value);
  if (!match) return undefined;
  const logCost = Number(match[1]);
  const blockSize = Number(match[2]);
  const parallelization = Number(match[3]);
  if (!Number.isSafeInteger(logCost) || logCost < 1 || logCost > 17 ||
      !Number.isSafeInteger(blockSize) || blockSize < 1 || blockSize > 8 ||
      !Number.isSafeInteger(parallelization) || parallelization < 1 || parallelization > 4) {
    return undefined;
  }
  const salt = Buffer.from(match[4], 'base64url');
  const expected = Buffer.from(match[5], 'base64url');
  if (salt.length < 16 || expected.length < 32 || expected.length > 128) return undefined;
  return { blockSize, cost: 2 ** logCost, expected, parallelization, salt };
}
