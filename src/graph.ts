// Teamwork Graph integration: live cross-work context for an incident.
//
// Uses a *curated* query (no persisted-query registration needed) to ask the
// graph what else the incident's assignee is currently working on — real,
// already-ingested Atlassian data. Needs scopes read:graph:user:atlassian
// (start object) and read:graph:issue:jira (returned objects); a missing graph
// scope returns empty WITHOUT an error, so we log what comes back.
import api from '@forge/api';
import { getIncident } from './adapters/jira';

interface GraphPayload {
  issueKey?: string;
  context?: { jira?: { issueKey?: string } };
}

const ASSIGNED_WORK = `query dejavu_assignedWork($userId: ID!) {
  atlassianUserAssignedJiraWorkItems(userId: $userId, first: 15) {
    edges { node { ... on JiraWorkItem { key summary status { name } } } }
  }
}`;

export async function graphContext(payload: GraphPayload) {
  const issueKey = (payload.issueKey || payload.context?.jira?.issueKey || '').trim().toUpperCase();
  if (!issueKey) return { error: 'Give me an incident key (like PAY-45) to look up in the Teamwork Graph.' };

  const incident = await getIncident(issueKey);
  if (!incident) return { error: `I couldn't open ${issueKey}. Check the key and your access.` };
  if (!incident.resolverAccountId) {
    return { issueKey, assignee: null, viaTeamworkGraph: true, assignedWorkItems: [], message: `${issueKey} has no assignee, so there is no responder to look up in the Teamwork Graph.` };
  }

  const userId = `ari:cloud:identity::user/${incident.resolverAccountId}`;
  try {
    // Cast: requestTeamworkGraph isn't in every @forge/api type version.
    const client = api.asUser() as unknown as { requestTeamworkGraph: (q: string, v: unknown) => Promise<any> };
    const res = await client.requestTeamworkGraph(ASSIGNED_WORK, { userId });
    const body = res && typeof res.json === 'function' ? await res.json() : res;
    console.log(`[deja-vu graph] status=${res?.status ?? 'n/a'} body=${JSON.stringify(body).slice(0, 600)}`);

    if (body?.errors?.length) {
      return { issueKey, assignee: incident.resolverName ?? null, graphError: true, message: `Teamwork Graph error: ${body.errors[0]?.message ?? 'unknown'}.` };
    }

    const edges = body?.data?.atlassianUserAssignedJiraWorkItems?.edges ?? [];
    const items = edges
      .map((e: any) => ({ key: e?.node?.key ?? null, summary: e?.node?.summary ?? null, status: e?.node?.status?.name ?? null }))
      .filter((i: any) => i.summary && (i.key ?? '').toUpperCase() !== issueKey); // drop this incident itself

    return {
      issueKey,
      assignee: incident.resolverName ?? null,
      viaTeamworkGraph: true,
      assignedWorkItems: items,
      message: items.length
        ? `From the Teamwork Graph: ${incident.resolverName ?? 'the assignee'} currently has ${items.length} other assigned work item(s).`
        : `The Teamwork Graph shows no other open work assigned to ${incident.resolverName ?? 'the assignee'} right now.`,
    };
  } catch (e) {
    return { issueKey, graphError: true, message: `Couldn't reach the Teamwork Graph: ${(e as Error).message}` };
  }
}
