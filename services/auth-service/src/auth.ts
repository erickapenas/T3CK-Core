import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  SetUserMFAPreferenceCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import * as admin from 'firebase-admin';
import { Logger } from '@t3ck/shared';
import { KeyManager } from './key-manager';
import { TokenStore } from './token-store';

export interface TokenPayload {
  tenantId: string;
  userId: string;
  email: string;
  roles: string[];
  tokenType?: 'access' | 'refresh';
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
}

export class AuthService {
  private cognitoClient: CognitoIdentityProviderClient;
  private logger: Logger;
  private keyManager: KeyManager;
  private tokenStore: TokenStore;
  private jwtExpirationSeconds: number;

  constructor(keyManager: KeyManager, tokenStore: TokenStore) {
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.logger = new Logger('auth-service');
    this.keyManager = keyManager;
    this.tokenStore = tokenStore;

    const parsedExpiration = Number(process.env.JWT_EXPIRATION || 3600);
    this.jwtExpirationSeconds =
      Number.isFinite(parsedExpiration) && parsedExpiration > 0 ? parsedExpiration : 3600;

    // Refresh expiration is handled by TokenStore
  }

  async authenticateWithFirebase(idToken: string): Promise<TokenPayload> {
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const tenantId = String(decodedToken.tenant_id || '').trim();

      if (!tenantId) {
        throw new Error('Firebase token missing tenant_id claim');
      }

      return {
        tenantId,
        userId: decodedToken.uid,
        email: decodedToken.email || '',
        roles: decodedToken.roles || [],
      };
    } catch (error) {
      this.logger.error('Firebase authentication failed', { error });
      throw new Error('Invalid Firebase token');
    }
  }

  async authenticateWithCognito(username: string, password: string): Promise<AuthResult> {
    try {
      const clientId = process.env.COGNITO_CLIENT_ID || '';

      const command = new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        },
      });

      const response = await this.cognitoClient.send(command);

      if (!response.AuthenticationResult) {
        throw new Error('Authentication failed');
      }

      return {
        accessToken: response.AuthenticationResult.AccessToken || '',
        refreshToken: response.AuthenticationResult.RefreshToken || '',
        idToken: response.AuthenticationResult.IdToken || '',
        expiresIn: response.AuthenticationResult.ExpiresIn || 3600,
      };
    } catch (error) {
      this.logger.error('Cognito authentication failed', { error });
      throw new Error('Invalid credentials');
    }
  }

  async generateJWT(payload: TokenPayload): Promise<string> {
    const normalizedPayload: TokenPayload = {
      ...this.requireValidTenantPayload(payload),
      tokenType: payload.tokenType || 'access',
    };

    return this.keyManager.sign(normalizedPayload, {
      expiresIn: this.jwtExpirationSeconds,
      issuer: 't3ck',
      audience: 't3ck-api',
    });
  }

  async verifyJWT(token: string): Promise<TokenPayload> {
    try {
      const decoded = await this.tokenStore.verifyToken(token);

      return decoded;
    } catch (error) {
      this.logger.error('JWT verification failed', { error });
      throw new Error('Invalid token');
    }
  }

  async verifyJWTWithTenant(token: string, tenantId: string): Promise<TokenPayload> {
    const decoded = await this.verifyJWT(token);
    if (decoded.tenantId !== tenantId) {
      throw new Error('Tenant mismatch');
    }
    return decoded;
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      const rotation = await this.tokenStore.rotateRefreshToken(refreshToken);
      return {
        accessToken: rotation.accessToken,
        refreshToken: rotation.refreshToken,
        idToken: '',
        expiresIn: this.jwtExpirationSeconds,
      };
    } catch (_jwtRefreshError) {
      // Fallback para fluxo Cognito existente
    }

    try {
      const clientId = process.env.COGNITO_CLIENT_ID || '';

      const command = new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: clientId,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
        },
      });

      const response = await this.cognitoClient.send(command);

      if (!response.AuthenticationResult) {
        throw new Error('Token refresh failed');
      }

      return {
        accessToken: response.AuthenticationResult.AccessToken || '',
        refreshToken: refreshToken,
        idToken: response.AuthenticationResult.IdToken || '',
        expiresIn: response.AuthenticationResult.ExpiresIn || 3600,
      };
    } catch (error) {
      this.logger.error('Token refresh failed', { error });
      throw new Error('Invalid refresh token');
    }
  }

  async revokeToken(token: string): Promise<void> {
    await this.tokenStore.revokeToken(token);
  }

  async issueTokens(payload: TokenPayload): Promise<AuthResult> {
    const validPayload = this.requireValidTenantPayload(payload);
    const accessToken = await this.tokenStore.issueAccessToken(
      validPayload,
      this.jwtExpirationSeconds
    );
    const refreshToken = await this.tokenStore.issueRefreshToken(validPayload);

    return {
      accessToken,
      refreshToken,
      idToken: '',
      expiresIn: this.jwtExpirationSeconds,
    };
  }

  private requireValidTenantPayload(payload: TokenPayload): TokenPayload {
    const tenantId = String(payload.tenantId || '').trim();
    const userId = String(payload.userId || '').trim();

    if (!tenantId) {
      throw new Error('tenantId is required to issue tokens');
    }
    if (!userId) {
      throw new Error('userId is required to issue tokens');
    }

    return {
      ...payload,
      tenantId,
      userId,
      roles: Array.isArray(payload.roles) ? payload.roles : [],
    };
  }

  async setupMfa(accessToken: string): Promise<{ secretCode: string; session?: string }> {
    const command = new AssociateSoftwareTokenCommand({ AccessToken: accessToken });
    const response = await this.cognitoClient.send(command);

    return {
      secretCode: response.SecretCode || '',
      session: response.Session,
    };
  }

  async verifyMfa(
    accessToken: string,
    userCode: string,
    enableMfa: boolean
  ): Promise<{ status: string }> {
    const command = new VerifySoftwareTokenCommand({
      AccessToken: accessToken,
      UserCode: userCode,
      FriendlyDeviceName: 't3ck-device',
    });

    const response = await this.cognitoClient.send(command);

    if (enableMfa) {
      const prefCommand = new SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: {
          Enabled: true,
          PreferredMfa: true,
        },
      });

      await this.cognitoClient.send(prefCommand);
    }

    return { status: response.Status || 'UNKNOWN' };
  }
}
