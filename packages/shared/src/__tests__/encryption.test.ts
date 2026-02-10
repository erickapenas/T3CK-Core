import {
  decryptFields,
  decryptString,
  encryptFields,
  encryptString,
  isEncryptedPayload,
} from '../encryption';

describe('shared encryption utils', () => {
  const secret = 'super-secret-key';

  it('encrypts and decrypts a string', () => {
    const payload = encryptString('hello', secret);
    expect(isEncryptedPayload(payload)).toBe(true);

    const decrypted = decryptString(payload, secret);
    expect(decrypted).toBe('hello');
  });

  it('throws on invalid payload', () => {
    expect(() => decryptString({} as any, secret)).toThrow('Invalid encrypted payload');
  });

  it('encrypts and decrypts fields', () => {
    const data = {
      name: 'Alice',
      email: 'alice@example.com',
      age: 30,
    };

    const encrypted = encryptFields(data, ['email'], secret);
    expect(isEncryptedPayload(encrypted.email)).toBe(true);

    const decrypted = decryptFields(encrypted, ['email'], secret);
    expect(decrypted.email).toBe('alice@example.com');
    expect(decrypted.name).toBe('Alice');
  });
});
