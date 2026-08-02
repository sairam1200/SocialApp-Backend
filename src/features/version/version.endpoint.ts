import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { buildInfo, BuildInfoModel } from '../../core/utils/buildInfo.util';

/**
 * What is actually running.
 *
 * This exists because answering "did that deploy?" required inferring the live
 * commit from the *contents of a 404 page* — grepping for a string only the
 * newest build could produce. That works once, by luck, and not at all for a
 * change with no visible surface.
 *
 * Unauthenticated on purpose: a deploy check that needs a token is a deploy
 * check nobody runs, and everything here is derivable from the public
 * repository anyway. It exposes no configuration, no secrets and no
 * infrastructure detail beyond a commit hash and an uptime.
 */
@ApiTags('Meta')
@Controller({ path: '/version', version: '1' })
export class VersionController {
  @Get()
  @ApiOperation({
    summary: 'The running build',
    description:
      'Commit, revision and uptime. Use it to confirm a deploy actually landed: `curl .../api/v1/version` and compare `commit` to `git rev-parse --short HEAD`.',
  })
  @ApiResponse({ status: 200, description: 'OK', type: BuildInfoModel })
  public version(): BuildInfoModel {
    return buildInfo();
  }
}
