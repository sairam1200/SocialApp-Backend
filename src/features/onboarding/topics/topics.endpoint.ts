import { Response } from 'express';
import { QueryBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard, OnboardingGuard } from '../../../core/passport';
import { GetTopicsQuery } from './topics.handler';
import { TopicModel } from '../../../domain/contracts/onboarding.model';
import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';

@ApiTags('Onboarding')
@UseGuards(UserAccoutGuard, OnboardingGuard)
@Controller({
  path: `/onboarding`,
  version: '1',
})
export class GetTopicsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('topics')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 200, description: 'OK', type: [TopicModel] })
  public async GetTopics(@Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetTopicsQuery({}));

    return res.status(HttpStatus.OK).send(result);
  }
}
