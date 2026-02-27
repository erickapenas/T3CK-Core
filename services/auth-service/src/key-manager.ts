import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Logger } from '@t3ck/shared';

export interface KeyMaterial {
  privateKey: string;
  publicKey: string;
  createdAt: string;
  expiresAt?: string;
}

export interface KeySet {
  activeKid: string;
  keys: Record<string, KeyMaterial>;
  lastRotatedAt?: string;
}

export class KeyManager {
  private keySet: KeySet;
  private secretName?: string;
  private secretsClient?: SecretsManagerClient;
  private logger: Logger;
  private rotationDays: number;
  private autoRotate: boolean;

  private constructor(keySet: KeySet, secretName?: string) {
    this.keySet = keySet;
    this.secretName = secretName;
    this.logger = new Logger('key-manager');
    this.rotationDays = Number(process.env.JWT_KEY_ROTATION_DAYS || 90);
    this.autoRotate = process.env.AUTO_ROTATE_KEYS === 'true';

    if (secretName) {
      this.secretsClient = new SecretsManagerClient({
        region: process.env.AWS_REGION || 'us-east-1',
      });
    }
  }

  static async create(): Promise<KeyManager> {
    const secretName = process.env.JWT_KEY_SET_SECRET_NAME;

    if (secretName) {
      const client = new SecretsManagerClient({
        region: process.env.AWS_REGION || 'us-east-1',
      });

      const secretValue = await client.send(
        new GetSecretValueCommand({ SecretId: secretName })
      );

      if (secretValue.SecretString) {
        const parsed = JSON.parse(secretValue.SecretString) as KeySet;
        return new KeyManager(parsed, secretName);
      }
    }

    if (process.env.JWT_KEY_SET_JSON) {
      const parsed = JSON.parse(process.env.JWT_KEY_SET_JSON) as KeySet;
      return new KeyManager(parsed, secretName);
    }

    const privateKey = String(process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    const publicKey = String(process.env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n');

    const keySet: KeySet = {
      activeKid: 'default',
      keys: {
        default: {
          privateKey,
          publicKey,
          createdAt: new Date().toISOString(),
        },
      },
      lastRotatedAt: new Date().toISOString(),
    };

    return new KeyManager(keySet, secretName);
  }

  getActiveKid(): string {
    return this.keySet.activeKid;
  }

  getPublicKeys(): Record<string, string> {
    const publicKeys: Record<string, string> = {};
    Object.entries(this.keySet.keys).forEach(([kid, material]) => {
      publicKeys[kid] = material.publicKey;
    });
    return publicKeys;
  }

  getKeySetSummary() {
    return {
      activeKid: this.keySet.activeKid,
      keys: Object.entries(this.keySet.keys).map(([kid, value]) => ({
        kid,
        createdAt: value.createdAt,
        expiresAt: value.expiresAt,
        active: kid === this.keySet.activeKid,
      })),
      lastRotatedAt: this.keySet.lastRotatedAt,
    };
  }

  sign(payload: object, options: SignOptions): string {
    const activeKey = this.keySet.keys[this.keySet.activeKid];
    if (!activeKey) {
      throw new Error('Active signing key not found');
    }

    return jwt.sign(payload, activeKey.privateKey, {
      ...options,
      algorithm: 'RS256',
      keyid: this.keySet.activeKid,
    });
  }

  verify<T>(token: string, options: jwt.VerifyOptions): T {
    const decoded = jwt.decode(token, { complete: true });
    const kid = decoded && typeof decoded === 'object' ? decoded.header?.kid : undefined;

    if (kid && this.keySet.keys[kid]) {
      return jwt.verify(token, this.keySet.keys[kid].publicKey, {
        ...options,
        algorithms: ['RS256'],
      }) as T;
    }

    const errors: Error[] = [];
    for (const key of Object.values(this.keySet.keys)) {
      try {
        return jwt.verify(token, key.publicKey, {
          ...options,
          algorithms: ['RS256'],
        }) as T;
      } catch (error) {
        errors.push(error as Error);
      }
    }

    const error = errors[0] || new Error('Token verification failed');
    throw error;
  }

  async rotateKeys(reason?: string): Promise<{ kid: string; publicKey: string }> {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const kid = `key-${new Date().toISOString().replace(/[:.]/g, '-')}`;

    this.keySet.keys[kid] = {
      publicKey,
      privateKey,
      createdAt: new Date().toISOString(),
    };
    this.keySet.activeKid = kid;
    this.keySet.lastRotatedAt = new Date().toISOString();

    await this.persistKeySet();

    this.logger.info('JWT key rotated', { kid, reason });
    return { kid, publicKey };
  }

  async ensureRotationPolicy(): Promise<void> {
    if (!this.autoRotate || !this.rotationDays) {
      return;
    }

    const lastRotated = this.keySet.lastRotatedAt
      ? new Date(this.keySet.lastRotatedAt).getTime()
      : 0;
    const now = Date.now();
    const rotationIntervalMs = this.rotationDays * 24 * 60 * 60 * 1000;

    if (now - lastRotated >= rotationIntervalMs) {
      await this.rotateKeys('auto-rotation');
    }
  }

  private async persistKeySet(): Promise<void> {
    if (!this.secretName || !this.secretsClient) {
      return;
    }

    await this.secretsClient.send(
      new PutSecretValueCommand({
        SecretId: this.secretName,
        SecretString: JSON.stringify(this.keySet),
      })
    );
  }
}
