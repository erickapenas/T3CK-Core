/**
 * Exemplo de configuração de webhooks
 */

import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';
const TENANT_ID = process.env.TENANT_ID || 'test-tenant';
const API_KEY = process.env.API_KEY || 'test-api-key';

async function configurarWebhooks() {
  const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'X-Tenant-ID': TENANT_ID,
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
  });

  try {
    // 1. Criar webhook para eventos de pedido
    console.log('📡 Criando webhook para eventos de pedido...');
    const webhook = await client.post('/api/webhooks', {
      url: 'https://example.com/webhooks/orders',
      events: ['order.created', 'order.updated', 'order.cancelled'],
      secret: 'webhook-secret-key',
      active: true,
    });

    console.log('Webhook criado:', webhook.data);

    const webhookId = webhook.data.data.id;

    // 2. Listar webhooks
    console.log('\n📋 Listando webhooks...');
    const webhooks = await client.get('/api/webhooks');
    console.log('Webhooks:', webhooks.data);

    // 3. Obter logs de entregas
    console.log(`\n📊 Obtendo logs do webhook ${webhookId}...`);
    const logs = await client.get(`/api/webhooks/${webhookId}/logs`, {
      params: { limit: 10 },
    });
    console.log('Logs:', logs.data);

    // 4. Atualizar webhook
    console.log(`\n✏️  Atualizando webhook ${webhookId}...`);
    const updated = await client.put(`/api/webhooks/${webhookId}`, {
      events: ['order.created', 'payment.completed'],
    });
    console.log('Webhook atualizado:', updated.data);

  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('❌ Erro:', error.response?.data || error.message);
    } else {
      console.error('❌ Erro:', error);
    }
  }
}

if (require.main === module) {
  configurarWebhooks().catch(console.error);
}

export { configurarWebhooks };
