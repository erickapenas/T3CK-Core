import * as path from 'path';

import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', `.env.${process.env.ENVIRONMENT || 'staging'}`) });

export const config = {
  environment: process.env.ENVIRONMENT || 'staging',
  baseUrl:
    process.env.BASE_URL ||
    (process.env.ENVIRONMENT === 'production'
      ? process.env.PROD_URL || 'https://api.t3ck.io'
      : process.env.STAGING_URL || 'http://localhost:3000'),
  testUser: {
    email: process.env.TEST_EMAIL || 'test@example.com',
    password: process.env.TEST_PASSWORD || 'password123',
  },
  timeout: parseInt(process.env.TEST_TIMEOUT || '10000', 10),
  retries: parseInt(process.env.TEST_RETRIES || '3', 10),
};
