import type { Evidence } from '../domain.ts';

interface ChunkLocation {
  file: string;
  index: number;
}

export function expandWithNeighborEvidence(
  allEvidence: Evidence[],
  rankedEvidence: Evidence[],
  limit: number,
): Evidence[] {
  if (rankedEvidence.length === 0 || limit <= 0) return [];

  const locations = new Map(
    allEvidence.flatMap((item) => {
      const location = parseChunkLocation(item.id);
      return location ? [[locationKey(location.file, location.index), item] as const] : [];
    }),
  );
  const seedCount = Math.max(1, Math.min(rankedEvidence.length, Math.floor(limit / 3) || 1));
  const seeds = rankedEvidence.slice(0, seedCount);
  const selected: Evidence[] = [];
  const seen = new Set<string>();

  const add = (item: Evidence | undefined) => {
    if (!item || selected.length >= limit || seen.has(item.id)) return;
    seen.add(item.id);
    selected.push(item);
  };

  seeds.forEach(add);
  for (let distance = 1; distance <= 2 && selected.length < limit; distance += 1) {
    for (const seed of seeds) add(neighbor(seed, distance, locations));
  }
  for (let distance = 1; distance <= 2 && selected.length < limit; distance += 1) {
    for (const seed of seeds) add(neighbor(seed, -distance, locations));
  }
  rankedEvidence.forEach(add);

  return orderDocumentChunks(selected);
}

function neighbor(
  evidence: Evidence,
  offset: number,
  locations: Map<string, Evidence>,
): Evidence | undefined {
  const location = parseChunkLocation(evidence.id);
  return location
    ? locations.get(locationKey(location.file, location.index + offset))
    : undefined;
}

function parseChunkLocation(id: string): ChunkLocation | undefined {
  const match = id.match(/^(.*):(\d+)$/u);
  return match ? { file: match[1], index: Number(match[2]) } : undefined;
}

function locationKey(file: string, index: number): string {
  return `${file}:${index}`;
}

function orderDocumentChunks(items: Evidence[]): Evidence[] {
  const position = new Map(items.map((item, index) => [item.id, index]));
  return [...items].sort((first, second) => {
    const firstLocation = parseChunkLocation(first.id);
    const secondLocation = parseChunkLocation(second.id);
    if (firstLocation?.file === secondLocation?.file) {
      return firstLocation.index - secondLocation.index;
    }
    return (position.get(first.id) ?? 0) - (position.get(second.id) ?? 0);
  });
}
