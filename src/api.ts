import type { WorkerGroup, Source, Destination, RoutesConfig, Pipeline } from './types';

const getApiUrl = () => window.CRIBL_API_URL || 'http://localhost:9000/api/v1';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${path}`);
  }
  return res.json();
}

export async function fetchGroups(): Promise<WorkerGroup[]> {
  const data = await apiFetch<{ items: WorkerGroup[] }>('/master/groups');
  return data.items;
}

export async function fetchSources(groupId: string): Promise<Source[]> {
  const data = await apiFetch<{ items: Source[] }>(`/m/${groupId}/system/inputs`);
  return data.items;
}

export async function fetchDestinations(groupId: string): Promise<Destination[]> {
  const data = await apiFetch<{ items: Destination[] }>(`/m/${groupId}/system/outputs`);
  return data.items;
}

export async function fetchRoutes(groupId: string): Promise<RoutesConfig> {
  const data = await apiFetch<{ items: RoutesConfig[] }>(`/m/${groupId}/routes`);
  return data.items?.[0] ?? { routes: [] };
}

export async function fetchPipelines(groupId: string): Promise<Pipeline[]> {
  const data = await apiFetch<{ items: Pipeline[] }>(`/m/${groupId}/pipelines`);
  return data.items;
}
