import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../core/passport';
import { CommandBus } from '@nestjs/cqrs';
import { UploadMediaCommand } from './upload.handler';
import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations`,
  version: '1',
})
export class UploadMediaController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Media file to upload (image or video)',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'OK — Returns the media URL' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  public async Upload(@UploadedFile() file: any): Promise<{ url: string }> {
    return this.commandBus.execute(new UploadMediaCommand({ file }));
  }
}
