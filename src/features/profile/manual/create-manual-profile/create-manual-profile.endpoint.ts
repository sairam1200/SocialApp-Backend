import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport";
import { CreateManualProfileCommand } from "./create-manual-profile.handler";
import { Body, Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { CreateManualProfileModel, ManualProfileModel } from "../../../../domain/contracts/manualProfile.model";

@ApiTags('Profiles')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/user`,
  version: '1',
})
export class CreateManualProfileController {

  constructor(private readonly commandBus: CommandBus) { }

  @Post("manual-profile")
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 201, description: 'CREATED', type: ManualProfileModel })
  public async Create(
    @Body() request: CreateManualProfileModel,
    @Res() res: Response
  ): Promise<Response> {
    const result = await this.commandBus.execute(new CreateManualProfileCommand({
      model: request
    }));

    res.status(HttpStatus.CREATED).send(result);
    return res;
  }
}