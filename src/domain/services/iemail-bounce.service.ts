export interface EmailBounceEvent {
  event: string;
  email: string;
  reason?: string;
  messageId?: string;
  timestamp?: number;
  subject?: string;
  deliveryProvider: string;
}

export interface IEmailBounceService {
  handleBounce(event: EmailBounceEvent): Promise<void>;
}
