import { T3CKClient } from '../client';

describe('T3CKClient', () => {
  const mockConfig = {
    apiKey: 'test-api-key',
    baseUrl: 'https://api.test.com',
  };

  it('should create client instance', () => {
    const client = new T3CKClient(mockConfig);
    expect(client).toBeInstanceOf(T3CKClient);
  });

  it('should set X-Tenant-ID header when tenantId is provided', () => {
    const client = new T3CKClient({
      ...mockConfig,
      tenantId: 'tenant-123',
    }) as any;

    expect(client.client.defaults.headers['X-Tenant-ID']).toBe('tenant-123');
  });

  // Adicionar mais testes conforme necessário
});
