import type { AccessInvitationPage } from '../../shared/contracts/access-management.ts';
import type { AccessRepository } from './access-repository.ts';
import { parseAccessCursor, parseAccessLimit } from './access-pagination.ts';

export class InvitationListService {
  private readonly repository: AccessRepository;
  private readonly now: () => Date;

  constructor(
    repository: AccessRepository,
    now: () => Date,
  ) {
    this.repository = repository;
    this.now = now;
  }

  async list(cursor: unknown, limit: unknown): Promise<AccessInvitationPage> {
    const parsedCursor = parseAccessCursor(cursor);
    const parsedLimit = parseAccessLimit(limit);
    const invitations = await this.repository.listInvitations(
      parsedCursor,
      parsedLimit + 1,
      this.now().toISOString(),
    );
    const hasMore = invitations.length > parsedLimit;
    const items = invitations.slice(0, parsedLimit);
    return { items, nextCursor: hasMore ? items.at(-1)!.id : null };
  }
}
