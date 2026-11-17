// Backend resolver for the Déjà Vu dashboard (Jira project page).
import Resolver from '@forge/resolver';
import { ensureIndex } from '../indexer';
import { aggregateDashboard } from '../core/dashboard';

const resolver = new Resolver();

resolver.define('getDashboard', async () => {
  const index = await ensureIndex();
  return aggregateDashboard(index.incidents, index.runbooks ?? []);
});

export const handler = resolver.getDefinitions();
