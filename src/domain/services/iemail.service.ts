export interface IEmailService {
  /**
   * Sends a plain HTML email (no template rendering) via event emitter (fire-and-forget).
   */
  sendAsync(options: {
    from?: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<void>;

  /**
   * Sends an email using a pre-defined template and dynamic context (fire-and-forget).
   */
  sendTemplatedAsync(options: {
    from?: string;
    to: string;
    subject: string;
    templatePath: string;
    context: Record<string, any>;
  }): Promise<void>;

  /**
   * Sends an email using a pre-defined template synchronously.
   * Throws on failure — use for critical emails where delivery must be confirmed.
   */
  sendTemplatedSync(options: {
    from?: string;
    to: string;
    subject: string;
    templatePath: string;
    context: Record<string, any>;
  }): Promise<void>;
}
