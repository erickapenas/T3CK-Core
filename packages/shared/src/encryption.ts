import crypto from 'crypto';

export interface EncryptedPayload {
	version: number;
	algorithm: 'aes-256-gcm';
	iv: string;
	authTag: string;
	data: string;
}

const DEFAULT_VERSION = 1;
const ALGORITHM: EncryptedPayload['algorithm'] = 'aes-256-gcm';

const normalizeKey = (secret: string): Buffer => {
	if (!secret) {
		throw new Error('Encryption secret is required');
	}

	return crypto.createHash('sha256').update(secret).digest();
};

export const encryptString = (plainText: string, secret: string): EncryptedPayload => {
	if (plainText === undefined || plainText === null) {
		throw new Error('Plaintext is required');
	}

	const key = normalizeKey(secret);
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

	const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();

	return {
		version: DEFAULT_VERSION,
		algorithm: ALGORITHM,
		iv: iv.toString('base64'),
		authTag: authTag.toString('base64'),
		data: encrypted.toString('base64'),
	};
};

export const decryptString = (payload: EncryptedPayload, secret: string): string => {
	if (!payload || payload.algorithm !== ALGORITHM) {
		throw new Error('Invalid encrypted payload');
	}

	const key = normalizeKey(secret);
	const iv = Buffer.from(payload.iv, 'base64');
	const authTag = Buffer.from(payload.authTag, 'base64');
	const encrypted = Buffer.from(payload.data, 'base64');

	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);

	const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
	return decrypted.toString('utf8');
};

export const isEncryptedPayload = (value: unknown): value is EncryptedPayload => {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const payload = value as EncryptedPayload;
	return (
		payload.algorithm === ALGORITHM &&
		typeof payload.iv === 'string' &&
		typeof payload.authTag === 'string' &&
		typeof payload.data === 'string'
	);
};

export const encryptFields = <T extends Record<string, unknown>>(
	data: T,
	fields: string[],
	secret: string
): T => {
	if (!data || typeof data !== 'object') {
		throw new Error('Data must be an object');
	}

	const result: Record<string, unknown> = { ...data };

	for (const field of fields) {
		if (field in result && result[field] !== undefined && result[field] !== null) {
			result[field] = encryptString(String(result[field]), secret);
		}
	}

	return result as T;
};

export const decryptFields = <T extends Record<string, unknown>>(
	data: T,
	fields: string[],
	secret: string
): T => {
	if (!data || typeof data !== 'object') {
		throw new Error('Data must be an object');
	}

	const result: Record<string, unknown> = { ...data };

	for (const field of fields) {
		const value = result[field];
		if (isEncryptedPayload(value)) {
			result[field] = decryptString(value, secret);
		}
	}

	return result as T;
};
