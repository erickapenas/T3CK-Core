import { DownstreamError } from './errors';
import { InternalHttpClient, UserContext } from './types';

type ApiEnvelope<T> = {
  data?: T;
  error?: string;
  message?: string;
};

export function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | undefined>
): string {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export class FetchInternalHttpClient implements InternalHttpClient {
  constructor(private readonly internalToken = process.env.INTERNAL_SERVICE_TOKEN || '') {}

  async get<T>(url: string, context: UserContext): Promise<T> {
    return this.request<T>('GET', url, context);
  }

  async patch<T>(url: string, body: unknown, context: UserContext): Promise<T> {
    return this.request<T>('PATCH', url, context, body);
  }

  private async request<T>(
    method: 'GET' | 'PATCH',
    url: string,
    context: UserContext,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Tenant-ID': context.tenantId,
      'X-User-ID': context.userId,
      'X-User-Email': context.email,
      'X-User-Roles': context.roles.join(','),
    };

    if (this.internalToken) {
      headers['X-Internal-Service-Token'] = this.internalToken;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T> | T;
    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && ('error' in payload || 'message' in payload)
          ? String((payload as ApiEnvelope<T>).error || (payload as ApiEnvelope<T>).message)
          : `Upstream request failed: ${response.status}`;
      throw new DownstreamError(response.status, message, url);
    }

    if (payload && typeof payload === 'object' && 'data' in payload) {
      return (payload as ApiEnvelope<T>).data as T;
    }

    return payload as T;
  }
}
