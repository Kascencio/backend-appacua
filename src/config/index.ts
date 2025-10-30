import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'production',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'change_me',
  databaseUrl: process.env.DATABASE_URL
};
