import type { CapturedEvent } from './api';

export type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

export interface FieldStat {
  name: string;
  // All types observed for this field across the sample, most-common first.
  types: FieldType[];
  // Fraction of events (0..1) in which this field was present.
  fillRate: number;
  // Number of events in which the field was present.
  count: number;
  // A representative non-empty example value, stringified for display.
  sample?: string;
  // True for Cribl-internal fields (names starting with "__").
  internal: boolean;
}

function valueType(value: unknown): FieldType {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'object') return t as FieldType;
  return 'string';
}

function stringifySample(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Analyze a sample of captured events into per-field statistics: which fields
 * appear, their observed type(s), fill rate across the sample, and an example
 * value. Fields are sorted by fill rate (descending), then name.
 */
export function analyzeFields(events: CapturedEvent[]): FieldStat[] {
  const total = events.length;
  if (total === 0) return [];

  interface Acc {
    count: number;
    typeCounts: Map<FieldType, number>;
    sample?: string;
  }
  const fields = new Map<string, Acc>();

  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    for (const [key, value] of Object.entries(event)) {
      let acc = fields.get(key);
      if (!acc) {
        acc = { count: 0, typeCounts: new Map() };
        fields.set(key, acc);
      }
      acc.count++;
      const t = valueType(value);
      acc.typeCounts.set(t, (acc.typeCounts.get(t) ?? 0) + 1);
      // Capture the first non-empty value we see as the representative sample.
      if (acc.sample === undefined) {
        const s = stringifySample(value);
        if (s !== '') acc.sample = s;
      }
    }
  }

  const stats: FieldStat[] = [];
  for (const [name, acc] of fields) {
    const types = Array.from(acc.typeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t);
    stats.push({
      name,
      types,
      fillRate: acc.count / total,
      count: acc.count,
      sample: acc.sample,
      internal: name.startsWith('__'),
    });
  }

  stats.sort((a, b) => b.fillRate - a.fillRate || a.name.localeCompare(b.name));
  return stats;
}
