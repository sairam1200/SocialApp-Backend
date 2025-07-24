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

    getByTokenValueAndDeviceIdAsync(
        tokenValue: string,
        deviceId: string
    ): Promise<UserLogin>;

    getByUserIdAndProviderAsync(
        userId: string,
        provider: string
    ): Promise<UserLogin>;

    getByUserIdAsync(
        userId: string
    ): Promise<UserLogin[]>;

    updateAsync(userLogin: UserLogin): Promise<void>;
}