/**
 * Sentry Error Tracking - Simplified
 * For Sentry SDK v10.38.0
 */

import * as Sentry from '@sentry/node';

/**
 * Initialize Sentry
 */
export function initSentry(serviceName: string): void {
  const dsn = process.env.SENTRY_DSN;
  const environment = process.env.NODE_ENV || 'development';
  const version = process.env.VERSION || '1.0.0';

  if (!dsn) {
    console.warn(`[${serviceName}] SENTRY_DSN not set, error tracking disabled`);
    return;
  }

  Sentry.init({
    dsn,
    environment,
    release: version,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Filter sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers['x-api-key'];
      }
      // Don't send 4xx errors
      if (event.exception) {
        const status = (event.tags?.['status_code'] as string) || '500';
        if (status.startsWith('4')) return null;
      }
      return event;
    }
  });

  console.info(`[${serviceName}] Sentry initialized (${environment})`);
}

/**
 * Setup Express error catching middleware
 */
export function setupSentryErrorHandler(app: any): void {
  // Global error handler
  app.use((err: any, _req: any, res: any, _next: any) => {
    Sentry.captureException(err);
    res.statusCode = err.statusCode || 500;
    res.end();
  });
}

/**
 * Capture exception
 */
export function captureException(error: unknown, context?: Record<string, any>): void {
  if (context) {
    Sentry.withScope((scope) => {
      scope.setContext('custom', context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Capture message
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info'
): void {
  Sentry.captureMessage(message, level);
}

/**
 * Set user
 */
export function setSentryUser(userId: string, email?: string, username?: string): void {
  Sentry.setUser({
    id: userId,
    email,
    username
  });
}

/**
 * Clear user
 */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}

/**
 * Add breadcrumb
 */
export function addBreadcrumb(
  message: string,
  category: string,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info'
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    timestamp: Date.now() / 1000
  });
}

/**
 * Flush Sentry
 */
export async function flushSentry(timeout: number = 2000): Promise<boolean> {
  try {
    return await Sentry.close(timeout);
  } catch (error) {
    console.error('Error flushing Sentry:', error);
    return false;
  }
}
