import { Globals } from '../globals';
import { UserType } from '../../domain/enums';
import { JwtService } from '@nestjs/jwt';
import { IncomingHttpHeaders } from 'http';
import logger from '../utils/winston.util';
import { AsyncLocalStorage } from 'async_hooks';
import { JwtPayload } from '../passport/jwtPayload';
import { NextFunction, Request, Response } from 'express';
import { Injectable, NestMiddleware } from '@nestjs/common';
import dataSource from '../../infrastructure/persistence/data.source';
import {
  extractTokenFromHeader,
  getUserFromAccessTokenAsync,
} from '../utils/jwt.util';
import { extractBetterAuthToken } from '../utils/betterAuthSession.util';

interface HttpContextStore {
  request: Request;
  response: Response;
  user: JwtPayload;
  headers: IncomingHttpHeaders;
}

const asyncLocalStorage = new AsyncLocalStorage<HttpContextStore>();

export class HttpContext {
  // Accessors to get the current request context
  static get request(): Request {
    return asyncLocalStorage.getStore()?.request;
  }

  static get response(): Response | undefined {
    return asyncLocalStorage.getStore()?.response;
  }

  static get user(): JwtPayload {
    return asyncLocalStorage.getStore()?.user;
  }

  static get headers(): IncomingHttpHeaders {
    return asyncLocalStorage.getStore()?.headers;
  }

  static get getCurrentUserId(): string {
    return this.user ? this.user[Globals.ClaimTypes.UserId] : null;
  }

  // Public method to run the context — called from middleware and external callers
  static run(req: Request, res: Response, user: JwtPayload, next: () => void) {
    asyncLocalStorage.run(
      { request: req, response: res, user, headers: req.headers },
      () => {
        next();
      },
    );
  }
}

@Injectable()
export class HttpContextMiddleware implements NestMiddleware {
  constructor(private jwtService: JwtService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const betterAuthUser = await this.tryBetterAuthSession(req);
    if (betterAuthUser) {
      HttpContext.run(req, res, betterAuthUser, next);
      return;
    }

    const headerToken = extractTokenFromHeader(req);
    const cookieToken = req.cookies?.access_token || req.cookies?.ACCESS_TOKEN;

    const access_token = headerToken || cookieToken;
    if (!access_token) {
      HttpContext.run(req, res, null, next);
    } else {
      const user = await getUserFromAccessTokenAsync(
        access_token,
        res,
        this.jwtService,
        false,
      );
      HttpContext.run(req, res, user ?? null, next);
    }
  }

  private async tryBetterAuthSession(req: Request): Promise<JwtPayload | null> {
    try {
      const token = extractBetterAuthToken(req);
      if (!token) return null;

      const ds = await dataSource;

      const sessionResult = await ds.query(
        `SELECT s."userId"
         FROM session s
         WHERE s.token = $1 AND s."expiresAt" > NOW()
         LIMIT 1`,
        [token],
      );

      if (!sessionResult?.length) return null;

      const userId: string = sessionResult[0].userId;

      const userResult = await ds.query(
        `SELECT
           u.id,
           u.email,
           u.name,
           u."securityStamp",
           u."concurrencyStamp"
         FROM identity.users u
         WHERE u.id = $1
         LIMIT 1`,
        [userId],
      );

      if (!userResult?.length) return null;

      const dbUser = userResult[0];
      const nameParts = (dbUser.name || '').split(' ');

      const payload: JwtPayload = {
        [Globals.ClaimTypes.UserId]: dbUser.id,
        [Globals.ClaimTypes.Email]: dbUser.email,
        [Globals.ClaimTypes.FullName]: dbUser.name || '',
        [Globals.ClaimTypes.GivenName]: nameParts[0] || dbUser.name || '',
        [Globals.ClaimTypes.FamilyName]:
          nameParts.slice(1).join(' ') || dbUser.name || '',
        [Globals.ClaimTypes.SecurityStamp]: dbUser.securityStamp || '',
        [Globals.ClaimTypes.ConcurrencyStamp]: dbUser.concurrencyStamp || '',
        [Globals.ClaimTypes.UserType]: UserType.User,
      };

      return payload;
    } catch (error) {
      logger.error(
        '[HttpContext] Better Auth session verification failed',
        error,
      );
      return null;
    }
  }
}
