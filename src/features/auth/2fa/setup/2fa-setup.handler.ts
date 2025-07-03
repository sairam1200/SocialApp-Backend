import * as QRCode from 'qrcode';
import * as speakeasy from 'speakeasy';
import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { IUserRepository } from '../../../../domain/repositories';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { ApplicationException, UserNotFoundException } from '../../../../core/exceptions';

export class Setup2FACommand { }

@CommandHandler(Setup2FACommand)
export class Setup2FACommandHandler implements ICommandHandler<Setup2FACommand, { secret: string, qrCode: string }> {

  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) { }

  public async execute(command: Setup2FACommand): Promise<{ secret: string, qrCode: string }> {

    const user = await this.userRepository.getUserByIdAsync(HttpContext.getCurrentUserId);
    if (!user) {
      throw new UserNotFoundException();
    }

    if (user.twoFactorEnabled) {
      throw new ApplicationException(""); // AI fix the proper user friendly message
    }

    const secret = speakeasy.generateSecret({
      name: `Gaddr`,
      length: 20,
    });

    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    return {
      secret: secret.base32,
      qrCode,
    };
  }
}