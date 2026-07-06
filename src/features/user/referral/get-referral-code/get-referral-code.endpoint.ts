import { CommandBus } from '@nestjs/cqrs';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetReferralCodeQuery } from './get-referral-code.handler';
import { AuthenticatedAccountGuard } from '../../../../core/passport';

@ApiBearerAuth()
@ApiTags('Users')
@UseGuards(AuthenticatedAccountGuard)
@Controller({
  path: `/user/referral-code`,
  version: '1',
})
export class GetReferralCodeController {
  constructor(private readonly queryBus: CommandBus) {}

  @Get()
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  public async GetReferralCode(): Promise<{ referralCode: string }> {
    const result = await this.queryBus.execute(new GetReferralCodeQuery());
    return result;
  }
}
