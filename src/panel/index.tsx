// Déjà Vu issue panel (UI Kit). Shows incident memory directly on the incident.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Text,
  Heading,
  Stack,
  Inline,
  Lozenge,
  Link,
  SectionMessage,
  Spinner,
  Strong,
  Em,
} from '@forge/react';
import { invoke } from '@forge/bridge';

interface Match {
  key: string;
  summary: string;
  happened: string;
  resolvedBy: string | null;
  resolution: string | null;
  score: number;
}
interface Summary {
  error?: string;
  noStrongMatch?: boolean;
  message?: string;
  seenBefore?: number;
  mostRecent?: { key: string; happened: string };
  runbook?: { found: boolean; missing?: boolean; title?: string; url?: string | null } | null;
  whoFixedIt?: { name: string; resolved: number }[];
  matches?: Match[];
}

const App = () => {
  const [state, setState] = useState<{ loading: boolean; data?: Summary; error?: string }>({ loading: true });

  useEffect(() => {
    // The resolver reads the issue key from its own context, so we invoke with an empty payload.
    invoke('getSummary', {})
      .then((data) => setState({ loading: false, data: data as Summary }))
      .catch((e) => setState({ loading: false, error: String(e) }));
  }, []);

  if (state.loading) return <Spinner label="Checking incident history…" />;
  if (state.error) {
    return (
      <SectionMessage appearance="warning">
        <Text>Couldn't load Déjà Vu: {state.error}</Text>
      </SectionMessage>
    );
  }

  const d = state.data;
  if (!d || d.error) {
    return (
      <SectionMessage appearance="warning">
        <Text>{d?.error ?? 'Could not load Déjà Vu.'}</Text>
      </SectionMessage>
    );
  }
  if (d.noStrongMatch) {
    return (
      <SectionMessage title="No similar incidents" appearance="information">
        <Text>{d.message}</Text>
      </SectionMessage>
    );
  }

  return (
    <Stack space="space.150">
      <Heading size="medium">Seen {d.seenBefore}× before</Heading>
      {d.mostRecent && (
        <Text>
          Most recent: <Strong>{d.mostRecent.key}</Strong> on {d.mostRecent.happened}
        </Text>
      )}

      {d.runbook?.found && (
        <Inline space="space.075" alignBlock="center">
          <Lozenge appearance="success">Runbook</Lozenge>
          {d.runbook.url ? (
            <Link href={d.runbook.url} openNewTab>
              {d.runbook.title}
            </Link>
          ) : (
            <Text>{d.runbook.title}</Text>
          )}
        </Inline>
      )}
      {d.runbook?.missing && (
        <SectionMessage title="No runbook" appearance="warning">
          <Text>This recurring failure has no runbook yet — worth writing one.</Text>
        </SectionMessage>
      )}

      {d.whoFixedIt && d.whoFixedIt.length > 0 && (
        <Text>
          <Strong>Who fixes this:</Strong> {d.whoFixedIt.map((e) => `${e.name} (${e.resolved})`).join(', ')}
        </Text>
      )}

      <Heading size="small">Similar incidents</Heading>
      <Stack space="space.100">
        {(d.matches ?? []).map((m) => (
          <Stack key={m.key} space="space.025">
            <Inline space="space.075" alignBlock="center">
              <Strong>{m.key}</Strong>
              <Lozenge>score {m.score}</Lozenge>
            </Inline>
            <Text>{m.summary}</Text>
            {m.resolution && (
              <Text>
                <Em>Fix:</Em> {m.resolution}
              </Text>
            )}
            <Text>
              — {m.resolvedBy ?? 'unknown'}, {m.happened}
            </Text>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
