import { createLogger, format, transports } from 'winston';
import * as fs from 'fs';
import * as path from 'path';
import * as DailyRotateFile from 'winston-daily-rotate-file';
import configs from '../../configs';

const dir = configs.log.path;
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const timestampFormat = 'YYYY-MM-DD HH:mm:ss:ms';

const fileFormat = format.combine(
  format.timestamp({ format: timestampFormat }),
  format.errors({ stack: true }),
  format.json()
);

const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: timestampFormat }),
  format.printf(({ timestamp, level, message, stack }) => {
    return `[${timestamp}] ${level}: ${stack || message}`;
  })
);

const fileTransport = new DailyRotateFile({
  level: 'info',
  filename: path.join(dir, '%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '21d',
  handleExceptions: true,
});

const logger = createLogger({
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

export default logger;