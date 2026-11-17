// Déjà Vu dashboard — a runbook-coverage command center for incident leads.
// UI Kit (native). Requires @forge/react >= 11.2.0 for the chart components.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Heading,
  Text,
  Strong,
  Stack,
  Inline,
  Lozenge,
  Spinner,
  SectionMessage,
  BarChart,
} from '@forge/react';
import { invoke } from '@forge/bridge';

interface DashboardData {
  totalIncidents: number;
  totalRunbooks: number;
  coveragePct: number;
  coveredCount: number;
  uncoveredCount: number;
  byService: { service: string; covered: number; gap: number }[];
  gapsByService: { service: string; count: number; examples: string[] }[];
  topResponders: { name: string; resolved: number }[];
  byMonth: { month: string; count: number }[];
}

const STATUS_COLORS = [
  { key: 'Covered', value: '#36B37E' },
  { key: 'Gap', value: '#FF5630' },
];

const Stat = ({ value, label }: { value: string | number; label: string }) => (
  <Stack space="space.0" alignInline="start">
    <Heading as="h1">{String(value)}</Heading>
    <Text>{label}</Text>
  </Stack>
);

const App = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    invoke('getDashboard')
      .then((d) => setData(d as unknown as DashboardData))
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <SectionMessage title="Couldn't load the dashboard" appearance="error">
        <Text>Try rebuilding the Déjà Vu index from the agent, then reload.</Text>
      </SectionMessage>
    );
  }
  if (!data) return <Spinner label="Loading Déjà Vu dashboard…" size="large" />;

  // Covered vs gap, one row per (service, status) for a colored grouped bar chart.
  const coverageRows = data.byService.flatMap((s) => [
    { service: s.service, count: s.covered, status: 'Covered' },
    { service: s.service, count: s.gap, status: 'Gap' },
  ]);

  return (
    <Stack space="space.400">
      <Stack space="space.100">
        <Heading as="h1">Déjà Vu — Runbook Coverage</Heading>
        <Text>
          Which recurring failures are covered by a runbook — and which gaps still need one. Built live from{' '}
          <Strong>{data.totalIncidents}</Strong> resolved incidents.
        </Text>
      </Stack>

      <Inline space="space.600" shouldWrap>
        <Stat value={`${data.coveragePct}%`} label="Runbook coverage" />
        <Stat value={data.totalIncidents} label="Incidents in memory" />
        <Stat value={data.totalRunbooks} label="Runbooks indexed" />
        <Stat value={data.uncoveredCount} label="Uncovered incidents" />
      </Inline>

      <Stack space="space.200">
        <Heading as="h3">Coverage by service</Heading>
        <Text>Green is covered by a runbook; red is a gap.</Text>
        <BarChart
          data={coverageRows}
          xAccessor="service"
          yAccessor="count"
          colorAccessor="status"
          colorPalette={STATUS_COLORS}
        />
      </Stack>

      <Stack space="space.200">
        <Heading as="h3">Runbook gaps — these recurring failures have no runbook</Heading>
        {data.gapsByService.length === 0 ? (
          <SectionMessage appearance="success" title="Full coverage">
            <Text>Every indexed incident has a matching runbook. 🎉</Text>
          </SectionMessage>
        ) : (
          <Stack space="space.150">
            {data.gapsByService.map((g) => (
              <Inline key={g.service} space="space.150" alignBlock="center" shouldWrap>
                <Lozenge appearance="removed">{g.count} uncovered</Lozenge>
                <Text>
                  <Strong>{g.service}</Strong> — e.g. {g.examples.join('; ')}
                </Text>
              </Inline>
            ))}
          </Stack>
        )}
      </Stack>

      <Inline space="space.600" shouldWrap alignBlock="start">
        <Stack space="space.200">
          <Heading as="h3">Top responders</Heading>
          <BarChart data={data.topResponders} xAccessor="name" yAccessor="resolved" />
        </Stack>
        <Stack space="space.200">
          <Heading as="h3">Incidents by month</Heading>
          <BarChart data={data.byMonth} xAccessor="month" yAccessor="count" />
        </Stack>
      </Inline>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
