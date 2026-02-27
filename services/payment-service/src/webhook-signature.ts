import { createHmac, timingSafeEqual } from 'crypto';

export class WebhookSignatureVerifier {
  constructor(private readonly secret: string) {}

  sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('hex');
  }

  verify(payload: string, signature: string): boolean {
    if (!signature || !this.secret) {
      return false;
    }

    const expected = this.sign(payload);
    const left = Buffer.from(expected, 'utf8');
    const right = Buffer.from(signature, 'utf8');

    if (left.length !== right.length) {
      return false;
    }

    return timingSafeEqual(left, right);
  }
}
