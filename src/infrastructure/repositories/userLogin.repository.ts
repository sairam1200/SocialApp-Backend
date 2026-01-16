import configs from '../../configs';
import { Repository } from "typeorm";
import { Injectable } from '@nestjs/common';
import { UserLogin } from "../../domain/entities";
import { InjectRepository } from "@nestjs/typeorm";
import { cryptoUtils } from '../../core/utils/crypto.util';
import { addDurationToNow } from '../../core/utils/time.util';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { IUserLoginRepository } from "../../domain/repositories/iuserLogin.repository";

@Injectable()
export class UserLoginRepository implements IUserLoginRepository {

	constructor(
		@InjectRepository(UserLogin)
		private readonly userLoginContext: Repository<UserLogin>,
	) { }

	public async createAysnc(
		provider: string,
		userId: string,
		deviceId: string,
		userAgent: string,
		ipAddress: string,
		tokenValue: string = cryptoUtils.generateEncryptionKey(32),
		expiryDateUtc: Date = addDurationToNow(configs.jwt.refreshTokenExpiration)
	): Promise<UserLogin> {

		const userLogin = new UserLogin({
			provider,
			userId,
			deviceId,
			userAgent,
			ipAddress,
			tokenValue,
			expiryDateUtc
		});

		if (HttpContext.user) {
			userLogin.setCurrentUser(HttpContext.getCurrentUserId);
		}
		return await this.userLoginContext.save(userLogin);
	}

	public async getByUserIdAndProviderAsync(userId: string, provider: string): Promise<UserLogin> {
		return await this.userLoginContext.findOne({ where: { userId, provider } });
	}

	public async getByUserIdAsync(userId: string): Promise<UserLogin[]> {
		return await this.userLoginContext.find({ where: { userId } });
	}

	public async getByUserIdAndDeviceIdAsync(userId: string, deviceId: string): Promise<UserLogin> {
		return await this.userLoginContext.findOne({ where: { userId, deviceId } });
	}

	public async getByTokenValueAndDeviceIdAsync(tokenValue: string, deviceId: string): Promise<UserLogin> {
		return await this.userLoginContext.findOne({ where: { tokenValue, deviceId } });
	}

	public async updateAsync(userLogin: UserLogin): Promise<void> {

		if (HttpContext.user) {
			userLogin.setCurrentUser(HttpContext.getCurrentUserId);
		}
		await this.userLoginContext.save(userLogin);
	}

	public async deleteAsync(refreshToken: UserLogin): Promise<void> {
		await this.userLoginContext.remove(refreshToken);
	}
}