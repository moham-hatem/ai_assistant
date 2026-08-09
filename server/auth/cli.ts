import { stdin as input, stdout as output } from 'node:process';
import { pathToFileURL } from 'node:url';
import type { AuthRole } from '../../shared/contracts/auth.ts';
import {
  isAuthRole,
  normalizeDisplayName,
  normalizeRoles,
  toPrincipal,
} from './domain.ts';
import { ScryptPasswordHasher, type PasswordHasher } from './password.ts';
import type { AuthRepository } from './repository.ts';
import { newAuthUserId, normalizeEmail } from './service.ts';
import { SqliteAuthRepository } from './sqlite-repository.ts';

export interface AuthUserCliOptions {
  databasePath: string;
  displayName: string;
  email: string;
  roles: AuthRole[];
}

export async function upsertLocalAuthUser(
  repository: AuthRepository,
  passwords: PasswordHasher,
  options: Omit<AuthUserCliOptions, 'databasePath'>,
  password: string,
  now = new Date(),
): Promise<{ action: 'created' | 'updated'; principal: ReturnType<typeof toPrincipal> }> {
  const email = normalizeEmail(options.email);
  const displayName = normalizeDisplayName(options.displayName);
  if (!email) throw new Error('A valid --email is required.');
  if (!displayName) throw new Error('A non-empty valid --display-name is required.');
  const passwordHash = await passwords.hash(password);
  const existing = await repository.findUserByEmail(email);
  const command = {
    displayName,
    email,
    id: existing?.id ?? newAuthUserId(),
    passwordHash,
    roles: normalizeRoles(options.roles),
    timestamp: now.toISOString(),
  };
  const user = existing
    ? await repository.updateUserSecurity(command)
    : await repository.createUser(command);
  return { action: existing ? 'updated' : 'created', principal: toPrincipal(user) };
}

export function parseAuthUserCliOptions(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): AuthUserCliOptions {
  let email: string | undefined;
  let displayName: string | undefined;
  let rolesValue: string | undefined;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--email') email = arguments_[++index];
    else if (argument === '--display-name') displayName = arguments_[++index];
    else if (argument === '--roles') rolesValue = arguments_[++index];
    else throw new Error(`Unknown argument: ${argument}. Password arguments are intentionally unsupported.`);
  }
  const normalizedDisplayName = normalizeDisplayName(displayName);
  if (!email || !normalizedDisplayName || !rolesValue) {
    throw new Error(
      'Usage: npm run auth:user -- --email user@example.org --display-name "Local Reviewer" --roles reviewer,operator',
    );
  }
  const rawRoles = rolesValue.split(',').map((role) => role.trim()).filter(Boolean);
  if (rawRoles.length === 0 || !rawRoles.every(isAuthRole)) {
    throw new Error('Roles must be a comma-separated subset of reviewer,content_manager,operator,admin.');
  }
  return {
    databasePath: environment.AUTH_DATABASE_PATH ?? 'data/auth.sqlite',
    displayName: normalizedDisplayName,
    email,
    roles: normalizeRoles(rawRoles as AuthRole[]),
  };
}

async function readPassword(environment: NodeJS.ProcessEnv): Promise<string> {
  if (environment.AUTH_BOOTSTRAP_PASSWORD !== undefined) {
    process.stderr.write(
      'Warning: environment variables may be exposed by process tooling; piped stdin is preferred.\n',
    );
    return environment.AUTH_BOOTSTRAP_PASSWORD;
  }
  if (input.isTTY) {
    throw new Error(
      'Refusing a visible password prompt. Pipe the password on stdin or set AUTH_BOOTSTRAP_PASSWORD.',
    );
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 2_048) throw new Error('Password input is too large.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/u, '');
}

async function main(): Promise<void> {
  const options = parseAuthUserCliOptions(process.argv.slice(2));
  const password = await readPassword(process.env);
  const repository = new SqliteAuthRepository(options.databasePath);
  try {
    const result = await upsertLocalAuthUser(
      repository,
      new ScryptPasswordHasher(),
      options,
      password,
    );
    output.write(`${result.action} local auth user ${result.principal.email} with roles: ${result.principal.roles.join(', ')}\n`);
  } finally {
    repository.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    process.stderr.write(`Auth user command failed: ${message}\n`);
    process.exitCode = 1;
  });
}
