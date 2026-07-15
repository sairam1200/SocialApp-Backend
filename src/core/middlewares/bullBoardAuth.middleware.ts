import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import logger from '../utils/winston.util';

@Injectable()
export class BullBoardAuthMiddleware implements NestMiddleware {
  constructor() {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.get('authorization');

    if (!authHeader?.startsWith('Basic ')) {
      this.sendUnauthorizedResponse(res);
      return;
    }

    const encodedCreds = authHeader.split(' ')[1];
    const decodedCreds = Buffer.from(encodedCreds, 'base64').toString('utf-8');
    const [username, password] = decodedCreds.split(':');

    try {
      const expectedUsername = process.env.BULLBOARD_USERNAME;
      const expectedPassword = process.env.BULLBOARD_PASSWORD;

      if (!expectedUsername || !expectedPassword) {
        logger.error(
          '[BullBoard] BULLBOARD_USERNAME and BULLBOARD_PASSWORD must be configured',
        );
        this.sendUnauthorizedResponse(res);
        return;
      }

      if (username !== expectedUsername || password !== expectedPassword) {
        this.sendUnauthorizedResponse(res);
        return;
      }
    } catch (error) {
      logger.error(`Bull-board login - ${error}`);
      this.sendUnauthorizedResponse(res);
      return;
    }

    next();
  }

  private sendUnauthorizedResponse(res: Response): void {
    res.setHeader(
      'WWW-Authenticate',
      'Basic realm="Restricted Area", charset="UTF-8"',
    );
    res.sendStatus(401);
  }
}
