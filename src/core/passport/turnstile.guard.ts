import { Injectable, CanActivate, ExecutionContext, BadRequestException, UseGuards } from '@nestjs/common';
import logger from '../utils/winston.util';
import configs from '../../configs';
import { Request } from 'express';

/**
 * Decorator to require Turnstile captcha verification for an endpoint.
 * The Turnstile token must be provided in the 'X-Turnstile-Token' header.
 * 
 * Usage:
 * @RequireTurnstile()
 * @Post('/register')
 * async register(@Body() data: RegisterModel) {
 *   // endpoint logic
 * }
 */
export const RequireTurnstile = () => UseGuards(TurnstileGuard);

@Injectable()
export class TurnstileGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const turnstileToken = request.headers['x-turnstile-token'] as string;
    
    if (!turnstileToken) {
      throw new BadRequestException('[Turnstile]: token is required!');
    }

    const clientIp = this.getClientIp(request);
    const isValid = await this.verifyToken(turnstileToken, clientIp);
    
    if (!isValid) {
      throw new BadRequestException('[Turnstile]: Invalid captcha verification');
    }

    return true;
  }

  private async verifyToken(token: string, ip?: string): Promise<boolean> {
    // Test bypass tokens for development/testing only
    if (configs.env === 'development' && (token === 'test-token')) {
      logger.verbose('[Turnstile]: Using test bypass token in development mode');
      return true;
    }
    
    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          secret: configs.turnstile.secretKey,
          response: token,
          ...(ip && { remoteip: ip }),
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        logger.verbose('[Turnstile]: Token verification successful');
        return true;
      } else {
        logger.warn('[Turnstile]: Token verification failed', {
          'error-codes': result['error-codes'],
          success: result.success
        });
        return false;
      }
    } catch (error) {
      logger.error('[Turnstile]: API request failed:', error);
      return false;
    }
  }

  private getClientIp(request: Request): string {
    return (
      request.headers['cf-connecting-ip'] as string ||
      request.headers['x-forwarded-for'] as string ||
      request.headers['x-real-ip'] as string ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      ''
    );
  }
}
