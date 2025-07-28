import { Globals } from '../globals';
import { JwtService } from '@nestjs/jwt';
import { IncomingHttpHeaders } from 'http';
import logger from '../utils/winston.util';
import { AsyncLocalStorage } from 'async_hooks';
import { JwtPayload } from '../passport/jwtPayload';
import { NextFunction, Request, Response } from 'express';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { extractTokenFromHeader, getUserFromAccessTokenAsync } from '../utils/jwt.util';

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

  // Internal method to run the context — called from middleware
  static run(req: Request, res: Response, user: JwtPayload, next: () => void) {
    asyncLocalStorage.run({ request: req, response: res, user, headers: req.headers }, () => {
      next();
    });
  }
}

@Injectable()
export class HttpContextMiddleware implements NestMiddleware {

  constructor(
    private jwtService: JwtService
  ) { }

  async use(req: Request, res: Response, next: NextFunction) {
    // Debug logging
    logger.info(`[HttpContext] Request URL: ${req.url}`);
    logger.info(`[HttpContext] Authorization header: ${req.headers.authorization ? 'Present' : 'Missing'}`);
    
    const access_token = extractTokenFromHeader(req);
    if (!access_token) {
      logger.info('[HttpContext] No access token found in request');
      HttpContext.run(req, res, null, next);
    } else {
      logger.info('[HttpContext] Access token found, attempting to get user');
      const user = await getUserFromAccessTokenAsync(access_token, res, this.jwtService, true);
      logger.info(`[HttpContext] User resolved: ${user ? 'Yes' : 'No'}`);
      if (user) {
        logger.info(`[HttpContext] User type: ${user[Globals.ClaimTypes.UserType]}`);
      }
      HttpContext.run(req, res, (user ?? null), next);
    }
  }
}