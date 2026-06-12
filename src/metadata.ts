const getApiUrl = () => window.CRIBL_API_URL || 'http://localhost:9000/api/v1';

export interface DataPathMetadata {
  owner?: string;
  criticality?: 'low' | 'medium' | 'high' | 'critical';
  notes?: string;
  dataSourceLabel?: string;
}

export type MetadataStore = Record<string, DataPathMetadata>;

const KV_PATH = '/kvstore/data-dictionary/metadata';

export function getPathKey(sourceId: string, routeId: string, destId: string): string {
  return `${sourceId}::${routeId}::${destId}`;
}

export async function loadMetadata(): Promise<MetadataStore> {
  try {
    const res = await fetch(`${getApiUrl()}${KV_PATH}`);
    if (res.status === 404) return {};
    if (!res.ok) throw new Error(`Failed to load metadata: ${res.status}`);
    return await res.json();
  } catch {
    return {};
  }
}

export async function saveMetadata(store: MetadataStore): Promise<void> {
  const res = await fetch(`${getApiUrl()}${KV_PATH}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(store),
  });
  if (!res.ok) throw new Error(`Failed to save metadata: ${res.status}`);
}
