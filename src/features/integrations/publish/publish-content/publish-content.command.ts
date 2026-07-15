import { ICommand } from '@nestjs/cqrs';

export class PublishContentCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly linkedAccountId: string,
    public readonly platform: string,
    public readonly uploadId: string,
    public readonly title: string,
    public readonly description?: string,
    public readonly tags?: string[],
    public readonly visibility?: string,
    public readonly publishAt?: Date,
    public readonly metadata?: Record<string, any>,
  ) {}
}
