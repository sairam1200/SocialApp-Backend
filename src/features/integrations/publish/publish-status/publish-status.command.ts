import { IQuery } from '@nestjs/cqrs';

export class PublishStatusQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly publishJobId: string,
  ) {}
}
