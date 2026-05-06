import { EncryptionService } from '../encryption';

describe('EncryptionService basic', () => {
  test('class exists and has methods', () => {
    const svc = new EncryptionService();
    expect(typeof svc.encryptField).toBe('function');
    expect(typeof svc.decryptField).toBe('function');
    expect(typeof svc.encryptSensitiveFields).toBe('function');
    expect(typeof svc.decryptSensitiveFields).toBe('function');
  });
});
