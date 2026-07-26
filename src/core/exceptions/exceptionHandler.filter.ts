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
import { randomUUID } from 'crypto';
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
        serializeObject({
          ...problem,
          detail: err.stack,
          originalMessage: err.message,
        }),
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
        serializeObject({
          ...problem,
          detail: err.stack,
          originalMessage: err.message,
        }),
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

    // Unhandled error — nothing above recognised it, so by definition we do not know what
    // it contains.
    //
    // This branch used to send `err.message` as the client-facing `title`, **including in
    // production**. The stack was correctly withheld and the message was not, which is the
    // half that actually leaks: an unhandled error here is a TypeORM, driver or programming
    // error, and its message is things like
    //
    //   relation "userRoles" already exists
    //   connect ECONNREFUSED 10.0.0.5:5432
    //   Cannot read properties of undefined (reading 'aggregated')
    //
    // Each names internal schema, internal network topology, or internal shape — to any
    // caller, unauthenticated included. And none of it tells a user anything they can act on,
    // so withholding it costs them nothing.
    //
    // Instead: a fixed, friendly title plus a `reference` the caller can quote. The real
    // message and stack go to the log under that same reference, so the information is not
    // lost — it moves to the audience that can use it. The frontend renders `reference`
    // verbatim on its error screens, which is what makes a support conversation possible
    // without exposing internals.
    const reference = randomUUID();

    const problem = new ProblemDocument({
      type: 'INTERNAL_SERVER_ERROR',
      title: 'Something went wrong on our end. Please try again in a moment.',
      // Outside production the real message is genuinely useful and the audience is a
      // developer, so it stays.
      detail: isProduction ? undefined : `${err.message}\n\n${err.stack ?? ''}`,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });

    // Assigned after construction, not passed to the constructor. `ProblemDocument` copies
    // only the members it knows about, so an extension given as a constructor argument is
    // silently dropped — the reference reached neither the client nor anything else, which
    // defeats the whole point of telling the user to quote it. RFC 7807 §3.2 explicitly
    // allows extension members; the library just will not build them for you.
    (problem as unknown as Record<string, unknown>).reference = reference;

    Logger.error(
      serializeObject({
        reference,
        type: 'INTERNAL_SERVER_ERROR',
        originalMessage: err?.message,
        stack: err?.stack,
        name: err?.name,
      }),
    );

    // Always 500 here. The previous code put `err.statusCode || 500` in the body while
    // sending a 500 header, so a body could claim 400 on a 500 response.
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(problem);

    return;
  }
}
