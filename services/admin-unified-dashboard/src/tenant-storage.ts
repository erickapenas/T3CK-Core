import React from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  setDoc,
  collection,
  orderBy,
  query,
  limit,
} from 'firebase/firestore';

// Firebase configuration from env
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBMneYzvAxa35RCpqmTl5wnII4YweMqiIw',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 't3ck-core-78a6f.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 't3ck-core-78a6f',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 't3ck-core-78a6f.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '961293842895',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:961293842895:web:0d182b329e341af718baba',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

const ADMIN_PREFS_COLLECTION = 'admin_preferences';
const TENANTS_COLLECTION = 'tenants';
const USERS_COLLECTION = 'users';

export type FirestoreTenant = {
  id: string;
  tenantId?: string;
  companyName?: string;
  domain?: string;
  contactName?: string;
  contactEmail?: string;
  adminEmail?: string | null;
  plan?: string;
  status?: string;
  numberOfSeats?: number;
  region?: string;
  billingAddress?: string | null;
  billingCountry?: string | null;
  billingZipCode?: string | null;
  monthlyBudget?: number;
  createdAt?: string;
  updatedAt?: string;
  provisionedAt?: string;
  provisioningJobId?: string;
  [key: string]: any;
};

export type FirestoreUser = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: 'active' | 'inactive' | 'pending' | 'archived';
  tenantId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
};

export type FirestoreProduct = {
  docId?: string;
  id: string;
  tenantId?: string;
  sku?: string;
  name?: string;
  slug?: string;
  description?: string;
  shortDescription?: string;
  mainImageUrl?: string;
  price?: number;
  oldPrice?: number;
  costPrice?: number;
  currency?: 'BRL' | 'USD';
  stockQuantity?: number;
  manageStock?: boolean;
  weight?: number;
  height?: number;
  width?: number;
  length?: number;
  properties?: Record<string, any>;
  isActive?: boolean;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  [key: string]: any;
};

/**
 * Save tenant selection to Firebase Firestore
 */
export async function saveTenantSelection(tenantId: string): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) return;

    const prefsDoc = doc(db, ADMIN_PREFS_COLLECTION, user.uid);
    await setDoc(
      prefsDoc,
      {
        selectedTenantId: tenantId,
        lastUpdated: Date.now(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error('Error saving tenant selection:', error);
  }
}

/**
 * Load tenant selection from Firebase Firestore
 */
export async function loadTenantSelection(defaultTenantId: string): Promise<string> {
  try {
    const user = auth.currentUser;
    if (!user) return defaultTenantId;

    const prefsDoc = doc(db, ADMIN_PREFS_COLLECTION, user.uid);
    const snapshot = await getDoc(prefsDoc);

    return snapshot.exists() && snapshot.data().selectedTenantId
      ? snapshot.data().selectedTenantId
      : defaultTenantId;
  } catch (error) {
    console.error('Error loading tenant selection:', error);
    return defaultTenantId;
  }
}

export async function listTenantsFromFirestore(): Promise<FirestoreTenant[]> {
  const snapshot = await getDocs(
    query(collection(db, TENANTS_COLLECTION), orderBy('createdAt', 'desc'), limit(200))
  );

  return snapshot.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<FirestoreTenant, 'id'>),
  }));
}

export async function saveTenantToFirestore(
  tenant: Omit<FirestoreTenant, 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<FirestoreTenant> {
  const now = new Date().toISOString();
  const id = tenant.id || tenant.tenantId || `tenant-${Date.now()}`;
  const payload: FirestoreTenant = {
    ...tenant,
    id,
    tenantId: tenant.tenantId || id,
    createdAt: tenant.createdAt || now,
    updatedAt: now,
    status: tenant.status || 'PENDING',
  };

  await setDoc(doc(db, TENANTS_COLLECTION, id), payload, { merge: true });
  return payload;
}

export async function deleteTenantFromFirestore(tenantId: string): Promise<void> {
  await deleteDoc(doc(db, TENANTS_COLLECTION, tenantId));
}

export async function listUsersFromFirestore(): Promise<FirestoreUser[]> {
  const snapshot = await getDocs(
    query(collection(db, USERS_COLLECTION), orderBy('createdAt', 'desc'), limit(200))
  );

  return snapshot.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<FirestoreUser, 'id'>),
  }));
}

export async function saveUserToFirestore(
  user: Omit<FirestoreUser, 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<FirestoreUser> {
  const now = new Date().toISOString();
  const id = user.id || `user-${Date.now()}`;
  const payload: FirestoreUser = {
    ...user,
    id,
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    status: user.status || 'pending',
    tenantId: user.tenantId || null,
    createdAt: user.createdAt || now,
    updatedAt: now,
  };

  await setDoc(doc(db, USERS_COLLECTION, id), payload, { merge: true });
  return payload;
}

export async function deleteUserFromFirestore(userId: string): Promise<void> {
  await deleteDoc(doc(db, USERS_COLLECTION, userId));
}

export async function syncTenantContactFromUser(user: FirestoreUser): Promise<void> {
  if (!user.tenantId) return;

  const tenantRef = doc(db, TENANTS_COLLECTION, user.tenantId);
  const snapshot = await getDoc(tenantRef);
  if (!snapshot.exists()) return;

  await setDoc(
    tenantRef,
    {
      contactName: user.name || '',
      contactEmail: user.email || '',
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function listProductsFromFirestore(tenantId: string): Promise<FirestoreProduct[]> {
  if (!tenantId) {
    return [];
  }

  const snapshot = await getDocs(
    query(
      collection(db, TENANTS_COLLECTION, tenantId, 'products'),
      orderBy('createdAt', 'desc'),
      limit(200)
    )
  );

  return snapshot.docs
    .map((item) => ({
      docId: item.id,
      id: item.id,
      ...(item.data() as Omit<FirestoreProduct, 'id'>),
    }))
    .sort((a: FirestoreProduct, b: FirestoreProduct) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
}

export async function saveProductToFirestore(
  product: Omit<FirestoreProduct, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'> & {
    id?: string;
  },
  previousDocId?: string
): Promise<FirestoreProduct> {
  if (!product.tenantId) {
    throw new Error('tenantId is required');
  }

  const now = new Date().toISOString();
  const userId = auth.currentUser?.uid || 'system';
  const id = product.id || `product-${Date.now()}`;
  const docId = product.name || previousDocId || `product-${Date.now()}`;
  const payload: FirestoreProduct = {
    ...product,
    id,
    docId,
    tenantId: product.tenantId || '',
    sku: product.sku || '',
    name: product.name || '',
    slug: product.slug || '',
    description: product.description || '',
    shortDescription: product.shortDescription || '',
    mainImageUrl: product.mainImageUrl || '',
    price: product.price ?? 0,
    oldPrice: product.oldPrice ?? 0,
    costPrice: product.costPrice ?? 0,
    currency: product.currency || 'BRL',
    stockQuantity: product.stockQuantity ?? 0,
    manageStock: product.manageStock ?? true,
    weight: product.weight ?? 0,
    height: product.height ?? 0,
    width: product.width ?? 0,
    length: product.length ?? 0,
    properties: product.properties || {},
    isActive: product.isActive ?? true,
    isDeleted: product.isDeleted ?? false,
    createdAt: product.createdAt || now,
    updatedAt: now,
    createdBy: product.createdBy || userId,
    updatedBy: userId,
  };

  await setDoc(doc(db, TENANTS_COLLECTION, product.tenantId, 'products', docId), payload, {
    merge: true,
  });

  if (previousDocId && previousDocId !== docId) {
    await deleteDoc(doc(db, TENANTS_COLLECTION, product.tenantId, 'products', previousDocId));
  }

  return payload;
}

export async function deleteProductFromFirestore(
  tenantId: string,
  productDocId: string
): Promise<void> {
  await deleteDoc(doc(db, TENANTS_COLLECTION, tenantId, 'products', productDocId));
}

/**
 * React hook for Firebase tenant storage
 */
export function useFirebaseTenantStorage(initialTenant: string = 'tenant-demo') {
  const [tenant, setTenant] = React.useState(initialTenant);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadTenantSelection(initialTenant)
      .then(setTenant)
      .finally(() => setLoading(false));
  }, []);

  const updateTenant = async (newTenant: string) => {
    setTenant(newTenant);
    await saveTenantSelection(newTenant);
  };

  return { tenant, loading, updateTenant };
}
