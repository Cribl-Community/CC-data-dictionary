import type { WorkerGroup, Source, Destination, RoutesConfig, Pipeline } from './types';

const getApiUrl = () => window.CRIBL_API_URL || 'http://localhost:9000/api/v1';

// The platform proxy hard-times-out at 30s; fail a bit earlier with a clear
// message so a single slow endpoint doesn't hang the whole load.
const REQUEST_TIMEOUT_MS = 25000;

async function apiFetch<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiUrl()}${path}`, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${path}`);
    }
    return res.json();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`Request timed out: ${path}`, { cause: e });
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
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

export interface CaptureParams {
  // Stage to capture at. 0=before pre-proc pipeline, 1=before routes,
  // 2=before post-proc pipeline, 3=before the destination.
  level: number;
  filter?: string;
  duration?: number;
  maxEvents?: number;
}

export type CapturedEvent = Record<string, unknown>;

// Live-tap captured events from a worker group. The endpoint streams NDJSON;
// we parse line-by-line and report progress via onProgress. The server closes
// the stream after `duration` seconds or `maxEvents`, whichever comes first.
export async function captureEvents(
  groupId: string,
  params: CaptureParams,
  onProgress?: (count: number) => void,
  signal?: AbortSignal
): Promise<CapturedEvent[]> {
  const res = await fetch(`${getApiUrl()}/m/${groupId}/system/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });
  if (res.status === 400) {
    throw new Error('No worker nodes are connected to this group, so there is nothing to capture.');
  }
  if (!res.ok || !res.body) {
    throw new Error(`Capture failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events: CapturedEvent[] = [];
  let buffer = '';

  const pushLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const obj = JSON.parse(trimmed);
      // Cribl capture lines are sometimes wrapped as { event: {...} }.
      const event = obj && typeof obj === 'object' && 'event' in obj ? obj.event : obj;
      events.push(event as CapturedEvent);
      onProgress?.(events.length);
    } catch {
      // Ignore keep-alive / non-JSON lines.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      pushLine(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  pushLine(buffer);

  return events;
}
