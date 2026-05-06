import * as admin from 'firebase-admin';
import { getFirestore, initializeFirestore } from '../firebase';

export interface FirebaseRuntimeConfig {
  projectId?: string;
  serviceAccountKeyPath?: string;
}

export function createFirebaseApp(_config?: FirebaseRuntimeConfig): admin.app.App | null {
  const firestore = initializeFirestore();
  return firestore ? admin.app('admin-service') : null;
}

export function createFirestoreDatabase(
  config?: FirebaseRuntimeConfig
): admin.firestore.Firestore | null {
  createFirebaseApp(config);
  return getFirestore();
}
