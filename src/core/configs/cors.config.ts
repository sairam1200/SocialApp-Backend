const isProduction = process.env.NODE_ENV === 'production';

const productionOrigins = [
  'https://gaddr.com',
  'https://www.gaddr.com',
  'https://jobs.gaddr.com',
  'https://demo.gaddr.com',
  'https://dev.gaddr.com',
];

const developmentOrigins = [
  'http://localhost:3000',
  'https://localhost:3000',
  'http://localhost:5173',
  'https://almost-backtrack-drapery.ngrok-free.dev',
  'https://social-app-zeta-three.vercel.app',
];

export const CORS_ORIGINS = isProduction ? productionOrigins : [...productionOrigins, ...developmentOrigins];
