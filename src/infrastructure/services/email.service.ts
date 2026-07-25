import * as Handlebars from 'handlebars';
import * as nodemailer from 'nodemailer';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import configs from '../../configs';
import fileUtil from '../../core/utils/file.util';
import { Globals } from '../../core/globals';
import logger from '../../core/utils/winston.util';
import { IEmailService } from '../../domain/services/iemail.service';
import { SendEmailEvent } from '../../domain/events';
import {
  TransactionalEmailsApi,
  SendSmtpEmail,
  TransactionalEmailsApiApiKeys,
} from '@getbrevo/brevo';

@Injectable()
export class EmailService implements IEmailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly apiInstance: TransactionalEmailsApi | null;

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.transporter = nodemailer.createTransport({
      host: configs.smtp.host,
      port: +configs.smtp.port,
      secure: configs.smtp.secure,
      auth: {
        user: configs.smtp.user,
        pass: configs.smtp.password,
      },
    });

    if (configs.brevo?.apiKey) {
      this.apiInstance = new TransactionalEmailsApi();
      this.apiInstance.setApiKey(
        TransactionalEmailsApiApiKeys.apiKey,
        configs.brevo.apiKey,
      );
    } else {
      this.apiInstance = null;
    }
  }

  public async sendAsync(options: {
    from?: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    logger.info(
      `[EmailService] CHECKPOINT 4: Emitting email.send event to=${options.to} subject="${options.subject}"`,
    );

    const result = this.eventEmitter.emit(
      'email.send',
      new SendEmailEvent(options),
    );

    if (
      result &&
      typeof result === 'object' &&
      typeof (result as any).catch === 'function'
    ) {
      (result as Promise<void>).catch((error) => {
        logger.error(
          `[EmailService] CRITICAL: Async email delivery FAILED for to=${options.to} subject="${options.subject}"`,
          error,
        );
      });
    }
  }

  public async sendTemplatedAsync(options: {
    from?: string;
    to: string;
    subject: string;
    templatePath: string;
    context: Record<string, any>;
  }): Promise<void> {
    const { from, to, context, subject, templatePath } = options;
    const htmlTemplate = await fileUtil.readFileAsStringAsync(templatePath);
    const compiledTemplate = Handlebars.compile(htmlTemplate);
    const html = compiledTemplate(context);

    await this.sendAsync({ from, to, subject, html });
  }

  public async sendTemplatedSync(options: {
    from?: string;
    to: string;
    subject: string;
    templatePath: string;
    context: Record<string, any>;
  }): Promise<void> {
    const { from, to, context, subject, templatePath } = options;
    const htmlTemplate = await fileUtil.readFileAsStringAsync(templatePath);
    const compiledTemplate = Handlebars.compile(htmlTemplate);
    const html = compiledTemplate(context);

    await this.dispatchEmail(to, subject, html, from);
  }

  public async dispatchEmail(
    to: string,
    subject: string,
    html: string,
    from?: string,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: from ?? Globals.Email.DefaultFrom,
        to,
        subject,
        html,
      });
      logger.info(`Email sent successfully via SMTP`, { to, subject });
    } catch (error) {
      logger.error(
        'Failed to send email via SMTP, trying Brevo fallback:',
        error,
      );
      await this.sendViaBrevoAPI(to, subject, html);
    }
  }

  private async sendViaBrevoAPI(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    if (!this.apiInstance) {
      logger.error('Brevo API key not configured, cannot use fallback');
      throw new Error('Brevo API key not configured');
    }

    const sendSmtpEmail = new SendSmtpEmail();
    sendSmtpEmail.sender = Globals.Email.DefaultSender;
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;

    await this.apiInstance.sendTransacEmail(sendSmtpEmail);
    logger.info(`Email sent successfully via Brevo fallback`, { to, subject });
  }
}
