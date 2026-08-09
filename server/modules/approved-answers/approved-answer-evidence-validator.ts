import type { Evidence } from '../../domain.ts';
import type { PublishedEvidenceSource } from '../../knowledge/published-evidence-source.ts';

export interface ApprovedAnswerEvidenceValidation {
  evidence: Evidence[];
  valid: boolean;
}
export interface ApprovedAnswerEvidenceValidator {
  validate(evidenceReferences: readonly string[]): Promise<ApprovedAnswerEvidenceValidation>;
}

export class PublishedApprovedAnswerEvidenceValidator implements ApprovedAnswerEvidenceValidator {
  private readonly source: PublishedEvidenceSource;

  constructor(source: PublishedEvidenceSource) {
    this.source = source;
  }

  async validate(evidenceReferences: readonly string[]): Promise<ApprovedAnswerEvidenceValidation> {
    if (evidenceReferences.length === 0) return { evidence: [], valid: false };

    const published = await this.source.load();
    const byId = new Map(published.chunks.map((item) => [item.id, item]));
    const evidence = evidenceReferences.flatMap((reference) => {
      const item = byId.get(reference);
      return item ? [{ ...item }] : [];
    });
    return {
      evidence,
      valid: evidence.length === evidenceReferences.length,
    };
  }
}
