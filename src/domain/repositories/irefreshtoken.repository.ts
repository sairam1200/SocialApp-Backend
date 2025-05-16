import { UserLogin } from "../entities/userLogin.entity";

export interface IUserLoginRepository {

    createAysnc(
        provider: string,
        userId: string,
        deviceId: string,
        userAgent: string,
        ipAddress: string,
        tokenValue?: string,
        expiryDateUtc?: Date
    ): Promise<UserLogin>;

    getByTokenValueAndDeviceId(
        tokenValue: string,
        deviceId: string
    ): Promise<UserLogin>;

    getByUserIdAndProvider(
        userId: string,
        provider: string
    ): Promise<UserLogin>;

    getByUserId(
        userId: string
    ): Promise<UserLogin[]>;

    GenerateToken(): string;
    updateAsync(refreshToken: UserLogin): Promise<void>;
}