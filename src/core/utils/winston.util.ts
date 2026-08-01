import { format, transports, createLogger } from 'winston';
import * as fs from 'fs';
import * as path from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';
import configs from '../../configs';

// Ensure log directory exists
const dir = configs.log.path;
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const timestampFormat = 'YYYY-MM-DD HH:mm:ss:ms';

function getCallerInfo(): { file?: string; method?: string } {
  const stack = new Error().stack?.split('\n') || [];

  for (let i = 3; i < stack.length; i++) {
    const line = stack[i];

    if (
      line.includes('node_modules') ||
      line.includes('winston') ||
      line.includes('winston.util.ts') ||
      line.includes('Logger') ||
      line.includes('getCallerInfo') ||
      line.includes('addCallerInfo') ||
      line.includes('lib_') ||
      line.includes('internal/') ||
      line.includes('async_hooks') ||
      line.includes('events') ||
      line.includes('stream') ||
      line.includes('util') ||
      line.includes('buffer') ||
      line.includes('process')
    ) {
      continue;
    }

    // Parse the stack trace line
    const match =
      line.match(/\s+at (.+?) \((.+):(\d+):(\d+)\)/) ||
      line.match(/\s+at (.+):(\d+):(\d+)/);

    const normalizePath = (fullPath: string) => {
      const normalized = path.normalize(fullPath);
      const parts = normalized.split(path.sep);
      const srcIndex = parts.lastIndexOf('src');
      return srcIndex !== -1
        ? parts.slice(srcIndex).join(path.sep)
        : parts.slice(-2).join(path.sep);
    };

    if (match) {
      if (match.length === 5) {
        return {
          method: match[1],
          file: normalizePath(match[2]),
        };
      } else if (match.length === 4) {
        return {
          file: normalizePath(match[1]),
        };
      }
    }
  }

  return {};
}

const fileTransport = new DailyRotateFile({
  level: 'info',
  filename: path.join(dir, '%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '21d',
  handleExceptions: true,
});

const fileFormat = format.combine(
  format.timestamp({ format: timestampFormat }),
  format.errors({ stack: true }),
  format.json(),
);

const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: timestampFormat }),
  format.printf(
    ({ timestamp, level, message, stack, file, method, ...meta }: any) => {
      const fileInfo = file ? ` | ${file}` : '';
      const methodInfo = method ? ` -> ${method}` : '';
      const metaString = Object.keys(meta).length
        ? ` ${JSON.stringify(meta)}`
        : '';
      return `[${timestamp}] ${level}: ${stack || message}${fileInfo}${methodInfo}${metaString}`;
    },
  ),
);

const baseLogger = createLogger({
  level: configs.log.level,
  format: fileFormat,
  transports: [
    fileTransport,
    new transports.Console({
      level: configs.log.level,
      format: consoleFormat,
    }),
  ],
  exitOnError: false,
});

interface LogObject {
  [key: string]: any;
}

class Logger {
  private readonly sensitiveKeys = [
    'password',
    'token',
    'access_token',
    'refresh_token',
    'accessToken',
    'refreshToken',
    'authorization',
    'auth',
    'secret',
    'key',
    'apiKey',
    'api_key',
    'clientSecret',
    'client_secret',
    'sessionId',
    'session_id',
    'cookie',
    'cookies',
    'email',
    'phone',
    'ssn',
    'social_security',
    'credit_card',
    'creditCard',
    'cvv',
    'pin',
    'otp',
    'verification_code',
    'verificationCode',
    'private_key',
    'privateKey',
    'signature',
    'hash',
    'csrf',
    'state',
  ];

  private readonly sensitivePatterns = [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // Credit card
    /\b\d{3}-?\d{2}-?\d{4}\b/g, // SSN
    /Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/g, // Bearer
    /[A-Za-z0-9+/]{40,}={0,2}/g, // Base64 tokens
    /sk_[a-zA-Z0-9]{24}/g,
    /pk_[a-zA-Z0-9]{24}/g,
    /ya29\.[a-zA-Z0-9_-]+/g,
    /xox[baprs]-[a-zA-Z0-9-]+/g,
    /ghp_[a-zA-Z0-9]{36}/g,
    /gho_[a-zA-Z0-9]{36}/g,
    /fb[0-9]+/g,
  ];

  private readonly enableRedaction = process.env.NODE_ENV === 'production';

  private redactSensitiveData(obj: any, seen = new WeakSet()): any {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') return this.redactSensitiveString(obj);

    if (typeof obj === 'number' || typeof obj === 'boolean') return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactSensitiveData(item, seen));
    }

    if (typeof obj === 'object') {
      if (seen.has(obj)) return '[Circular]';
      seen.add(obj);

      const redacted: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (this.isSensitiveKey(key)) {
          redacted[key] = this.redactValue(value);
        } else {
          redacted[key] = this.redactSensitiveData(value, seen);
        }
      }
      return redacted;
    }

    return obj;
  }

  private redactSensitiveString(str: string): string {
    if (!this.enableRedaction) return str;

    let redacted = str;
    this.sensitivePatterns.forEach((pattern) => {
      redacted = redacted.replace(pattern, this.getRedactionString);
    });
    return redacted;
  }

  private isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return this.sensitiveKeys.some((sensitiveKey) =>
      lowerKey.includes(sensitiveKey.toLowerCase()),
    );
  }

  private redactValue(value: any): string {
    if (value === null || value === undefined) return value;

    const str = String(value);
    if (str.length <= 4) return '[REDACTED]';

    return `${str.substring(0, 2)}${'*'.repeat(Math.min(str.length - 4, 10))}${str.substring(str.length - 2)}`;
  }

  private getRedactionString(match: string): string {
    if (match.length <= 4) return '[REDACTED]';
    return `${match.substring(0, 2)}${'*'.repeat(Math.min(match.length - 4, 10))}${match.substring(match.length - 2)}`;
  }

  private formatMessage(
    message: string,
    meta?: LogObject,
  ): { message: string; meta?: LogObject } {
    const redactedMeta =
      meta && typeof meta === 'object'
        ? this.redactSensitiveData(meta)
        : undefined;
    const redactedMessage = this.redactSensitiveString(message);
    return { message: redactedMessage, meta: redactedMeta };
  }

  info(message: string, meta: Record<string, any> = {}) {
    const caller = getCallerInfo(); // Capture caller info here
    const { message: safeMessage, meta: safeMeta } = this.formatMessage(
      message,
      meta,
    );
    baseLogger.info({
      message: safeMessage,
      file: caller.file,
      method: caller.method,
      ...safeMeta,
    });
  }

  warn(message: string, meta: Record<string, any> = {}) {
    const caller = getCallerInfo(); // Capture caller info here
    const { message: safeMessage, meta: safeMeta } = this.formatMessage(
      message,
      meta,
    );
    baseLogger.warn({
      message: safeMessage,
      file: caller.file,
      method: caller.method,
      ...safeMeta,
    });
  }

  error(message: string, meta: Record<string, any> = {}) {
    const caller = getCallerInfo(); // Capture caller info here
    const { message: safeMessage, meta: safeMeta } = this.formatMessage(
      message,
      meta,
    );
    baseLogger.error({
      message: safeMessage,
      file: caller.file,
      method: caller.method,
      ...safeMeta,
    });
  }

  debug(message: string, meta: Record<string, any> = {}) {
    const caller = getCallerInfo(); // Capture caller info here
    const { message: safeMessage, meta: safeMeta } = this.formatMessage(
      message,
      meta,
    );
    baseLogger.debug({
      message: safeMessage,
      file: caller.file,
      method: caller.method,
      ...safeMeta,
    });
  }

  verbose(message: string, meta: Record<string, any> = {}) {
    const caller = getCallerInfo(); // Capture caller info here
    const { message: safeMessage, meta: safeMeta } = this.formatMessage(
      message,
      meta,
    );
    baseLogger.verbose({
      message: safeMessage,
      file: caller.file,
      method: caller.method,
      ...safeMeta,
    });
  }

  log(level: string, message: string, meta: Record<string, any> = {}) {
    const caller = getCallerInfo(); // Capture caller info here
    const { message: safeMessage, meta: safeMeta } = this.formatMessage(
      message,
      meta,
    );
    baseLogger.log(level, {
      message: safeMessage,
      file: caller.file,
      method: caller.method,
      ...safeMeta,
    });
  }
}

export default new Logger();
