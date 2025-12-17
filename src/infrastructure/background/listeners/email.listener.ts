import configs from "../../../configs";
import * as nodemailer from 'nodemailer';
import { TransactionalEmailsApi, SendSmtpEmail } from '@getbrevo/brevo';
import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { Globals } from "../../../core/globals";
import logger from "../../../core/utils/winston.util";
import fileUtil from "../../../core/utils/file.util";
import { SendEmailEvent } from "../../../domain/events";

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

    if (configs.brevo?.apiKey) {
      this.apiInstance = new TransactionalEmailsApi();
      (this.apiInstance as any).authentications = {
        apiKey: {
          apiKey: configs.brevo.apiKey
        }
      };
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
      await this.transporter.sendMail({
        from: from ?? Globals.Email.DefaultFrom,
        to,
        subject,
        html,
        attachments: attachments || [],
      });

      logger.info(`Email sent successfully`, { to, subject });
    } catch (error) {
      logger.error('Failed to send email via SMTP, trying Brevo fallback:', error);

      if (!this.apiInstance) {
        logger.error('Brevo API key not configured, cannot use fallback');
        throw error;
      }

      try {
        const sendSmtpEmail = new SendSmtpEmail();
        sendSmtpEmail.sender = { email: from ?? Globals.Email.DefaultFrom };
        sendSmtpEmail.to = [{ email: to }];
        sendSmtpEmail.subject = subject;
        sendSmtpEmail.htmlContent = html;

        if (attachments && attachments.length > 0) {
          const attachmentPromises = attachments.map(async (att) => {
            let content: string;

            if (att.path) {
              const fileBuffer = await fileUtil.readFileAsBufferAsync(att.path);
              content = fileBuffer.toString('base64');
            } else if (att.content) {
              content = Buffer.from(att.content).toString('base64');
            } else {
              throw new Error(`Attachment ${att.filename} must have either path or content`);
            }

            return {
              name: att.filename,
              content: content,
            };
          });

          sendSmtpEmail.attachment = await Promise.all(attachmentPromises);
        }

        await this.apiInstance.sendTransacEmail(sendSmtpEmail);

        logger.info(`Email sent successfully via Brevo fallback`, { to, subject });
      } catch (brevoError) {
        logger.error('Failed to send email via Brevo fallback:', brevoError);
        throw brevoError;
      }
    }
  }
}

