import axios from 'axios';
import crypto from 'crypto';
import { Logger } from '@t3ck/shared';

export interface OidcTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export class OidcService {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('oidc-service');
  }

  getAuthorizeUrl(params?: { state?: string; scope?: string; redirectUri?: string }): string {
    const domain = process.env.COGNITO_DOMAIN || '';
    const clientId = process.env.COGNITO_CLIENT_ID || '';
    const redirectUri = params?.redirectUri || process.env.COGNITO_CALLBACK_URL || '';
    const scope = params?.scope || 'openid email profile';
    const state = params?.state || cryptoRandomState();

    if (!domain || !clientId || !redirectUri) {
      throw new Error('Missing Cognito OIDC configuration');
    }

    const url = new URL(`https://${domain}/oauth2/authorize`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', scope);
    url.searchParams.set('state', state);

    return url.toString();
  }

  async exchangeToken(params: { code?: string; refreshToken?: string; redirectUri?: string }): Promise<OidcTokenResponse> {
    const domain = process.env.COGNITO_DOMAIN || '';
    const clientId = process.env.COGNITO_CLIENT_ID || '';
    const clientSecret = process.env.COGNITO_CLIENT_SECRET || '';
    const redirectUri = params.redirectUri || process.env.COGNITO_CALLBACK_URL || '';

    if (!domain || !clientId || !clientSecret) {
      throw new Error('Missing Cognito client configuration');
    }

    const tokenUrl = `https://${domain}/oauth2/token`;
    const payload = new URLSearchParams();

    if (params.code) {
      payload.set('grant_type', 'authorization_code');
      payload.set('code', params.code);
      payload.set('redirect_uri', redirectUri);
    } else if (params.refreshToken) {
      payload.set('grant_type', 'refresh_token');
      payload.set('refresh_token', params.refreshToken);
    } else {
      throw new Error('Missing code or refresh token');
    }

    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    try {
      const response = await axios.post(tokenUrl, payload.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${authHeader}`,
        },
      });

      return response.data as OidcTokenResponse;
    } catch (error) {
      this.logger.error('OIDC token exchange failed', { error: (error as Error).message });
      throw error;
    }
  }

  async getUserInfo(accessToken: string): Promise<Record<string, unknown>> {
    const domain = process.env.COGNITO_DOMAIN || '';
    const userInfoUrl = `https://${domain}/oauth2/userInfo`;

    if (!domain) {
      throw new Error('Missing Cognito domain');
    }

    try {
      const response = await axios.get(userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return response.data;
    } catch (error) {
      this.logger.error('OIDC userinfo failed', { error: (error as Error).message });
      throw error;
    }
  }

  async getDiscovery(): Promise<Record<string, unknown>> {
    const domain = process.env.COGNITO_DOMAIN || '';
    const url = `https://${domain}/.well-known/openid-configuration`;

    if (!domain) {
      throw new Error('Missing Cognito domain');
    }

    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      this.logger.error('OIDC discovery failed', { error: (error as Error).message });
      throw error;
    }
  }
}

function cryptoRandomState(): string {
  return crypto.randomBytes(12).toString('hex');
}
