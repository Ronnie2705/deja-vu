// Project-level settings for Déjà Vu. Change these if your project or field names differ.
export const PROJECT_KEY = 'PAY';
export const INCIDENT_TYPE = '[System] Incident';
export const INCIDENT_START_FIELD_NAME = 'Incident start';
/** Internal comments starting with this prefix are treated as the resolution note. */
export const RESOLUTION_PREFIX = 'Resolution:';
/** Confluence space holding the runbooks. Falls back to any space named "…Runbook…". */
export const RUNBOOK_SPACE_KEY = 'RUN';
/** A failure seen at least this many times is "recurring" — a missing runbook is then worth flagging. */
export const RECURRING_THRESHOLD = 3;
