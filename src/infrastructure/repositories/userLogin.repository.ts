import * as crypto from 'crypto';
import configs from '../../configs';
import { Repository } from "typeorm";
import { Injectable } from '@nestjs/common';
import { Globals } from '../../core/globals';
import { InjectRepository } from "@nestjs/typeorm";
import { JwtPayload } from '../../core/passport/jwtPayload';
import { addDurationToNow } from '../../core/utils/time.util';
import { UserLogin } from "../../domain/entities/userLogin.entity";
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { IUserLoginRepository } from "../../domain/repositories/irefreshtoken.repository";

@Injectable()
export class UserLoginRepository implements IUserLoginRepository {

    private readonly _currentUser: JwtPayload;

    constructor(
        @InjectRepository(UserLogin)
        private readonly userLoginContext: Repository<UserLogin>,
    ) {
        this._currentUser = HttpContext.user;
    }

    public async createAysnc(
        provider: string,
        userId: string,
        deviceId: string,
        userAgent: string,
        ipAddress: string,
        tokenValue: string = this.GenerateToken(),
        expiryDateUtc: Date = addDurationToNow(configs.jwt.refreshTokenExpiration)
    ): Promise<UserLogin> {

        const refreshToken = new UserLogin({
            provider,
            userId,
            deviceId,
            userAgent,
            ipAddress,
            tokenValue,
            expiryDateUtc
        });

        refreshToken.setCurrentUser(this._currentUser[Globals.ClaimTypes.UserId] ?? userId);
        return await this.userLoginContext.save(refreshToken);
    }

    public async getByUserIdAndProvider(userId: string, provider: string): Promise<UserLogin> {
        return await this.userLoginContext.findOne({ where: { userId, provider } });
    }

    public async getByUserId(userId: string): Promise<UserLogin[]> {
        return await this.userLoginContext.find({ where: { userId } });
    }

    public async getByUserIdAndDeviceId(userId: string, deviceId: string): Promise<UserLogin> {
        return await this.userLoginContext.findOne({ where: { userId, deviceId } });
    }

    public async getByTokenValueAndDeviceId(tokenValue: string, deviceId: string): Promise<UserLogin> {
        return await this.userLoginContext.findOne({ where: { tokenValue, deviceId } });
    }

    public async updateAsync(refreshToken: UserLogin): Promise<void> {
        await this.userLoginContext.update(refreshToken.id, refreshToken);
    }

    public async deleteAsync(refreshToken: UserLogin): Promise<UserLogin> {
        return await this.userLoginContext.remove(refreshToken);
    }

    public GenerateToken(): string {
        const randomBytes = crypto.randomBytes(32);
        return randomBytes.toString('base64');
    }

}