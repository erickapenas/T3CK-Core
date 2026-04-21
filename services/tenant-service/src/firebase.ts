import * as admin from 'firebase-admin';
import { Logger } from '@t3ck/shared';

const logger = new Logger('tenant-firebase');

let initialized = false;
let firestore: admin.firestore.Firestore | null = null;

export function initializeFirestore(): admin.firestore.Firestore | null {
  if (firestore) {
    return firestore;
  }

  try {
    if (!initialized) {
      const appName = 'tenant-service';
      const existingApp = admin.apps.find((app): app is admin.app.App => {
        if (!app) {
          return false;
        }
        return app.name === appName;
      });

      if (existingApp) {
        initialized = true;
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH) {
        const credentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
        const serviceAccount = require(credentialPath);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, appName);
        initialized = true;
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, appName);
        initialized = true;
      } else {
        admin.initializeApp({ credential: admin.credential.applicationDefault() }, appName);
        initialized = true;
      }
    }

    const app =
      admin.apps.find((item): item is admin.app.App => {
        if (!item) {
          return false;
        }
        return item.name === 'tenant-service';
      }) || admin.app();
    firestore = app.firestore();
    logger.info('Firestore initialized for tenant-service');
    return firestore;
  } catch (error) {
    logger.warn('Firestore unavailable for tenant-service, using fallback storage', {
      error: (error as Error).message,
    });
    firestore = null;
    return null;
  }
}

export function getFirestore(): admin.firestore.Firestore | null {
  return firestore || initializeFirestore();
}
