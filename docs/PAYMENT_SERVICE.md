# Payment Service (AbacatePay)

## Escopo implementado

- Pix transparente via `POST /v2/transparents/create`
- Boleto com Pix alternativo via checkout transparente
- Checkout hospedado da AbacatePay para cartao e Pix + Cartao via `POST /v2/checkouts/create`
- Idempotency key obrigatoria para evitar cobranca duplicada
- Confirmacao explicita de pagamento para retornos do checkout
- Consulta de status no provedor
- Webhook com secret de URL e assinatura HMAC
- Mapeamento de status do provedor para status interno
- Sincronizacao opcional com `order-service`
- Validacao de consistencia do pedido antes de cobrar quando `ORDER_SERVICE_URL` esta configurado
- Token interno entre gateway, payment-service e order-service em producao
- Persistencia local configuravel de estado operacional para reduzir perda em restart single-node
- Timer de expiracao Pix e payload copia e cola
- Logs de transacao imutaveis
- Rate limiting no checkout
- Refund, chargeback handling, recibo e relatorio financeiro

## Fluxo recomendado

1. Frontend cria ou recupera o pedido no `order-service`.
2. Frontend chama o backend em `POST /payments` com `Idempotency-Key`.
3. `payment-service` consulta o pedido no `order-service` e valida tenant, cliente, status e total.
4. `payment-service` cria a cobranca na AbacatePay usando a chave somente no backend.
5. Para Pix transparente, o frontend renderiza `pix.qrCode` e `pix.copyPasteCode`.
6. Para cartao ou Pix + Cartao hospedado, o frontend redireciona para `hostedCheckout.url`.
7. AbacatePay envia webhook para `/payments/webhook?webhookSecret=...`.
8. Backend valida secret, HMAC e idempotencia do evento antes de atualizar pagamento e pedido.
9. No retorno do cliente, use `POST /payments/:paymentId/confirm` para reconciliar o status.

## Endpoints

### Criar pagamento

`POST /payments`

Headers:

- `Idempotency-Key` (obrigatorio)

Pix transparente:

```json
{
  "tenantId": "tenant_001",
  "orderId": "order_123",
  "customerId": "customer_789",
  "amount": 19990,
  "currency": "BRL",
  "method": "pix",
  "description": "Pedido #123",
  "dueMinutes": 30
}
```

Checkout hospedado para cartao:

```json
{
  "tenantId": "tenant_001",
  "orderId": "order_123",
  "customerId": "customer_789",
  "amount": 19990,
  "currency": "BRL",
  "method": "card",
  "checkoutItems": [{ "id": "prod_abc123", "quantity": 1 }],
  "returnUrl": "https://loja.exemplo/checkout/retorno",
  "completionUrl": "https://loja.exemplo/checkout/sucesso",
  "maxInstallments": 3
}
```

Checkout hospedado com Pix + Cartao:

```json
{
  "tenantId": "tenant_001",
  "orderId": "order_123",
  "customerId": "customer_789",
  "amount": 19990,
  "currency": "BRL",
  "method": "checkout",
  "checkoutItems": [{ "id": "prod_abc123", "quantity": 1 }],
  "checkoutMethods": ["PIX", "CARD"]
}
```

### Confirmar pagamento

`POST /payments/:paymentId/confirm`

```json
{
  "tenantId": "tenant_001"
}
```

Use este endpoint quando o cliente voltar de `returnUrl` ou `completionUrl`.

### Consultar status

`GET /payments/:paymentId/status?tenantId=tenant_001`

Consulta a AbacatePay e atualiza o status interno.

### Timer de expiracao Pix

`GET /payments/:paymentId/pix-timer`

### Copia e cola Pix

`GET /payments/:paymentId/pix-copy-paste`

### Webhook

`POST /payments/webhook?webhookSecret=...`

Headers aceitos:

- `X-Webhook-Signature`
- `X-AbacatePay-Signature`

O endpoint espera o corpo bruto original para validar HMAC. Se passar por API Gateway, preserve o raw body ou exponha esta rota diretamente como endpoint publico HTTPS do `payment-service`.

### Refund

`POST /payments/refund`

### Invoice

`POST /payments/invoice`

### Recibo

`POST /payments/receipt`

### Relatorio financeiro

`GET /payments/reports/summary?tenantId=tenant_001&period=daily`

### Auditoria

`GET /payments/logs?tenantId=tenant_001`

## Variaveis de ambiente

- `ABACATEPAY_BASE_URL`
- `ABACATEPAY_API_KEY`
- `ABACATEPAY_WEBHOOK_PUBLIC_KEY`
- `ABACATEPAY_WEBHOOK_URL_SECRET`
- `PAYMENT_MOCK_MODE`
- `ORDER_SERVICE_URL`
- `INTERNAL_SERVICE_TOKEN`
- `PAYMENT_ALLOWED_RETURN_ORIGINS`
- `PAYMENT_STATE_FILE`
- `CHECKOUT_LOGO_URL`
- `CHECKOUT_PRIMARY_COLOR`
- `CHECKOUT_MERCHANT_NAME`
- `INVOICE_BASE_URL`

## Seguranca

- Nao envie `ABACATEPAY_API_KEY` ao frontend.
- Nao colete PAN/CVV no checkout proprio; para cartao, use o checkout hospedado.
- Use HTTPS no webhook.
- Valide secret de URL e assinatura HMAC.
- Processe cada `event.id` uma unica vez.
- Gere `Idempotency-Key` por tentativa logica de pagamento, como `tenantId:orderId:attempt`.
- Armazene pagamentos, idempotencia e eventos processados em banco/Redis em producao.
- Para escala horizontal, substitua `PAYMENT_STATE_FILE` por banco transacional/Redis com indices unicos.
