import { CommandBus } from '@nestjs/cqrs';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedAccountGuard } from '../../../../../core/passport';
import { NotificationPreferenceModel } from '../../../../../domain/contracts/userPreference.model';
import { GetNotificationSettingQuery } from './get-notification-setting.handler';

@ApiBearerAuth()
@ApiTags('Settings')
@UseGuards(AuthenticatedAccountGuard)
@Controller({
  path: `/user/setting`,
  version: '1',
})
export class GetNotificationSettingController {
  constructor(private readonly queryBus: CommandBus) {}

  @Get('notification')
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: NotificationPreferenceModel,
  })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Get(): Promise<NotificationPreferenceModel> {
    const result = await this.queryBus.execute(
      new GetNotificationSettingQuery(),
    );
    return result;
  }
}
