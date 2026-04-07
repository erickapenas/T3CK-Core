import { initializeApp } from 'firebase/app'
import { getAuth, Auth } from 'firebase/auth'
import { getFirestore, Firestore, doc, getDoc, setDoc } from 'firebase/firestore'

// Firebase configuration from env
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBMneYzvAxa35RCpqmTl5wnII4YweMqiIw',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 't3ck-core-78a6f.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 't3ck-core-78a6f',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 't3ck-core-78a6f.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '961293842895',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:961293842895:web:0d182b329e341af718baba',
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
export const auth: Auth = getAuth(app)
export const db: Firestore = getFirestore(app)

const ADMIN_PREFS_COLLECTION = 'admin_preferences'

/**
 * Save tenant selection to Firebase Firestore
 */
export async function saveTenantSelection(tenantId: string): Promise<void> {
  try {
    const user = auth.currentUser
    if (!user) return

    const prefsDoc = doc(db, ADMIN_PREFS_COLLECTION, user.uid)
    await setDoc(prefsDoc, {
      selectedTenantId: tenantId,
      lastUpdated: Date.now(),
    }, { merge: true })
  } catch (error) {
    console.error('Error saving tenant selection:', error)
  }
}

/**
 * Load tenant selection from Firebase Firestore
 */
export async function loadTenantSelection(defaultTenantId: string): Promise<string> {
  try {
    const user = auth.currentUser
    if (!user) return defaultTenantId

    const prefsDoc = doc(db, ADMIN_PREFS_COLLECTION, user.uid)
    const snapshot = await getDoc(prefsDoc)

    return snapshot.exists() && snapshot.data().selectedTenantId
      ? snapshot.data().selectedTenantId
      : defaultTenantId
  } catch (error) {
    console.error('Error loading tenant selection:', error)
    return defaultTenantId
  }
}

/**
 * React hook for Firebase tenant storage
 */
export function useFirebaseTenantStorage(initialTenant: string = 'tenant-demo') {
  const [tenant, setTenant] = React.useState(initialTenant)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    loadTenantSelection(initialTenant)
      .then(setTenant)
      .finally(() => setLoading(false))
  }, [])

  const updateTenant = async (newTenant: string) => {
    setTenant(newTenant)
    await saveTenantSelection(newTenant)
  }

  return { tenant, loading, updateTenant }
}
