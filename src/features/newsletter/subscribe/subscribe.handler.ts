import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';
import logger from '../../../core/utils/winston.util';
import _const from '../../../core/utils/const';
import { INewsletterSubscriberRepository } from '../../../domain/repositories/inewsletterSubscriber.repository';

export class SubscribeModel {
  @ApiProperty()
  email: string;
}

export class SubscribeCommand {
  constructor(public readonly model: SubscribeModel) {}
}

export class SubscribeResult {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  alreadySubscribed: boolean;

  @ApiProperty()
  message: string;

  constructor(
    success: boolean,
    alreadySubscribed: boolean,
    message: string,
  ) {
    this.success = success;
    this.alreadySubscribed = alreadySubscribed;
    this.message = message;
  }
}

const subscribeValidations = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
});

@CommandHandler(SubscribeCommand)
export class SubscribeCommandHandler
  implements ICommandHandler<SubscribeCommand, SubscribeResult>
{
  constructor(
    @Inject(_const.INEWSLETTER_REPOSITORY)
    private readonly newsletterRepo: INewsletterSubscriberRepository,
  ) {}

  public async execute(command: SubscribeCommand): Promise<SubscribeResult> {
    const { model } = command;

    const validated = await subscribeValidations.validateAsync(model);

    const subscriber = await this.newsletterRepo.tryInsertAsync(
      validated.email,
    );

    if (!subscriber) {
      logger.info(
        `Newsletter: duplicate subscription attempt for ${validated.email}`,
      );
      return new SubscribeResult(
        true,
        true,
        "You're already subscribed to Gaddr updates.",
      );
    }

    logger.info(`Newsletter: new subscriber ${validated.email}`);
    return new SubscribeResult(true, false, 'Subscribed successfully.');
  }
}
