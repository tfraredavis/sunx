/** True when the bill's utility is Puget Sound Energy. */
export const isPse = (utility) => /puget sound energy|\bpse\b/i.test(utility || '');

// Default annual rate escalation (%) by utility until the utility database exists.
export const DEFAULT_Z = 5;
export const PSE_Z = 10;

export const defaultEscalation = (utility) => (isPse(utility) ? PSE_Z : DEFAULT_Z);
