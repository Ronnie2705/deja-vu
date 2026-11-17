// Reads runbook pages from a Confluence space. All Confluence calls go through here.
import api, { route } from '@forge/api';
import { RUNBOOK_SPACE_KEY } from '../config';
import type { Runbook } from '../core/runbook';

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function findSpaceId(): Promise<{ id: string; base?: string } | null> {
  // Preferred: the configured key.
  const byKey = await api.asApp().requestConfluence(route`/wiki/api/v2/spaces?keys=${RUNBOOK_SPACE_KEY}`, {
    headers: { Accept: 'application/json' },
  });
  if (byKey.ok) {
    const data = (await byKey.json()) as { results?: { id: string }[]; _links?: { base?: string } };
    if (data.results?.[0]) return { id: data.results[0].id, base: data._links?.base };
  }
  // Fallback: any space whose name mentions "runbook".
  const all = await api.asApp().requestConfluence(route`/wiki/api/v2/spaces?limit=250`, { headers: { Accept: 'application/json' } });
  if (!all.ok) return null;
  const data = (await all.json()) as { results?: { id: string; name: string }[]; _links?: { base?: string } };
  const match = data.results?.find((s) => /runbook/i.test(s.name));
  return match ? { id: match.id, base: data._links?.base } : null;
}

/** Creates a runbook page in the runbook space. Returns the new page's url, or a reason it failed. */
export async function createRunbookPage(
  title: string,
  storageHtml: string,
): Promise<{ ok: true; id: string; url?: string } | { ok: false; reason: string }> {
  const space = await findSpaceId();
  if (!space) return { ok: false, reason: 'no runbook space found — create a space keyed RUN or named "Runbooks".' };
  const res = await api.asApp().requestConfluence(route`/wiki/api/v2/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      spaceId: space.id,
      status: 'current',
      title,
      body: { representation: 'storage', value: storageHtml },
    }),
  });
  if (!res.ok) {
    // 400/409 usually means a page with this title already exists in the space.
    const conflict = res.status === 400 || res.status === 409;
    return { ok: false, reason: conflict ? `a page titled "${title}" already exists in the runbook space.` : `Confluence returned ${res.status}.` };
  }
  const data = (await res.json()) as { id: string; _links?: { webui?: string; base?: string } };
  const base = data._links?.base ?? space.base;
  return { ok: true, id: String(data.id), url: base && data._links?.webui ? base + data._links.webui : undefined };
}

export async function fetchRunbooks(): Promise<Runbook[]> {
  const space = await findSpaceId();
  if (!space) return [];
  const res = await api.asApp().requestConfluence(
    route`/wiki/api/v2/pages?space-id=${space.id}&body-format=storage&limit=100`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: { id: string; title: string; body?: { storage?: { value?: string } }; _links?: { webui?: string } }[];
    _links?: { base?: string };
  };
  const base = data._links?.base ?? space.base;
  return (data.results ?? []).map((p) => ({
    id: String(p.id),
    title: p.title,
    url: base && p._links?.webui ? base + p._links.webui : undefined,
    text: `${p.title} ${stripHtml(p.body?.storage?.value ?? '')}`,
  }));
}
