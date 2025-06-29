import { User } from "../entities/user.entity";
import { JwtPayload } from "../../core/passport/jwtPayload";

export interface ITokenService {
  generateEncryptedToken(claims: any): string;
  generateJwtAsync(user: User): Promise<string>;
  getPrincipalFromToken(token: string): Promise<JwtPayload>;
  generate2FAJwt(user: User, ipAddress: string, userAgent: string, deviceId: string): string;
}