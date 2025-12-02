import configs from "../../../configs";
import * as nodemailer from 'nodemailer';
import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { Globals } from "../../../core/globals";
import logger from "../../../core/utils/winston.util";
import { SendEmailEvent } from "../../../domain/events";

@Injectable()
export class EmailListener {

  private readonly transporter: nodemailer.Transporter;

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
      logger.error('Failed to send email:', error);
      throw error;
    }
  }
}

