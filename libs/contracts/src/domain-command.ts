export interface DomainCommand<TPayload = unknown> {
  commandId: string;
  commandType: string;
  occurredAt: string;
  correlationId: string;
  payload: TPayload;
}

export interface CommandReceipt {
  commandId: string;
  domain: string;
  accepted: boolean;
}
