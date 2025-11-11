import { Queue } from "bullmq";
import * as Handlebars from "handlebars";
import { Injectable } from "@nestjs/common";
import _const from "../../core/utils/const";
import { InjectQueue } from "@nestjs/bullmq";
import fileUtil from "../../core/utils/file.util";
import { IEmailService } from "../../domain/services/iemail.service";

@Injectable()
export class EmailService implements IEmailService {

  constructor(
    @InjectQueue(_const.BULL_QUEUES.EMAIL)
    private readonly emailQueue: Queue
  ) { }

  public async sendAsync(options: {
    from?: string;
    to: string;
    subject: string;
    html: string;
    attachments?: {
      filename: string;
      path?: string;
      content?: any;
      contentType?: string;
    }[]
  }): Promise<void> {
    await this.emailQueue.add('send-email', options, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    });
  }

  public async sendTemplatedAsync(options: {
    from?: string;
    to: string;
    subject: string;
    templatePath: string;
    context: Record<string, any>;
    attachments?: {
      filename: string;
      path?: string;
      content?: any;
      contentType?: string;
    }[]
  }): Promise<void> {

    const { from, to, context, subject, attachments, templatePath } = options;
    const htmlTemplate = await fileUtil.readFileAsStringAsync(templatePath);
    const compiledTemplate = Handlebars.compile(htmlTemplate);
    const html = compiledTemplate(context);

    await this.sendAsync({ from, to, subject, html, attachments })
  }
}