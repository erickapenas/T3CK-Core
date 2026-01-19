# API Reference

## Auth Service

### POST /auth/login

Autenticar usuário.

**Request:**
```json
{
  "provider": "firebase" | "cognito",
  "token": "firebase-id-token", // se provider = firebase
  "username": "user@example.com", // se provider = cognito
  "password": "password" // se provider = cognito
}
```

**Response:**
```json
{
  "accessToken": "jwt-token",
  "refreshToken": "refresh-token",
  "idToken": "id-token",
  "expiresIn": 3600
}
```

### POST /auth/refresh

Renovar token de acesso.

**Request:**
```json
{
  "refreshToken": "refresh-token"
}
```

**Response:**
```json
{
  "accessToken": "new-jwt-token",
  "refreshToken": "refresh-token",
  "idToken": "id-token",
  "expiresIn": 3600
}
```

### POST /auth/verify

Verificar token JWT.

**Request:**
```json
{
  "token": "jwt-token"
}
```

**Response:**
```json
{
  "valid": true,
  "payload": {
    "tenantId": "tenant-123",
    "userId": "user-456",
    "email": "user@example.com",
    "roles": ["user"]
  }
}
```

## Webhook Service

### POST /api/webhooks

Criar webhook.

**Headers:**
- `X-Tenant-ID: tenant-123`

**Request:**
```json
{
  "url": "https://example.com/webhook",
  "events": ["order.created", "order.updated"],
  "secret": "webhook-secret"
}
```

**Response:**
```json
{
  "data": {
    "id": "wh_123",
    "tenantId": "tenant-123",
    "url": "https://example.com/webhook",
    "events": ["order.created", "order.updated"],
    "active": true,
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

### GET /api/webhooks

Listar webhooks do tenant.

**Headers:**
- `X-Tenant-ID: tenant-123`

**Response:**
```json
{
  "data": [
    {
      "id": "wh_123",
      "url": "https://example.com/webhook",
      "events": ["order.created"],
      "active": true
    }
  ]
}
```

### GET /api/webhooks/:id/logs

Obter logs de entregas do webhook.

**Query Parameters:**
- `limit`: Número de logs (padrão: 50)

**Response:**
```json
{
  "data": [
    {
      "id": "delivery_123",
      "webhookId": "wh_123",
      "eventType": "order.created",
      "status": "success",
      "attempts": 1,
      "responseCode": 200,
      "lastAttemptAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

## Tenant Service

### POST /provisioning/submit

Submeter formulário de provisionamento.

**Request:**
```json
{
  "tenantId": "cliente-123",
  "companyName": "Empresa ABC",
  "domain": "cliente.t3ck.com",
  "contactEmail": "contato@empresa.com",
  "contactName": "João Silva",
  "contactPhone": "+5511999999999",
  "region": "us-east-1",
  "plan": "enterprise"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "cliente-123",
    "status": "pending",
    "form": { /* ... */ },
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "message": "Form submitted successfully. Provisioning will begin shortly."
}
```

### GET /provisioning/:tenantId/status

Obter status do provisionamento.

**Response:**
```json
{
  "tenantId": "cliente-123",
  "status": "provisioning",
  "message": "Provisioning in progress"
}
```
