import { NewsletterSubscriber } from '../entities/newsletterSubscriber.entity';

export interface INewsletterSubscriberRepository {
  tryInsertAsync(email: string): Promise<NewsletterSubscriber | null>;
}
