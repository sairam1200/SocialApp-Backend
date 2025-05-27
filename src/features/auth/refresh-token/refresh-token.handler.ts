import * as Joi from "joi";
import configs from "../../../configs";
import { Inject } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../core/utils/const";
import { Globals } from "../../../core/globals";
import { hasIpChanged } from "../../../core/utils/ip.util";
import { TokenResponseModel } from "../tokenResponse.model";
import { addDurationToNow } from "../../../core/utils/time.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { ITokenService } from "../../../domain/services/itoken.service";
import { IUserRepository } from "../../../domain/repositories/iuser.repository";
import { IUserLoginRepository } from "../../../domain/repositories/irefreshtoken.repository";

export class RefreshTokenRequestModel {

    @ApiProperty()
    userAgent: string;

    @ApiProperty()
    ipAddress: string;

    @ApiProperty()
    deviceId: string;

    @ApiProperty()
    refreshToken: string;

    constructor(request: Partial<RefreshTokenRequestModel> = {}) {
        Object.assign(this, request);
    }
}

export class RefreshTokenCommand {
    model: RefreshTokenRequestModel;

    constructor(request: Partial<RefreshTokenCommand> = {}) {
        Object.assign(this, request);
    }
}

const refreshTokenValidations = Joi.object({
    userAgent: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
    ipAddress: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
    deviceId: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
    refreshToken: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
});

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler implements ICommandHandler<RefreshTokenCommand> {
    constructor(
        @Inject(_const.ITOKEN_SERVICE) private readonly tokenService: ITokenService,
        @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
        @Inject(_const.IUSERLOGIN_REPOSITORY) private readonly userLoginRepository: IUserLoginRepository
    ) { }

    public async execute(command: RefreshTokenCommand): Promise<TokenResponseModel> {

        const { model } = command;

        await refreshTokenValidations.validateAsync(command.model);
        const userLogin = await this.userLoginRepository.getByTokenValueAndDeviceId(
            model.refreshToken,
            model.deviceId
        );

        if (!userLogin) {
            throw new Error("Invalid refresh token or device mismatch.");
        }

        const user = await this.userRepository.getUserByIdAsync(userLogin.userId);
        if (!user) {
            throw new Error("User associated with the token does not exist.");
        }

        const currentUtcDate = new Date();
        if (userLogin.expiryDateUtc < currentUtcDate) {
            throw new Error("Refresh token has expired. Please log in again.");
        }

        const jwt = await this.tokenService.generateJwtAsync(user);
        userLogin.tokenValue = this.userLoginRepository.GenerateToken();
        userLogin.expiryDateUtc = addDurationToNow(configs.jwt.refreshTokenExpiration);

        const hasChanged = hasIpChanged(model.ipAddress, userLogin.ipAddress);

        if (hasChanged) {
            // TODO: Send email notification of account access with new ipAddress  
        }

        await this.userLoginRepository.updateAsync(userLogin);

        return new TokenResponseModel({
            access_token: jwt,
            refresh_token: userLogin.tokenValue,
            succeeded: true,
            refreshTokenExpiryTime: userLogin.expiryDateUtc.toDateString(),
        });
    }
} 