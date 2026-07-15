import { IQuery } from '@nestjs/cqrs';

export class PublishCapabilitiesQuery implements IQuery {
  constructor(public readonly platform?: string) {}
}
