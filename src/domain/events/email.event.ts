export class SendEmailEvent {
  constructor(
    public readonly data: {
      from?: string;
      to: string;
      subject: string;
      html: string;
      attachments?: {
        filename: string;
        path?: string;
        content?: any;
        contentType?: string;
      }[];
    },
  ) {}
}
