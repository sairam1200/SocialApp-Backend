import { Response } from "express";
import configs from "../../configs";
import { UnauthorizedException } from "@nestjs/common";
import { JwtService, TokenExpiredError } from "@nestjs/jwt";

export async function getUserFromAccessTokenAsync(
  access_token: string,
  response: Response,
  jwtService: JwtService
): Promise<any> {
  try {
    return await jwtService.verifyAsync(access_token, {
      secret: configs.jwt.secret,
      issuer: configs.jwt.issuer,
      audience: configs.jwt.audience
    });

  } catch (error) {
    if (error instanceof TokenExpiredError) {
      response.setHeader('Token-Expired', 'true');
    }
    // throw new UnauthorizedException('Unauthorized: Invalid or expired token.');
  }
}

export function extractTokenFromHeader(request: any): string | null {
  const token = request.headers.authorization?.split(' ')[1];
  return token || null;
}