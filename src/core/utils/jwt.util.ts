import { Response } from 'express';
import configs from '../../configs';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';

export async function getUserFromAccessTokenAsync(
  access_token: string,
  response: Response,
  jwtService: JwtService,
  ignoreExpiration: boolean = false,
): Promise<any> {
  try {
    return await jwtService.verifyAsync(access_token, {
      secret: configs.jwt.secret,
      issuer: configs.jwt.issuer,
      audience: configs.jwt.audience,
      ignoreExpiration,
    });
  } catch (error) {
    console.error('JWT VERIFY ERROR', error);

    if (error instanceof TokenExpiredError) {
      response.setHeader('Token-Expired', 'true');
    }

    return undefined;
  }
}

export function extractTokenFromHeader(request: any): string | null {
  console.log('AUTH HEADER:', request.headers.authorization);
  const token = request.headers.authorization?.split(' ')[1];
  console.log('TOKEN FOUND:', !!token);
  return token || null;
}
