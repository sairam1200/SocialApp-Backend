import { Entity, Column, Unique } from 'typeorm';
import { BaseEntity } from '../baseEntity';

@Entity({ name: 'newsletter_subscribers', schema: 'notification' })
@Unique(['email'])
export class NewsletterSubscriber extends BaseEntity {
  @Column({ type: 'varchar', length: 320 })
  email: string;

  constructor(request: Partial<NewsletterSubscriber> = {}) {
    super();
    Object.assign(this, request);
  }
}
