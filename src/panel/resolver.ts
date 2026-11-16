// Backend resolver for the Déjà Vu issue panel. Reuses the findSimilar action.
import Resolver from '@forge/resolver';
import { findSimilar } from '../actions';

const resolver = new Resolver();

resolver.define('getSummary', async (req) => {
  const ctx = req.context as {
    extension?: { issue?: { key?: string } };
    jira?: { issueKey?: string };
  } | undefined;
  const payload = req.payload as { issueKey?: string } | undefined;
  const issueKey = payload?.issueKey ?? ctx?.extension?.issue?.key ?? ctx?.jira?.issueKey;
  console.log('Déjà Vu panel: getSummary issueKey=', issueKey, 'contextKeys=', Object.keys(ctx ?? {}));
  if (!issueKey) return { error: 'No issue in context.' };
  return findSimilar({ issueKey });
});

export const handler = resolver.getDefinitions();
