import jwt from 'jsonwebtoken';
import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as admin from 'firebase-admin';
import { Logger } from '@t3ck/shared';

export interface TokenPayload {
  tenantId: string;
  userId: string;
  email: string;
  roles: string[];
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
  private jwtSecret: string;

  constructor() {
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.logger = new Logger('auth-service');
    this.jwtSecret = process.env.JWT_SECRET || '';
  }

  async authenticateWithFirebase(idToken: string): Promise<TokenPayload> {
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      
      return {
        tenantId: decodedToken.tenant_id || '',
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
    return jwt.sign(payload, this.jwtSecret, {
      algorithm: 'RS256',
      expiresIn: '1h',
      issuer: 't3ck',
      audience: 't3ck-api',
    });
  }

  async verifyJWT(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        algorithms: ['RS256'],
        issuer: 't3ck',
        audience: 't3ck-api',
      }) as TokenPayload;

      return decoded;
    } catch (error) {
      this.logger.error('JWT verification failed', { error });
      throw new Error('Invalid token');
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
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
}
