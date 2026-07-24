export class BrevoWebhookEvent {
  event: string;
  email: string;
  'message-id'?: string;
  reason?: string;
  date?: string;
  ts?: number;
  subject?: string;
  sending_ip?: string;
}
