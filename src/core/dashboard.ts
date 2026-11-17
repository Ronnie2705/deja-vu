// Aggregates the incident index into dashboard metrics. Pure: no Forge imports.
import { matchRunbook, type Runbook } from './runbook';
import { incidentText, type Incident } from './rank';

export interface DashboardIncident {
  key: string;
  summary: string;
  description?: string;
  service?: string;
  occurredAt?: string;
  resolverName?: string;
}

export interface DashboardData {
  totalIncidents: number;
  totalRunbooks: number;
  coveragePct: number; // % of incidents whose failure has a matching runbook
  coveredCount: number;
  uncoveredCount: number;
  byService: { service: string; covered: number; gap: number }[];
  gapsByService: { service: string; count: number; examples: string[] }[];
  topResponders: { name: string; resolved: number }[];
  byMonth: { month: string; count: number }[];
}

/** Turns the indexed incidents + runbooks into the numbers the dashboard renders. */
export function aggregateDashboard(incidents: DashboardIncident[], runbooks: Runbook[]): DashboardData {
  const hasRunbook = (i: DashboardIncident) =>
    runbooks.length > 0 && matchRunbook(incidentText(i as Incident), runbooks).confident;

  let coveredCount = 0;
  const svc = new Map<string, { covered: number; gap: number; examples: string[] }>();
  const resolvers = new Map<string, number>();
  const months = new Map<string, number>();

  for (const i of incidents) {
    const service = i.service ?? 'unknown';
    const covered = hasRunbook(i);
    if (covered) coveredCount++;

    const s = svc.get(service) ?? { covered: 0, gap: 0, examples: [] };
    if (covered) s.covered++;
    else {
      s.gap++;
      if (s.examples.length < 3) s.examples.push(i.summary);
    }
    svc.set(service, s);

    if (i.resolverName) resolvers.set(i.resolverName, (resolvers.get(i.resolverName) ?? 0) + 1);
    if (i.occurredAt) {
      const m = i.occurredAt.slice(0, 7); // YYYY-MM
      if (/^\d{4}-\d{2}$/.test(m)) months.set(m, (months.get(m) ?? 0) + 1);
    }
  }

  const byService = [...svc.entries()]
    .map(([service, v]) => ({ service, covered: v.covered, gap: v.gap }))
    .sort((a, b) => b.covered + b.gap - (a.covered + a.gap));

  const gapsByService = [...svc.entries()]
    .filter(([, v]) => v.gap > 0)
    .map(([service, v]) => ({ service, count: v.gap, examples: v.examples }))
    .sort((a, b) => b.count - a.count);

  const topResponders = [...resolvers.entries()]
    .map(([name, resolved]) => ({ name, resolved }))
    .sort((a, b) => b.resolved - a.resolved)
    .slice(0, 6);

  const byMonth = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, count]) => ({ month, count }));

  const total = incidents.length;
  return {
    totalIncidents: total,
    totalRunbooks: runbooks.length,
    coveragePct: total ? Math.round((coveredCount / total) * 100) : 0,
    coveredCount,
    uncoveredCount: total - coveredCount,
    byService,
    gapsByService,
    topResponders,
    byMonth,
  };
}
