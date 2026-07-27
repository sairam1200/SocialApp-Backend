import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { NewsletterSubscriber } from '../../domain/entities/newsletterSubscriber.entity';
import { INewsletterSubscriberRepository } from '../../domain/repositories/inewsletterSubscriber.repository';

@Injectable()
export class NewsletterSubscriberRepository implements INewsletterSubscriberRepository {
  constructor(
    @InjectRepository(NewsletterSubscriber)
    private readonly db: Repository<NewsletterSubscriber>,
  ) {}

  public async existsAsync(email: string): Promise<boolean> {
    const count = await this.db.count({ where: { email } });
    return count > 0;
  }

  public async tryInsertAsync(
    email: string,
  ): Promise<NewsletterSubscriber | null> {
    if (await this.existsAsync(email)) {
      return null;
    }

    try {
      const subscriber = this.db.create({ email });
      return await this.db.save(subscriber);
    } catch {
      return null;
    }
  }
}
