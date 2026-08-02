import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpdateProfileImageCommand } from './update-profile-image.handler';
import { ApiConsumes, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import {
  AuthenticatedAccountGuard,
  UserAccoutGuard,
} from '../../../../core/passport';
import {
  Controller,
  HttpStatus,
  Patch,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Req } from '@nestjs/common';
import { Request } from 'express';
@ApiTags('Account')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/account`,
  version: '1',
})
export class UpdateProfileImageController {
  constructor(private readonly commandBus: CommandBus) {}

  @Patch('profile-image')
  @UseGuards(AuthenticatedAccountGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          nullable: true,
          description:
            'Profile image file. If not provided, a default image with initials will be generated.',
        },
      },
    },
  })
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Update(
    @UploadedFile() file: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.commandBus.execute(new UpdateProfileImageCommand({ file }));

    return res.status(HttpStatus.NO_CONTENT).send();
  }
}
