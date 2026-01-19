import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { Logger } from '@t3ck/shared';

export class EncryptionService {
  private kmsClient: KMSClient;
  private keyId: string;
  private logger: Logger;

  constructor() {
    this.kmsClient = new KMSClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.keyId = process.env.KMS_KEY_ID || '';
    this.logger = new Logger('encryption-service');
  }

  async encryptField(data: string, fieldName: string): Promise<string> {
    try {
      const command = new EncryptCommand({
        KeyId: this.keyId,
        Plaintext: Buffer.from(data),
        EncryptionContext: {
          FieldName: fieldName,
        },
      });

      const response = await this.kmsClient.send(command);
      
      if (!response.CiphertextBlob) {
        throw new Error('Encryption failed');
      }

      return Buffer.from(response.CiphertextBlob).toString('base64');
    } catch (error) {
      this.logger.error('Field encryption failed', { error, fieldName });
      throw new Error(`Failed to encrypt field: ${fieldName}`);
    }
  }

  async decryptField(encryptedData: string, fieldName: string): Promise<string> {
    try {
      const command = new DecryptCommand({
        KeyId: this.keyId,
        CiphertextBlob: Buffer.from(encryptedData, 'base64'),
        EncryptionContext: {
          FieldName: fieldName,
        },
      });

      const response = await this.kmsClient.send(command);
      
      if (!response.Plaintext) {
        throw new Error('Decryption failed');
      }

      return Buffer.from(response.Plaintext).toString('utf-8');
    } catch (error) {
      this.logger.error('Field decryption failed', { error, fieldName });
      throw new Error(`Failed to decrypt field: ${fieldName}`);
    }
  }

  async encryptSensitiveFields(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const sensitiveFields = ['cpf', 'cnpj', 'cardNumber', 'cvv', 'password', 'ssn'];
    const encrypted: Record<string, unknown> = { ...data };

    for (const [key, value] of Object.entries(data)) {
      if (sensitiveFields.includes(key.toLowerCase()) && typeof value === 'string') {
        encrypted[key] = await this.encryptField(value, key);
        encrypted[`${key}_encrypted`] = true;
      }
    }

    return encrypted;
  }

  async decryptSensitiveFields(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const decrypted: Record<string, unknown> = { ...data };

    for (const [key, value] of Object.entries(data)) {
      if (key.endsWith('_encrypted') && typeof value === 'string') {
        const fieldName = key.replace('_encrypted', '');
        decrypted[fieldName] = await this.decryptField(value, fieldName);
        delete decrypted[key];
      }
    }

    return decrypted;
  }
}
