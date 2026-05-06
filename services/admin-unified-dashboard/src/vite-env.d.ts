/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GATEWAY_BASE_URL?: string;
  readonly VITE_TENANT_ID?: string;
  readonly VITE_ADMIN_SERVICE_URL?: string;
  readonly VITE_TENANT_SERVICE_URL?: string;
  readonly VITE_PRODUCT_SERVICE_URL?: string;
  readonly VITE_ORDER_SERVICE_URL?: string;
  readonly VITE_SHIPPING_SERVICE_URL?: string;
  readonly VITE_PAYMENT_SERVICE_URL?: string;
  readonly VITE_WEBHOOK_SERVICE_URL?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
