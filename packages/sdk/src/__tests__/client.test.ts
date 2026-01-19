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

  // Adicionar mais testes conforme necessário
});
