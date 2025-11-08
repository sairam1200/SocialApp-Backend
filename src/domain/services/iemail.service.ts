export interface IEmailService {
  /**
   * Sends a plain HTML email (no template rendering).
   */
  sendAsync(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<void>;

  /**
   * Sends an email using a pre-defined template and dynamic context.
   */
  sendTemplatedAsync(options: {
    from?: string;
    to: string;
    subject: string;
    templatePath: string;
    context: Record<string, any>;
  }): Promise<void>;
}