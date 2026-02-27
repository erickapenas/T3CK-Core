/**
 * Exemplo de uso do SDK T3CK
 * 
 * Execute com: ts-node examples/sdk-usage.ts
 */

import { createT3CK } from '@t3ck/sdk';

async function exemploUsoSDK() {
  // Inicializar SDK
  const t3ck = createT3CK({
    apiKey: process.env.API_KEY || 'your-api-key',
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
    tenantId: process.env.TENANT_ID || 'tenant-demo',
    timeout: 30000,
    retries: 3,
  });

  try {
    // 1. Buscar produtos
    console.log('🔍 Buscando produtos...');
    const searchResults = await t3ck.catalog.search({
      query: 'notebook',
      page: 1,
      limit: 10,
    });
    console.log('Produtos encontrados:', searchResults.data);

    // 2. Obter produto específico
    if (searchResults.data.products.length > 0) {
      const productId = searchResults.data.products[0].id;
      console.log(`\n📦 Obtendo produto ${productId}...`);
      const product = await t3ck.catalog.getProduct(productId);
      console.log('Produto:', product.data);

      // 3. Adicionar ao carrinho
      console.log('\n🛒 Adicionando produto ao carrinho...');
      await t3ck.cart.add(product.data, 2);
      console.log('Produto adicionado!');

      // 4. Ver carrinho
      console.log('\n🛒 Obtendo carrinho...');
      const cart = await t3ck.cart.get();
      console.log('Carrinho:', cart.data);

      // 5. Criar pedido
      console.log('\n💳 Criando pedido...');
      const order = await t3ck.checkout.create({
        shippingAddress: {
          street: 'Rua Exemplo, 123',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01234-567',
          country: 'BR',
        },
        paymentMethod: 'credit_card',
        paymentToken: 'token-123',
      });
      console.log('Pedido criado:', order.data);

      // 6. Verificar status do pedido
      console.log(`\n📊 Verificando status do pedido ${order.data.id}...`);
      const orderStatus = await t3ck.checkout.getStatus(order.data.id);
      console.log('Status:', orderStatus.data.status);
    }

    // 7. Obter configurações
    console.log('\n⚙️  Obtendo configurações...');
    const settings = await t3ck.settings.get();
    console.log('Configurações:', settings.data);

  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

// Executar exemplo
if (require.main === module) {
  exemploUsoSDK().catch(console.error);
}

export { exemploUsoSDK };
