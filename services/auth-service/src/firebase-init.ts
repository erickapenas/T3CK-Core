import * as admin from 'firebase-admin';
import { Logger } from '@t3ck/shared';

let initialized = false;

export function initializeFirebase(): void {
  if (initialized) {
    return;
  }

  const logger = new Logger('firebase-init');

  try {
    // Tentar usar service account se disponível
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH) {
      const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // JSON string na variável de ambiente
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
      // Usar Application Default Credentials (GCP)
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    }

    initialized = true;
    logger.info('Firebase Admin initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin', { error });
    throw error;
  }
}
