import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AnswerEvidence } from './model-provider.ts';

interface KnowledgeSearchRow {
  chunk_id: number;
  content: string;
}

export class KnowledgeRepository {
  private readonly client: SupabaseClient;
  private readonly matchCount: number;

  constructor(options: {
    matchCount: number;
    serviceRoleKey: string;
    supabaseUrl: string;
  }) {
    this.client = createClient(options.supabaseUrl, options.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.matchCount = options.matchCount;
  }

  async search(question: string): Promise<AnswerEvidence[]> {
    const { data, error } = await this.client.rpc('search_published_knowledge', {
      search_text: question,
      match_count: this.matchCount,
    });

    if (error) {
      throw new Error(`Knowledge search failed: ${error.message}`);
    }

    return ((data ?? []) as KnowledgeSearchRow[]).map((row) => ({
      id: String(row.chunk_id),
      content: row.content,
    }));
  }
}
