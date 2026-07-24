import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ProblemDocument } from 'http-problem-details';
import { ValidationError } from 'joi';
import { serializeObject } from '../utils/serialization.util';
import { ApplicationException } from './application.exception';

const isProduction = process.env.NODE_ENV === 'production';

function getClientTitle(err: any, fallback: string): string {
  if (typeof err.clientMessage === 'string') {
    return err.clientMessage;
  }
  return fallback;
}

@Catch()
export class ErrorHandlersFilter implements ExceptionFilter {
  public catch(err: any, host: ArgumentsHost): any {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (err instanceof ApplicationException) {
      const title = getClientTitle(err, err.message);
      const problem = new ProblemDocument({
        type: ApplicationException.name,
        title,
        detail: isProduction ? undefined : err.stack,
        status: err.statusCode || HttpStatus.BAD_REQUEST,
      });

      Logger.error(
        serializeObject({ ...problem, detail: err.stack, originalMessage: err.message }),
      );

      response.status(err.statusCode || HttpStatus.BAD_REQUEST).json(problem);

      return;
    }

    if (err instanceof BadRequestException) {
      const title = getClientTitle(err, err.message);
      const problem = new ProblemDocument({
        type: err.name,
        title,
        detail: isProduction ? undefined : err.stack,
        status: err.getStatus(),
      });

      Logger.error(
        serializeObject({ ...problem, detail: err.stack, originalMessage: err.message }),
      );

      response.status(HttpStatus.BAD_REQUEST).json(problem);

      return;
    }

    if (err instanceof ForbiddenException) {
      const problem = new ProblemDocument({
        type: ForbiddenException.name,
        title: err.message,
        detail: isProduction ? undefined : err.stack,
        status: err.getStatus(),
      });

      Logger.error(serializeObject(problem));

      response.status(HttpStatus.FORBIDDEN).json(problem);

      return;
    }

    if (err instanceof NotFoundException) {
      const problem = new ProblemDocument({
        type: NotFoundException.name,
        title: err.message,
        detail: isProduction ? undefined : err.stack,
        status: err.getStatus(),
      });

      Logger.error(serializeObject(problem));

      response.status(HttpStatus.NOT_FOUND).json(problem);

      return;
    }

    if (err instanceof ConflictException) {
      const problem = new ProblemDocument({
        type: ConflictException.name,
        title: err.message,
        detail: isProduction ? undefined : err.stack,
        status: err.getStatus(),
      });

      Logger.error(serializeObject(problem));

      response.status(HttpStatus.CONFLICT).json(problem);

      return;
    }

    if (err instanceof HttpException) {
      const problem = new ProblemDocument({
        type: HttpException.name,
        title: err.message,
        detail: isProduction ? undefined : err.stack,
        status: err.getStatus(),
      });

      Logger.error(serializeObject(problem));

      response.status(err.getStatus()).json(problem);

      return;
    }

    if (err instanceof ValidationError) {
      const problem = new ProblemDocument({
        type: ValidationError.name,
        title: err.message,
        detail: isProduction ? undefined : err.stack,
        status: HttpStatus.BAD_REQUEST,
      });

      Logger.error(serializeObject(problem));

      response.status(HttpStatus.BAD_REQUEST).json(problem);

      return;
    }

    const problem = new ProblemDocument({
      type: 'INTERNAL_SERVER_ERROR',
      title: err.message,
      detail: isProduction ? undefined : err.stack,
      status: err.statusCode || 500,
    });

    Logger.error(serializeObject(problem));

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(problem);

    return;
  }
}
