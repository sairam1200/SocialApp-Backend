import { ApiProperty } from "@nestjs/swagger";

export class TokenResponseModel {
  @ApiProperty()
  access_token: string;

  @ApiProperty()
  refresh_token: string;

  @ApiProperty()
  message: string;

  @ApiProperty({ default: false })
  succeeded: boolean;

  @ApiProperty({ default: false })
  isLockedOut: boolean;

  @ApiProperty({ default: false })
  isTwoFARequired: boolean;

  @ApiProperty()
  refreshTokenExpiryTime: number;

  @ApiProperty({ required: false })
  onboardingCompleted?: boolean;

  constructor(request: Partial<TokenResponseModel> = {}) {
    Object.assign(this, request);
  }
}