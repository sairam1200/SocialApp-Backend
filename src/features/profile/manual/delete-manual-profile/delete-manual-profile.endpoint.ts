import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport";
import { DeleteManualProfileCommand } from "./delete-manual-profile.handler";
import { Controller, Delete, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";

@ApiTags('User Profiles')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/user/profile`,
  version: '1',
})
export class DeleteManualProfileController {

  constructor(private readonly commandBus: CommandBus) { }

  @Delete("manual-profile/:id")
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  public async Delete(
    @Query('id') id: string,
    @Res() res: Response
  ): Promise<Response> {

    await this.commandBus.execute(new DeleteManualProfileCommand({ id }));

    res.status(HttpStatus.NO_CONTENT).send();
    return res;
  }
}