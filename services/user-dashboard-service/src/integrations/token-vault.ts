import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export class TokenVault {
  constructor(private readonly secret = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY || '') {}

  static createFromEnvironment(): TokenVault {
    const secret =
      process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY ||
      process.env.SECRET_ENCRYPTION_KEY ||
      (process.env.NODE_ENV === 'production' ? '' : 'dev-integration-token-secret');

    if (process.env.NODE_ENV === 'production' && !secret) {
      throw new Error('INTEGRATION_TOKEN_ENCRYPTION_KEY e obrigatorio em producao.');
    }

    return new TokenVault(secret);
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv, authTag, encrypted].map((part) => part.toString('base64url')).join('.');
  }

  decrypt(value: string): string {
    const [ivValue, authTagValue, encryptedValue] = value.split('.');
    if (!ivValue || !authTagValue || !encryptedValue) {
      throw new Error('Invalid encrypted token payload');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key(), Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(authTagValue, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private key(): Buffer {
    return createHash('sha256').update(this.secret).digest();
  }
}
