import logger from './winston.util';
import ApplicationException from '../exceptions/application.exception';

export interface TikTokErrorResponse {
  error: string;
  error_description?: string;
  log_id?: string;
}

export class TikTokErrorHandler {
  static handleApiError(error: any, context: string): never {
    if (error.response) {
      const status = error.response.status;
      const data: TikTokErrorResponse = error.response.data;
      
      logger.error(`TikTok API error in ${context}`, {
        status,
        error: data.error,
        description: data.error_description,
        logId: data.log_id,
        context
      });
      
      switch (status) {
        case 400:
          throw new ApplicationException(
            `Invalid request to TikTok API: ${data.error_description || data.error}`
          );
        case 401:
          throw new ApplicationException(
            'TikTok authentication failed. Please re-authenticate your account.'
          );
        case 403:
          throw new ApplicationException(
            'TikTok access denied. Please check your permissions and try again.'
          );
        case 429:
          throw new ApplicationException(
            'TikTok rate limit exceeded. Please try again later.'
          );
        case 500:
        case 502:
        case 503:
        case 504:
          throw new ApplicationException(
            'TikTok service is temporarily unavailable. Please try again later.'
          );
        default:
          throw new ApplicationException(
            `TikTok API error: ${data.error_description || data.error || 'Unknown error'}`
          );
      }
    } else if (error.request) {
      logger.error(`TikTok API network error in ${context}`, {
        message: error.message,
        code: error.code,
        timeout: error.code === 'ECONNABORTED',
        context
      });
      
      throw new ApplicationException(
        'Unable to connect to TikTok API. Please check your internet connection and try again.'
      );
    } else {
      logger.error(`TikTok API unexpected error in ${context}`, {
        message: error.message,
        stack: error.stack,
        context
      });
      
      throw new ApplicationException(
        'An unexpected error occurred while connecting to TikTok. Please try again.'
      );
    }
  }
  
  static handleTokenError(error: any, context: string): never {
    logger.error(`TikTok token error in ${context}`, {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      context
    });
    
    if (error.response?.status === 401) {
      throw new ApplicationException(
        'Your TikTok session has expired. Please re-authenticate your account.'
      );
    }
    
    throw new ApplicationException(
      'Failed to manage TikTok authentication tokens. Please try re-authenticating.'
    );
  }
  
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000,
    context: string = 'TikTok API'
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }
        
        // Don't retry on authentication errors
        if (error.response?.status === 401 || error.response?.status === 403) {
          break;
        }
        
        // Exponential backoff
        const delay = delayMs * Math.pow(2, attempt - 1);
        logger.warn(`${context} attempt ${attempt} failed, retrying in ${delay}ms`, {
          error: error.message,
          attempt,
          maxRetries
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    this.handleApiError(lastError, context);
  }
}
