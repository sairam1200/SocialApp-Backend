import { CommandBus } from "@nestjs/cqrs";
import { ApiProperty, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { LinkedInProfileModel } from "../../../../domain/contracts/linkedin.model";
import { LinkedInProfileQuery } from "./get-profile.handler";

class LinkedInProfileQueryModel {
  @ApiProperty({ required: false })
  userId?: string;

  @ApiProperty({ required: false })
  userName?: string;

  @ApiProperty({ required: false })
  linkedInId?: string;
}

class LinkedInProfileResponseModel {
  @ApiProperty()
  profile: LinkedInProfileModel;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/linkedin`,
  version: '1',
})
export class LinkedInProfileController {

  constructor(private readonly commandBus: CommandBus) { }

  @Get('profile')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: LinkedInProfileResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async GetProfile(@Query() query: LinkedInProfileQueryModel): Promise<LinkedInProfileResponseModel> {

    const profile = await this.commandBus.execute(new LinkedInProfileQuery({ model: query }));

    return {
      profile,
    };
  }
}
