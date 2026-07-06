import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Controller, Post, HttpStatus, Res, Body } from '@nestjs/common';
import { FacebookDataDeletionCommand } from './facebook-data-deletion.handler';

class FacebookDataDeletionResponseModel {
  url: string;
  confirmation_code: string;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/facebook`,
  version: '1',
})
export class FacebookDataDeletionController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('data-deletion')
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: FacebookDataDeletionResponseModel,
  })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  public async handleDataDeletion(
    @Body('signed_request') signedRequest: string,
    @Res() res: Response,
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(
      new FacebookDataDeletionCommand({ signedRequest }),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
