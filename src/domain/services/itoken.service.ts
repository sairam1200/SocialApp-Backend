import { User } from "../entities/user.entity";
import { JwtPayload } from "../../core/passport/jwtPayload";


export interface ITokenService {
    generateJwtAsync(user: User): Promise<string>;
    getPrincipalFromToken(token: string): Promise<JwtPayload>;
}