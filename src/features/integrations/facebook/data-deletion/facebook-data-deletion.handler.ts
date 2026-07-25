import * as crypto from 'crypto';
import { Inject } from '@nestjs/common';
import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { IPlatformDisconnectService } from '../../../../domain/services/iplatform-disconnect.service';

export class FacebookDataDeletionCommand {
  signedRequest: string;

  constructor(request: Partial<FacebookDataDeletionCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(FacebookDataDeletionCommand)
export class FacebookDataDeletionCommandHandler implements ICommandHandler<FacebookDataDeletionCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IPLATFORM_DISCONNECT_SERVICE)
    private readonly disconnectService: IPlatformDisconnectService,
  ) {}

  public async execute(
    command: FacebookDataDeletionCommand,
  ): Promise<{ url: string; confirmation_code: string }> {
    const { signedRequest } = command;

    const { user_id } = this.parseAndVerifySignedRequest(signedRequest);

    const linkedAccount =
      await this.linkedAccountRepository.getByPlatformAndMetaDataValueAsync(
        _const.PLATFORMS.FACEBOOK,
        'facebookUserId',
        user_id,
      );

    if (!linkedAccount) {
      logger.warn(
        `[FacebookDataDeletion] No linked account found for Facebook user ${user_id}`,
      );
      const confirmationCode = crypto.randomUUID();
      return {
        url: `${configs.frontend.url}/data-deletion?code=${confirmationCode}`,
        confirmation_code: confirmationCode,
      };
    }

    const confirmationCode = crypto.randomUUID();
    logger.info(
      `[FacebookDataDeletion] Initiating data deletion for user ${linkedAccount.userId}`,
    );

    await this.disconnectService.disconnectPlatformAsync(
      linkedAccount.userId,
      _const.PLATFORMS.FACEBOOK,
    );

    return {
      url: `${configs.frontend.url}/data-deletion?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    };
  }

  private parseAndVerifySignedRequest(signedRequest: string): {
    user_id: string;
  } {
    if (!signedRequest) {
      throw new ApplicationException('Missing signed_request');
    }

    const parts = signedRequest.split('.');
    if (parts.length !== 2) {
      throw new ApplicationException('Invalid signed_request format');
    }

    const [encodedSig, encodedPayload] = parts;

    if (!encodedSig || !encodedPayload) {
      throw new ApplicationException('Invalid signed_request parts');
    }

    if (!configs.facebook.appSecret) {
      throw new ApplicationException('Facebook App Secret not configured');
    }

    const payloadJson = Buffer.from(
      encodedPayload.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf-8');

    let payload: Record<string, any>;
    try {
      payload = JSON.parse(payloadJson);
    } catch {
      throw new ApplicationException('Invalid signed_request payload');
    }

    const expectedSig = crypto
      .createHmac('sha256', configs.facebook.appSecret)
      .update(encodedPayload)
      .digest();

    const actualSig = Buffer.from(
      encodedSig.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    );

    if (
      expectedSig.length !== actualSig.length ||
      !crypto.timingSafeEqual(expectedSig, actualSig)
    ) {
      throw new ApplicationException('Invalid signed_request signature');
    }

    if (!payload.user_id) {
      throw new ApplicationException('No user_id in signed_request');
    }

    return { user_id: payload.user_id };
  }
}
