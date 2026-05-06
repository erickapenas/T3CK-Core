export function validateAuthEnvironment(): void {
  const hasKeySetJson = Boolean(process.env.JWT_KEY_SET_JSON);
  const hasKeySetSecret = Boolean(process.env.JWT_KEY_SET_SECRET_NAME);
  const hasKeyPair = Boolean(process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY);

  if (!hasKeySetJson && !hasKeySetSecret && !hasKeyPair) {
    throw new Error(
      'Missing JWT key material. Provide JWT_PRIVATE_KEY/JWT_PUBLIC_KEY or JWT_KEY_SET_JSON or JWT_KEY_SET_SECRET_NAME'
    );
  }

  if (hasKeyPair) {
    const privateKey = String(process.env.JWT_PRIVATE_KEY);
    const publicKey = String(process.env.JWT_PUBLIC_KEY);

    if (!privateKey.includes('BEGIN') || !privateKey.includes('PRIVATE KEY')) {
      throw new Error('JWT_PRIVATE_KEY must be a PEM private key');
    }

    if (!publicKey.includes('BEGIN') || !publicKey.includes('PUBLIC KEY')) {
      throw new Error('JWT_PUBLIC_KEY must be a PEM public key');
    }
  }

  const expiration = Number(process.env.JWT_EXPIRATION || 3600);
  if (!Number.isFinite(expiration) || expiration <= 0) {
    throw new Error('JWT_EXPIRATION must be a positive number in seconds');
  }

  const refreshExpiration = Number(process.env.JWT_REFRESH_EXPIRATION || 604800);
  if (!Number.isFinite(refreshExpiration) || refreshExpiration <= 0) {
    throw new Error('JWT_REFRESH_EXPIRATION must be a positive number in seconds');
  }
}
