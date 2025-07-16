import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Inject } from '@nestjs/common';
import _const from '../utils/const';
import { IRateLimitRepository } from '../../domain/repositories/irateLimit.repository';
import logger from '../utils/winston.util';

@Injectable()
export class TikTokRateLimitMiddleware implements NestMiddleware {
  private readonly RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
  private readonly MAX_REQUESTS_PER_WINDOW = 100; // TikTok API limit

  constructor(
    @Inject(_const.IRATELIMIT_REPOSITORY)
    private readonly rateLimitRepository: IRateLimitRepository,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const clientId = req.ip || 'unknown';
    const route = 'tiktok-api';
    
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - this.RATE_LIMIT_WINDOW);
      
      // Get existing rate limit record for this IP and route
      let rateLimit = await this.rateLimitRepository.getAsync(clientId, route);
      
      // If no record exists or it's expired, create a new one
      if (!rateLimit || rateLimit.expiresAt <= now) {
        const expiresAt = new Date(now.getTime() + this.RATE_LIMIT_WINDOW);
        rateLimit = await this.rateLimitRepository.createAsync(clientId, route, expiresAt);
      }
      
      // Check if rate limit is exceeded
      if (rateLimit.count >= this.MAX_REQUESTS_PER_WINDOW) {
        logger.warn(`TikTok rate limit exceeded for IP: ${clientId}`);
        
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'Too many requests to TikTok API. Please try again later.',
          retryAfter: Math.ceil((rateLimit.expiresAt.getTime() - now.getTime()) / 1000)
        });
      }
      
      // Increment the request count
      rateLimit.count += 1;
      await this.rateLimitRepository.updateAsync(rateLimit);
      
      // Log the request
      await this.rateLimitRepository.createRateLimitLog(rateLimit);
      
      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': this.MAX_REQUESTS_PER_WINDOW.toString(),
        'X-RateLimit-Remaining': (this.MAX_REQUESTS_PER_WINDOW - rateLimit.count).toString(),
        'X-RateLimit-Reset': rateLimit.expiresAt.getTime().toString()
      });
      
      next();
    } catch (error) {
      logger.error('Error in TikTok rate limit middleware', error);
      // Continue on error to not block requests
      next();
    }
  }
}
