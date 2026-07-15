import { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { HttpContext } from '../../../core/middlewares/httpContext.middleware';
import { Globals } from '../../../core/globals';
import { OnboardingStep } from '../../../domain/enums';
import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { AuthenticatedAccountGuard } from '../../../core/passport';

import { CurrentUserQuery } from './current-user.handler';

@ApiTags('Authentication')
@Controller({
  path: '/auth',
  version: '1',
})
export class CurrentUserController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('current')
  @UseGuards(AuthenticatedAccountGuard)
  public async GetCurrentUser(@Res() res: Response): Promise<Response> {
    const user = HttpContext.user;

    return res.status(HttpStatus.OK).send({
      id: user[Globals.ClaimTypes.UserId],
      email: user[Globals.ClaimTypes.Email],
      firstName: user[Globals.ClaimTypes.GivenName],
      lastName: user[Globals.ClaimTypes.FamilyName],
      fullName: user[Globals.ClaimTypes.FullName],
      userType: user[Globals.ClaimTypes.UserType],
      onboardingStep: user.onboardingStep,
      onboardingCompleted: user.onboardingStep === OnboardingStep.Completed,
    });
  }
}
