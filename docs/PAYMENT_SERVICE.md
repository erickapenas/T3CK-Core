# Payment Service (AbacatePay)

## Escopo implementado

- AbacatePay integration (Pix, Boleto, Card)
- Idempotency key para evitar cobrança duplicada
- Status mapping `pending/paid/refunded/failed/chargeback` → status interno
- Mensagens amigáveis para UX de erro
- Checkout branded (logo/cor/nome da loja)
- Timer de expiração Pix + payload de copia e cola
- Webhook com verificação de assinatura HMAC
- Logs de transação imutáveis (cadeia de hash)
- Rate limiting de checkout (anti card-testing)
- Refund, chargeback handling e envio de recibo
- Relatório financeiro diário/mensal

## Endpoints

### Criar pagamento

`POST /payments`

Headers:
- `Idempotency-Key` (obrigatório)

Body:
```json
{
  "tenantId": "tenant_001",
  "orderId": "order_123",
  "customerId": "customer_789",
  "amount": 199.9,
  "currency": "BRL",
  "method": "pix",
  "description": "Pedido #123",
  "dueMinutes": 30
}
```

Resposta inclui:
- status interno e status do provedor
- QR code Pix
- código copia e cola
- `expiresInSeconds`
- branding de checkout

### Timer de expiração Pix

`GET /payments/:paymentId/pix-timer`

Resposta:
```json
{
  "expired": false,
  "secondsLeft": 1260
}
```

### Copia e cola Pix

`GET /payments/:paymentId/pix-copy-paste`

### Refund

`POST /payments/refund`

### Invoice

`POST /payments/invoice`

### Recibo por e-mail

`POST /payments/receipt`

### Webhook de pagamento/chargeback

`POST /payments/webhook`

Headers:
- `X-AbacatePay-Signature`

Rejeita com `401` quando assinatura for inválida.

### Relatório financeiro

`GET /payments/reports/summary?tenantId=tenant_001&period=daily`

Retorna:
- total pago
- total estornado
- total chargeback
- receita líquida

### Auditoria de transações

`GET /payments/logs?tenantId=tenant_001`

Retorna logs + `integrityOk` (cadeia de hash válida).

## Variáveis de ambiente

- `ABACATEPAY_BASE_URL`
- `ABACATEPAY_API_KEY`
- `ABACATEPAY_WEBHOOK_SECRET`
- `PAYMENT_MOCK_MODE` (`true` por padrão)
- `CHECKOUT_LOGO_URL`
- `CHECKOUT_PRIMARY_COLOR`
- `CHECKOUT_MERCHANT_NAME`
- `INVOICE_BASE_URL`

## Segurança e compliance

- Não armazena PAN/CVV no serviço
- Verificação de assinatura HMAC em webhook
- Rate limiting no checkout
- Trilha de auditoria imutável para suporte/compliance
