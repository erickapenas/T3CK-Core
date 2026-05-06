# Eventos e Webhooks

Este documento define o contrato de eventos emitidos pelo T3CK e entregues via webhooks.

## Envelope de entrega

O corpo do POST enviado para o webhook segue este formato:

```json
{
  "event": "order.created",
  "data": {
    "id": "ord_123",
    "tenantId": "tenant_001"
  },
  "timestamp": "2026-02-07T12:34:56.000Z"
}
```

## Headers

Os seguintes headers são enviados:

- `Content-Type: application/json`
- `X-T3CK-Event`: tipo do evento (ex: `order.created`)
- `X-T3CK-Delivery-ID`: identificador único da entrega
- `X-T3CK-Signature`: assinatura HMAC SHA-256 (quando webhook possui `secret`)

## Assinatura (HMAC)

A assinatura é calculada com HMAC SHA-256 usando o **secret do webhook** e o **JSON do payload de data** (`data`) como corpo assinado:

```
signature = HMAC_SHA256(secret, JSON.stringify(data))
```

O valor é enviado em `X-T3CK-Signature` em **hex**.

## Retentativas e timeout

- **Timeout**: 10s por tentativa
- **Retentativas**: 5 tentativas
- **Backoff**: 1s, 2s, 5s, 10s, 30s

## Tipos de evento

> Lista atual baseada em [services/webhook-service/src/event-bus.ts](services/webhook-service/src/event-bus.ts)

### order.created

Disparado quando um pedido é criado.

```json
{
  "id": "ord_123",
  "tenantId": "tenant_001",
  "status": "created",
  "total": 199.9,
  "currency": "BRL",
  "createdAt": "2026-02-07T12:34:56.000Z"
}
```

### order.updated

Disparado quando um pedido é atualizado.

```json
{
  "id": "ord_123",
  "tenantId": "tenant_001",
  "status": "paid",
  "total": 199.9,
  "currency": "BRL",
  "updatedAt": "2026-02-07T13:10:00.000Z"
}
```

### order.cancelled

Disparado quando um pedido é cancelado.

```json
{
  "id": "ord_123",
  "tenantId": "tenant_001",
  "reason": "payment_failed",
  "cancelledAt": "2026-02-07T13:20:00.000Z"
}
```

### payment.completed

Disparado quando um pagamento é concluído.

```json
{
  "id": "pay_456",
  "tenantId": "tenant_001",
  "orderId": "ord_123",
  "amount": 199.9,
  "currency": "BRL",
  "completedAt": "2026-02-07T13:05:00.000Z"
}
```

### payment.failed

Disparado quando um pagamento falha.

```json
{
  "id": "pay_456",
  "tenantId": "tenant_001",
  "orderId": "ord_123",
  "reason": "card_declined",
  "failedAt": "2026-02-07T13:04:00.000Z"
}
```

### shipment.created

Disparado quando uma remessa é criada.

```json
{
  "id": "shp_789",
  "tenantId": "tenant_001",
  "orderId": "ord_123",
  "carrier": "correios",
  "trackingCode": "BR123456789",
  "createdAt": "2026-02-07T14:00:00.000Z"
}
```

### shipment.delivered

Disparado quando uma remessa é entregue.

```json
{
  "id": "shp_789",
  "tenantId": "tenant_001",
  "orderId": "ord_123",
  "deliveredAt": "2026-02-08T09:15:00.000Z"
}
```

### customer.created

Disparado quando um cliente é criado.

```json
{
  "id": "cus_321",
  "tenantId": "tenant_001",
  "email": "cliente@empresa.com",
  "name": "João Silva",
  "createdAt": "2026-02-07T11:00:00.000Z"
}
```

### customer.updated

Disparado quando um cliente é atualizado.

```json
{
  "id": "cus_321",
  "tenantId": "tenant_001",
  "email": "cliente@empresa.com",
  "name": "João Silva",
  "updatedAt": "2026-02-07T11:30:00.000Z"
}
```

## Versionamento

- Mudanças **compatíveis** são feitas adicionando novos campos.
- Mudanças **incompatíveis** geram um novo tipo de evento com sufixo `v2` (ex: `order.created.v2`).
- A versão do payload deve ser inferida pelo nome do evento.
