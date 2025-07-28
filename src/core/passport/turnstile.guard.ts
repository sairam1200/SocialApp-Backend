import { Injectable, CanActivate, ExecutionContext, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import configs from '../../configs';

@Injectable()
export class TurnstileGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const turnstileToken = request.headers['x-turnstile-token'] as string;
    
    if (!turnstileToken) {
      throw new BadRequestException('Turnstile token is required in X-Turnstile-Token header');
    }

    const clientIp = this.getClientIp(request);
    const isValid = await this.verifyToken(turnstileToken, clientIp);
    
    if (!isValid) {
      throw new BadRequestException('Invalid captcha verification');
    }

    return true;
  }

  private async verifyToken(token: string, ip?: string): Promise<boolean> {
    // Test bypass tokens for development/testing only
    if (configs.env === 'development' && (token === 'test-token')) {
      console.log('Turnstile: Using test bypass token in development mode');
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
        console.log('Turnstile: Token verification successful');
        return true;
      } else {
        console.warn('Turnstile: Token verification failed', {
          'error-codes': result['error-codes'],
          success: result.success
        });
        return false;
      }
    } catch (error) {
      console.error('Turnstile: API request failed:', error);
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
