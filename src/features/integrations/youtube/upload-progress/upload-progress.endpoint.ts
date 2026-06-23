import { Inject } from '@nestjs/common';
import { ApiTags, ApiResponse } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport';
import _const from '../../../../core/utils/const';
import { IUploadJobRepository } from '../../../../domain/repositories/iuploadJob.repository';
import { Controller, Get, Param, Res, Req, UseGuards } from '@nestjs/common';
import { Response, Request } from 'express';

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/youtube`,
  version: '1',
})
export class YoutubeUploadProgressController {
  constructor(
    @Inject(_const.IUPLOADJOB_REPOSITORY)
    private readonly uploadJobRepo: IUploadJobRepository,
  ) {}

  @Get('upload/progress/:jobId')
  @ApiResponse({ status: 200, description: 'SSE stream of upload progress' })
  @ApiResponse({ status: 404, description: 'Upload job not found' })
  public async Progress(
    @Param('jobId') jobId: string,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<void> {
    const job = await this.uploadJobRepo.getByIdAsync(jobId);
    if (!job) {
      res.status(404).json({ message: 'Upload job not found' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const pollInterval = setInterval(async () => {
      try {
        const current = await this.uploadJobRepo.getByIdAsync(jobId);
        if (!current) {
          res.write(`event: error\ndata: ${JSON.stringify({ message: 'Upload job not found' })}\n\n`);
          clearInterval(pollInterval);
          res.end();
          return;
        }

        const event = {
          status: current.status,
          progress: current.progress,
          statusMessage: current.statusMessage,
          error: current.lastError || undefined,
        };

        res.write(`data: ${JSON.stringify(event)}\n\n`);

        if (current.status === 'completed' || current.status === 'failed') {
          clearInterval(pollInterval);
          res.end();
        }
      } catch (err) {
        clearInterval(pollInterval);
        res.end();
      }
    }, 2000);

    req.on('close', () => {
      clearInterval(pollInterval);
      res.end();
    });
  }
}
