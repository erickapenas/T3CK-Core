import { WebhookSignatureVerifier } from '../webhook-signature';

describe('WebhookSignatureVerifier', () => {
  it('verifies a valid signature', () => {
    const verifier = new WebhookSignatureVerifier('my-secret');
    const payload = JSON.stringify({ id: 'evt_1', status: 'paid' });
    const signature = verifier.sign(payload);

    expect(verifier.verify(payload, signature)).toBe(true);
  });

  it('rejects invalid signature', () => {
    const verifier = new WebhookSignatureVerifier('my-secret');
    const payload = JSON.stringify({ id: 'evt_2', status: 'failed' });

    expect(verifier.verify(payload, 'invalid-signature')).toBe(false);
  });

  it('rejects when signature is missing', () => {
    const verifier = new WebhookSignatureVerifier('my-secret');
    const payload = JSON.stringify({ id: 'evt_3' });

    expect(verifier.verify(payload, '')).toBe(false);
  });
});