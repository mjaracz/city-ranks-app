export interface DomainEvent<TPayload = unknown> {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  occurredAt: string;
  correlationId: string;
  causationId?: string;
  payload: TPayload;
}
