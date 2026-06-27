import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags, ApiQuery } from "@nestjs/swagger";
import { PublicProfileModel } from "../../../domain/contracts/public-profile.model";
import { GetPublicProfileQuery } from "./get-public-profile.handler";
import { Controller, Get, HttpStatus, Query, Res } from "@nestjs/common";

@ApiTags('User Profiles')
@Controller({
  path: `/user/profile/public`,
  version: '1',
})
export class GetPublicProfileController {
  constructor(
    private readonly queryBus: CommandBus
  ) { }

  @Get()
  @ApiQuery({ name: 'userName', required: true, type: String, description: 'Username of the profile to retrieve' })
  @ApiResponse({ status: 200, description: 'OK', type: PublicProfileModel })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async GetPublicProfile(@Query('userName') userName: string, @Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetPublicProfileQuery({ userName }));
    res.status(HttpStatus.OK).send(result);
    return res;
  }
}
