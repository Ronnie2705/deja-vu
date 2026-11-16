// The incident index lives under one Forge KVS key. Fine for a few hundred incidents
// (KVS values are size-limited, so split into pages before going much bigger).
import { kvs } from '@forge/kvs';
import type { Runbook } from '../core/runbook';
import type { Incident } from '../core/rank';

export interface IndexedIncident extends Incident {
  resolvedAt?: string;
  resolverAccountId?: string;
  resolverName?: string;
}

export interface IncidentIndex {
  builtAt: string;
  incidents: IndexedIncident[];
  runbooks: Runbook[];
}

const KEY = 'incident-index:v1';

export async function loadIndex(): Promise<IncidentIndex | undefined> {
  return kvs.get<IncidentIndex>(KEY);
}

export async function saveIndex(incidents: IndexedIncident[], runbooks: Runbook[] = []): Promise<IncidentIndex> {
  const index: IncidentIndex = { builtAt: new Date().toISOString(), incidents, runbooks };
  await kvs.set(KEY, index);
  return index;
}

/** Insert or replace one incident (or remove it when `incident` is null). */
export async function upsert(key: string, incident: IndexedIncident | null): Promise<void> {
  const current = (await loadIndex()) ?? { builtAt: new Date().toISOString(), incidents: [], runbooks: [] };
  const rest = current.incidents.filter((i) => i.key !== key);
  await saveIndex(incident ? [incident, ...rest] : rest, current.runbooks);
}
