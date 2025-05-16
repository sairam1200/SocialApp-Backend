import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { JwtPayload } from 'core/passport/jwtPayload';
import { extractTokenFromHeader, getUserFromAccessTokenAsync } from '../../core/utils/jwt.util';
import { NextFunction, Request, Response } from 'express';
import { IncomingHttpHeaders } from 'http';

interface HttpContextStore {
  request: Request;
  response: Response;
  user: JwtPayload;
  headers: IncomingHttpHeaders;
}

const asyncLocalStorage = new AsyncLocalStorage<HttpContextStore>();

export class HttpContext {
  // Accessors to get the current request context
  static get request(): Request | undefined {
    return asyncLocalStorage.getStore()?.request;
  }

  static get response(): Response | undefined {
    return asyncLocalStorage.getStore()?.response;
  }

  static get user(): JwtPayload | undefined {
    return asyncLocalStorage.getStore()?.user;
  }

  static get headers(): IncomingHttpHeaders | undefined {
    return asyncLocalStorage.getStore()?.headers;
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
  async use(req: Request, res: Response, next: NextFunction) {
    const access_token = extractTokenFromHeader(req);
    const user = await getUserFromAccessTokenAsync(access_token, res);
    HttpContext.run(req, res, user, next);
  }
}