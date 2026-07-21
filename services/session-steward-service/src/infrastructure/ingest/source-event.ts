export type SourceEvent = Record<string, unknown>;

export const asRecord = (value: unknown): SourceEvent | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as SourceEvent)
    : undefined;

export const requiredString = (event: SourceEvent, ...keys: string[]): string => {
  const value = optionalString(event, ...keys);
  if (!value) throw new Error(`Missing required field: ${keys.join(' or ')}`);
  return value;
};

export const optionalString = (event: SourceEvent, ...keys: string[]): string | undefined => {
  const value = keys.map((key) => event[key]).find((item) => typeof item === 'string');
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export const requiredTimestamp = (event: SourceEvent, ...keys: string[]): string => {
  const value = requiredString(event, ...keys);
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${keys.join(' or ')} must be an ISO-8601 timestamp`);
  }
  return value;
};

export const sourcePayload = (event: SourceEvent): SourceEvent =>
  asRecord(event.payload) ?? event;

export const parseSourceEvent = (value: unknown): SourceEvent => {
  const event = asRecord(value);
  if (!event) throw new Error('NATS message must contain a JSON object');
  return event;
};
