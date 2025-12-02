import * as Handlebars from "handlebars";
import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import fileUtil from "../../core/utils/file.util";
import { IEmailService } from "../../domain/services/iemail.service";
import { SendEmailEvent } from "../../domain/events";

@Injectable()
export class EmailService implements IEmailService {

  constructor(
    private readonly eventEmitter: EventEmitter2
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
    this.eventEmitter.emit('email.send', new SendEmailEvent(options));
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