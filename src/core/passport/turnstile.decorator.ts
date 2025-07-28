import { UseGuards } from '@nestjs/common';
import { TurnstileGuard } from './turnstile.guard';

/**
 * Decorator to require Turnstile captcha verification for an endpoint.
 * The Turnstile token must be provided in the 'X-Turnstile-Token' header.
 * 
 * Usage:
 * @RequireTurnstile()
 * @Post('/register')
 * async register(@Body() data: RegisterModel) {
 *   // endpoint logic
 * }
 */
export const RequireTurnstile = () => UseGuards(TurnstileGuard);
