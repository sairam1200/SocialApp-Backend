import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IEmailBounceService } from '../../../../domain/services/iemail-bounce.service';
import { BrevoWebhookEvent } from './brevo-webhook.dto';
import { EMAIL_BOUNCE_EVENTS } from '../../email/bounce.constants';

export class BrevoWebhookCommand {
  model: BrevoWebhookEvent;

  constructor(request: Partial<BrevoWebhookCommand> = {}) {
    Object.assign(this, request);
  }
}

const brevoWebhookValidations = Joi.object({
  event: Joi.string().required(),
  email: Joi.string().email().required(),
  'message-id': Joi.string().optional().allow('', null),
  reason: Joi.string().optional().allow('', null),
  date: Joi.string().optional().allow('', null),
  ts: Joi.number().optional().allow(null),
  subject: Joi.string().optional().allow('', null),
  sending_ip: Joi.string().optional().allow('', null),
});

@CommandHandler(BrevoWebhookCommand)
export class BrevoWebhookHandler
  implements ICommandHandler<BrevoWebhookCommand>
{
  constructor(
    @Inject(_const.IEMAIL_BOUNCE_SERVICE)
    private readonly emailBounceService: IEmailBounceService,
  ) {}

  public async execute(command: BrevoWebhookCommand): Promise<void> {
    await brevoWebhookValidations.validateAsync(command.model);

    const { event } = command.model;

    if (
      event !== EMAIL_BOUNCE_EVENTS.HARD_BOUNCE &&
      event !== EMAIL_BOUNCE_EVENTS.INVALID_EMAIL
    ) {
      logger.debug('[BrevoWebhook] Unsupported event, ignoring', { event });
      return;
    }

    await this.emailBounceService.handleBounce({
      event: command.model.event,
      email: command.model.email,
      reason: command.model.reason,
      messageId: command.model['message-id'],
      timestamp: command.model.ts,
      subject: command.model.subject,
      deliveryProvider: 'brevo',
    });
  }
}
