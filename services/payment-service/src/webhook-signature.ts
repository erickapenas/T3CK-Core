import { createHmac, timingSafeEqual } from 'crypto';

export class WebhookSignatureVerifier {
  constructor(private readonly secret: string) {}

  sign(payload: string, encoding: 'base64' | 'hex' = 'base64'): string {
    return createHmac('sha256', this.secret).update(Buffer.from(payload, 'utf8')).digest(encoding);
  }

  verify(payload: string, signature: string): boolean {
    if (!signature || !this.secret) {
      return false;
    }

    const candidates = [this.sign(payload, 'base64'), this.sign(payload, 'hex')];

    for (const expected of candidates) {
      const left = Buffer.from(expected, 'utf8');
      const right = Buffer.from(signature, 'utf8');

      if (left.length === right.length && timingSafeEqual(left, right)) {
        return true;
      }
    }

    return false;
  }
}
