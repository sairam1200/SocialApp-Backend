import configs from '../../configs';
import { HttpContext } from '../middlewares/httpContext.middleware';

/**
 * Gets the redirect URL for OAuth callbacks.
 * In non-production environments, it checks for the 'x-client-origin' header
 * to allow dynamic frontend URLs for local development.
 * 
 * @param defaultRedirectUrl - The default redirect URL to use (usually from configs)
 * @returns The redirect URL to use for OAuth callbacks
 */
export function getRedirectUrl(defaultRedirectUrl: string): string {
  let redirectUrl = defaultRedirectUrl;

  if (configs.env !== 'production') {
    const headers = HttpContext.headers;
    if (headers) {
      console.log("Headers: ", headers)
      const clientOrigin = headers['x-redirect-url'];
      if (clientOrigin) {
        const originValue = Array.isArray(clientOrigin) ? clientOrigin[0] : clientOrigin;
        if (originValue && typeof originValue === 'string') {
          redirectUrl = originValue.replace(/\/$/, '');
          console.log("This is the redirect url: ", redirectUrl)
        }
      }
    }
  }

  return redirectUrl;
}

