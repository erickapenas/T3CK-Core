import { AuditEventBuilder } from '../audit/audit-event-builder';
import { AuditSanitizerService } from '../audit/audit-sanitizer-service';

describe('Audit logging safeguards', () => {
  it('masks sensitive values before persistence', () => {
    const sanitizer = new AuditSanitizerService();
    const sanitized = sanitizer.sanitizeRecord({
      email: 'cliente@example.com',
      cpf: '123.456.789-10',
      phone: '11999991234',
      password: 'super-secret',
      apiKey: 'sk_live_abcdef123456',
    });

    expect(sanitized.email).toBe('cl***@example.com');
    expect(sanitized.cpf).toBe('***.456.789-**');
    expect(sanitized.phone).toBe('(11) *****-1234');
    expect(sanitized.password).toBeUndefined();
    expect(String(sanitized.apiKey)).toContain('****');
  });

  it('builds tamper-evident audit events with correlation data', () => {
    const builder = new AuditEventBuilder();
    const event = builder.fromInput(
      {
        tenantId: 'tenant-a',
        actor: { id: 'user-a', name: 'Usuario A', email: 'user@example.com' },
        category: 'products',
        action: 'products.product.price_changed',
        operation: 'update',
        severity: 'notice',
        outcome: 'success',
        resource: { type: 'product', id: 'product-a', label: 'Produto A' },
        before: { price: 79.9 },
        after: { price: 89.9 },
        requestId: 'req-a',
        correlationId: 'corr-a',
      },
      'previous-hash'
    );

    expect(event.tenant_id).toBe('tenant-a');
    expect(event.actor_email_masked).toBe('us***@example.com');
    expect(event.changed_fields).toContain('price');
    expect(event.previous_hash).toBe('previous-hash');
    expect(event.hash).toHaveLength(64);
    expect(event.correlation_id).toBe('corr-a');
  });
});
