import * as crypto from 'crypto';
import configs from '../../../../configs';
import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
import { BrevoWebhookCommand } from './brevo-webhook.handler';
import { BrevoWebhookEvent } from './brevo-webhook.dto';

@ApiTags('Webhooks')
@Controller({ path: '/webhooks/brevo', version: '1' })
export class BrevoWebhookController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  public async handleWebhook(
    @Headers('authorization') authHeader: string,
    @Body() body: BrevoWebhookEvent,
  ): Promise<{ status: string }> {
    this.verifyAuthentication(authHeader);

    if (!body || !body.event || !body.email) {
      throw new BadRequestException('Invalid webhook payload');
    }

    await this.commandBus.execute(new BrevoWebhookCommand({ model: body }));

    return { status: 'ok' };
  }

  private verifyAuthentication(authHeader: string): void {
    const secret = configs.brevo?.webhookSecret;
    if (!secret) {
      throw new UnauthorizedException('Webhook secret not configured');
    }

    const expected = `Bearer ${secret}`;
    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const authBuffer = Buffer.from(authHeader, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    if (
      authBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(authBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid authentication');
    }
  }
}
