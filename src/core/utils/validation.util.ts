import Joi from 'joi';
import { BadRequestException } from '@nestjs/common';

export const password: Joi.CustomValidator<string> = (value) => {
  if (value.length < 8) {
    throw new BadRequestException('password must be at least 8 characters');
  }

  if (!value.match(/\d/) || !value.match(/[a-zA-Z]/)) {
    throw new BadRequestException(
      'password must contain at least 1 letter and 1 number',
    );
  }
  return value;
};

export const userName: Joi.CustomValidator<string> = (value) => {
  const userNameRegex = /^[a-zA-Z][a-zA-Z0-9._]{2,29}$/;

  if (!userNameRegex.test(value)) {
    throw new BadRequestException(
      'Username must start with a letter and be 3-30 characters long, containing only letters, numbers, underscores, or dots.',
    );
  }

  return value;
};
