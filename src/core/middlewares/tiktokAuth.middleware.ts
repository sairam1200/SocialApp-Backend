import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { UserLogin } from '../../domain/entities/userLogin.entity';
import { IUserLoginRepository } from '../../domain/repositories/irefreshtoken.repository';
import { Inject } from '@nestjs/common';
import _const from '../../core/utils/const';

@Injectable()
export class TikTokAuthMiddleware implements NestMiddleware {
  constructor(
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const accessToken = req.headers['authorization'];

    if (!accessToken) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = accessToken.replace('Bearer ', '');
    const userLogin = await this.userLoginRepository.getByTokenValueAndDeviceIdAsync(token, '');

    if (!userLogin || !userLogin.isValid || userLogin.expiryDateUtc < new Date()) {
      return res.status(401).json({ message: 'Token expired or invalid' });
    }

    next();
  }
}
