import { ApiProperty } from "@nestjs/swagger";

export class TokenResponseModel {
    @ApiProperty()
    access_token: string;
    @ApiProperty()
    refresh_token: string;
    @ApiProperty()
    message: string;
    @ApiProperty()
    userImage: string;
    @ApiProperty({ default: false })
    succeeded: boolean;
    @ApiProperty({ default: false })
    isLockedOut: boolean;
    @ApiProperty()
    refreshTokenExpiryTime: string;

    constructor(request: Partial<TokenResponseModel> = {}) {
        Object.assign(this, request);
    }
}