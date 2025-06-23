import { Job } from "bullmq";
import configs from "../../../configs";
import * as nodemailer from 'nodemailer';
import _const from "../../../core/utils/const";
import logger from "../../../core/utils/winston.util";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";

export const InjectEmailQueue = (): ParameterDecorator =>
  InjectQueue(_const.BULL_QUEUES.EMAIL);

@Processor(_const.BULL_QUEUES.EMAIL)
export class EmailProcessor extends WorkerHost {

  constructor(

  ) { super() }

  async process(job: Job<{
    from: string;
    to: string;
    subject:
    string;
    html: string;
    attachments?: {
      filename: string;
      path?: string;
      content?: any;
      contentType?: string;
    }[]
  }>): Promise<void> {

    const transporter = nodemailer.createTransport({
      host: configs.smtp.host,
      port: +configs.smtp.port,
      secure: false,
      auth: {
        user: configs.smtp.user,
        pass: configs.smtp.password,
      },
    });

    const { from, to, subject, html, attachments } = job.data;
    try {
      await transporter.sendMail({
        from: from || '"Gaddr" <team@gaddr.com>',
        to,
        subject,
        html,
        attachments: attachments || [],
      });

    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  }
}