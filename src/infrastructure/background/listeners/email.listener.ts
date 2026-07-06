import configs from '../../../configs';
import * as nodemailer from 'nodemailer';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Globals } from '../../../core/globals';
import logger from '../../../core/utils/winston.util';
import fileUtil from '../../../core/utils/file.util';
import { SendEmailEvent } from '../../../domain/events';
import {
  TransactionalEmailsApi,
  SendSmtpEmail,
  TransactionalEmailsApiApiKeys,
} from '@getbrevo/brevo';

interface EmailAttachment {
  filename: string;
  path?: string;
  content?: string;
}

@Injectable()
export class EmailListener {
  private readonly transporter: nodemailer.Transporter;
  private readonly apiInstance: TransactionalEmailsApi | null;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: configs.smtp.host,
      port: +configs.smtp.port,
      secure: configs.smtp.secure,
      auth: {
        user: configs.smtp.user,
        pass: configs.smtp.password,
      },
    });
    console.log('THis is SMPT: ', configs.brevo);
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

  @OnEvent('email.send', { async: true })
  async handleSendEmail(event: SendEmailEvent): Promise<void> {
    const { from, to, subject, html, attachments } = event.data;

    logger.info(`Sending email`, {
      from: from ?? Globals.Email.DefaultFrom,
      to,
      subject,
    });

    try {
      await this.sendViaSMTP(from, to, subject, html, attachments);
      logger.info(`Email sent successfully`, { to, subject });
    } catch (error) {
      logger.error(
        'Failed to send email via SMTP, trying Brevo fallback:',
        error,
      );
      await this.sendViaBrevoAPI(to, subject, html, attachments);
    }
  }

  private async sendViaSMTP(
    from: string | undefined,
    to: string,
    subject: string,
    html: string,
    attachments: EmailAttachment[] | undefined,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: from ?? Globals.Email.DefaultFrom,
      to,
      subject,
      html,
      attachments: attachments || [],
    });
  }

  private async sendViaBrevoAPI(
    to: string,
    subject: string,
    html: string,
    attachments: EmailAttachment[] | undefined,
  ): Promise<void> {
    if (!this.apiInstance) {
      logger.error('Brevo API key not configured, cannot use fallback');
      throw new Error('Brevo API key not configured');
    }

    try {
      const sendSmtpEmail = new SendSmtpEmail();
      sendSmtpEmail.sender = Globals.Email.DefaultSender;
      sendSmtpEmail.to = [{ email: to }];
      sendSmtpEmail.subject = subject;
      sendSmtpEmail.htmlContent = html;

      if (attachments && attachments.length > 0) {
        sendSmtpEmail.attachment = await this.processAttachments(attachments);
      }

      await this.apiInstance.sendTransacEmail(sendSmtpEmail);

      logger.info(`Email sent successfully via Brevo fallback`, {
        to,
        subject,
      });
    } catch (brevoError) {
      logger.error('Failed to send email via Brevo fallback:', brevoError);
      throw brevoError;
    }
  }

  private async processAttachments(
    attachments: EmailAttachment[],
  ): Promise<Array<{ name: string; content: string }>> {
    const attachmentPromises = attachments.map(async (att) => {
      let content: string;

      if (att.path) {
        const fileBuffer = await fileUtil.readFileAsBufferAsync(att.path);
        content = fileBuffer.toString('base64');
      } else if (att.content) {
        content = Buffer.from(att.content).toString('base64');
      } else {
        throw new Error(
          `Attachment ${att.filename} must have either path or content`,
        );
      }

      return {
        name: att.filename,
        content: content,
      };
    });

    return Promise.all(attachmentPromises);
  }
}
