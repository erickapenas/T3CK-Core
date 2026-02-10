import { ProvisioningSubmitSchema } from '../validation';

describe('ProvisioningSubmitSchema', () => {
  it('accepts form with contactEmail', () => {
    const payload = {
      body: {
        tenantId: 'tenant-123',
        domain: 'tenant.example.com',
        companyName: 'Tenant Inc',
        contactName: 'Jane Doe',
        contactEmail: 'jane@tenant.com',
        plan: 'starter',
        numberOfSeats: 10,
        region: 'us-east-1',
      },
    };

    expect(() => ProvisioningSubmitSchema.parse(payload)).not.toThrow();
  });

  it('accepts form with adminEmail fallback', () => {
    const payload = {
      body: {
        tenantId: 'tenant-123',
        domain: 'tenant.example.com',
        companyName: 'Tenant Inc',
        contactName: 'Jane Doe',
        adminEmail: 'admin@tenant.com',
        plan: 'growth',
      },
    };

    expect(() => ProvisioningSubmitSchema.parse(payload)).not.toThrow();
  });

  it('rejects when both contactEmail and adminEmail are missing', () => {
    const payload = {
      body: {
        tenantId: 'tenant-123',
        domain: 'tenant.example.com',
        companyName: 'Tenant Inc',
        contactName: 'Jane Doe',
        plan: 'enterprise',
      },
    };

    expect(() => ProvisioningSubmitSchema.parse(payload)).toThrow();
  });

  it('rejects when required fields are missing', () => {
    const payload = {
      body: {
        domain: 'tenant.example.com',
      },
    };

    expect(() => ProvisioningSubmitSchema.parse(payload)).toThrow();
  });
});
