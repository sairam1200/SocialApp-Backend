import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiTags, ApiResponse } from '@nestjs/swagger';
import { Controller, HttpStatus, Post, Res, Body } from '@nestjs/common';
import {
  SubscribeCommand,
  SubscribeModel,
  SubscribeResult,
} from './subscribe.handler';

@ApiTags('Newsletter')
@Controller({ path: '/newsletter', version: '1' })
export class SubscribeController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('subscribe')
  @ApiResponse({
    status: 201,
    description: 'Subscription result',
    type: SubscribeResult,
  })
  public async subscribe(
    @Body() request: SubscribeModel,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.commandBus.execute(
      new SubscribeCommand(request),
    );
    return res.status(HttpStatus.CREATED).send(result);
  }
}
