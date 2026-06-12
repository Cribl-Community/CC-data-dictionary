import type { Source, Destination, RouteEntry, Pipeline, DataPath, GroupDataDictionary, WorkerGroup } from './types';
import { fetchGroups, fetchSources, fetchDestinations, fetchRoutes, fetchPipelines } from './api';

function getRouteInputConstraint(route: RouteEntry): string | null {
  if (route.input) return route.input;

  if (route.filter) {
    const match = route.filter.match(/__inputId\s*={2,3}\s*['"]([^'"]+)['"]/);
    if (match) return match[1];
  }

  return null;
}

function sourceMatchesConstraint(source: Source, constraint: string): boolean {
  if (source.id === constraint) return true;
  const fullId = `${source.type}:${source.id}`;
  return fullId === constraint;
}

// Pull index / sourcetype qualifiers out of a route filter so we can describe
// which slice of a source's data flows through the route. Handles == and ===,
// single or double quotes, and multiple occurrences.
function extractFilterQualifiers(filter: string): string[] {
  const qualifiers: string[] = [];
  for (const field of ['index', 'sourcetype']) {
    const re = new RegExp(`\\b${field}\\s*={2,3}\\s*['"]([^'"]+)['"]`, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(filter)) !== null) {
      qualifiers.push(`${field}=${match[1]}`);
    }
  }
  return qualifiers;
}

// Build the data-type label from description + index/sourcetype qualifiers.
function deriveDataType(route: RouteEntry, fallback: string): string {
  const qualifiers = route.filter ? extractFilterQualifiers(route.filter) : [];

  // Description is the human-friendly base label when present.
  if (route.description) {
    return qualifiers.length ? `${route.description} (${qualifiers.join(', ')})` : route.description;
  }

  // No description: index/sourcetype qualifiers describe the data on their own.
  if (qualifiers.length) {
    return qualifiers.join(', ');
  }

  // Fall back to any remaining meaningful filter expression (minus __inputId).
  if (route.filter) {
    const stripped = route.filter
      .replace(/__inputId\s*={2,3}\s*['"][^'"]+['"]\s*&&\s*/, '')
      .replace(/\s*&&\s*__inputId\s*={2,3}\s*['"][^'"]+['"]/, '')
      .trim();

    if (stripped && stripped !== route.filter && stripped !== 'true' && stripped !== '1') {
      return stripped;
    }
  }

  return fallback;
}

// What to show in the source slot for a content/catch-all route (no __inputId).
function contentRouteSourceDisplay(route: RouteEntry): string {
  const qualifiers = route.filter ? extractFilterQualifiers(route.filter) : [];
  return qualifiers.length ? qualifiers.join(', ') : 'any source';
}

function buildDataPaths(
  sources: Source[],
  destinations: Destination[],
  routes: RouteEntry[],
  pipelines: Pipeline[]
): DataPath[] {
  const destMap = new Map(destinations.map(d => [d.id, d]));
  const pipelineMap = new Map(pipelines.map(p => [p.id, p]));
  const paths: DataPath[] = [];

  // Iterate routes (not sources). A route with an __inputId/input constraint is
  // source-specific and emits one entry per matching source. A route without one
  // is content-based (or catch-all) and emits a SINGLE entry, with the filter
  // qualifiers shown in the source slot — no cloning across every source.
  for (const route of routes) {
    if (route.disabled) continue;

    const dest = destMap.get(route.output);
    if (!dest) continue;

    const pipeline = route.pipeline ? pipelineMap.get(route.pipeline) : undefined;
    const inputConstraint = getRouteInputConstraint(route);

    if (inputConstraint) {
      // Source-specific: emit per matching source.
      for (const source of sources) {
        if (!sourceMatchesConstraint(source, inputConstraint)) continue;
        paths.push({
          source,
          sourceDisplay: `${source.type}:${source.id}`,
          destination: dest,
          route,
          pipeline,
          dataType: deriveDataType(route, `${source.type}:${source.id}`),
        });
      }
    } else {
      // Content / catch-all: a single entry not tied to any one source.
      paths.push({
        sourceDisplay: contentRouteSourceDisplay(route),
        destination: dest,
        route,
        pipeline,
        dataType: deriveDataType(route, contentRouteSourceDisplay(route)),
      });
    }
  }

  return paths;
}

export async function loadGroupDataDictionary(): Promise<GroupDataDictionary[]> {
  const groups = await fetchGroups();

  const results = await Promise.all(
    groups.map(async (group: WorkerGroup) => {
      const [sources, destinations, routesConfig, pipelines] = await Promise.all([
        fetchSources(group.id),
        fetchDestinations(group.id),
        fetchRoutes(group.id),
        fetchPipelines(group.id),
      ]);

      const dataPaths = buildDataPaths(sources, destinations, routesConfig.routes, pipelines);

      return {
        group,
        sources,
        destinations,
        routes: routesConfig.routes,
        pipelines,
        dataPaths,
      };
    })
  );

  return results;
}
