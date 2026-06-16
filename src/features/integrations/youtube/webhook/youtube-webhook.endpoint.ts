import { Response, Request } from "express";
import { Controller, HttpStatus, Post, Res, Req, Get, Headers, HttpCode, Query, Body } from "@nestjs/common";
import { ApiTags, ApiExcludeEndpoint } from "@nestjs/swagger";
import logger from "../../../../core/utils/winston.util";

@ApiTags('Integrations')
@Controller({
  path: `/integrations/youtube`,
  version: '1',
})
export class YoutubeWebhookController {

  @Get('webhook')
  @ApiExcludeEndpoint()
  public verifyWebhook(
    @Query('hub.mode') mode?: string,
    @Query('hub.topic') topic?: string,
    @Query('hub.challenge') challenge?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Res() res?: Response,
  ): Response {
    logger.debug(
      `[YoutubeWebhook] Verification request: mode=${mode}, topic=${topic}`,
    );

    const expectedToken =
      process.env.YOUTUBE_WEBHOOK_VERIFY_TOKEN || 'default_verify_token';

    if (verifyToken !== expectedToken) {
      logger.warn(
        `[YoutubeWebhook] Invalid verify token: ${verifyToken}`,
      );

      return res!.status(HttpStatus.FORBIDDEN).send('Invalid verify token');
    }

    logger.info(
      `[YoutubeWebhook] Subscription verified for topic: ${topic}`,
    );

    return res!.status(HttpStatus.OK).send(challenge);
  }
  @Post('webhook')
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  public async handleWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Query('hub.mode') mode?: string,
    @Query('hub.topic') topic?: string,
    @Query('hub.challenge') challenge?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Headers('x-hub-signature') signature?: string,
    @Body() body?: any,
  ): Promise<Response | void> {
    logger.debug(`[YoutubeWebhook] Received webhook request: mode=${mode}, topic=${topic}`);
    logger.info('======================');
    logger.info('YOUTUBE WEBHOOK HIT');
    logger.info(req.headers['content-type']);
    logger.info(body);
    logger.info('======================');
    if (mode === 'subscribe' || mode === 'unsubscribe') {
      const expectedToken = process.env.YOUTUBE_WEBHOOK_VERIFY_TOKEN || 'default_verify_token';

      if (verifyToken !== expectedToken) {
        logger.warn(`[YoutubeWebhook] Invalid verify token: ${verifyToken}`);
        return res.status(HttpStatus.FORBIDDEN).send('Invalid verify token');
      }

      logger.info(`[YoutubeWebhook] Subscription ${mode} verified for topic: ${topic}`);
      return res.status(HttpStatus.OK).send(challenge);
    }

    try {
      await this.processNotification(body, signature);
      return res.status(HttpStatus.OK).send('OK');
    } catch (error) {
      logger.error(`[YoutubeWebhook] Error processing notification:`, error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Error processing notification');
    }
  }

  private async processNotification(body: any, signature?: string): Promise<void> {
    logger.debug(`[YoutubeWebhook] Processing notification`);

    if (!body) {
      logger.warn(`[YoutubeWebhook] Empty notification body`);
      return;
    }

    try {
      logger.info(`[YoutubeWebhook] Received notification`);
      logger.debug(`[YoutubeWebhook] Notification body:`, { body });
    } catch (error) {
      logger.error(`[YoutubeWebhook] Error processing notification:`, error);
      throw error;
    }
  }
}

