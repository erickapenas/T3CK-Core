# Webhook Testing & Event Versioning Guide

## Overview
This document covers webhook testing capabilities and event versioning management for backward compatibility as your API evolves.

## 1. Webhook Testing Service

### Purpose
Enable developers to test webhook configurations with sample events before going to production.

### Features
- **Test Payload Generation** - Automatic sample data for each event type
- **URL Validation** - Verify webhook endpoint accessibility
- **Response Inspection** - Capture status codes, response times, headers
- **Test History** - Track all webhook test requests
- **Performance Metrics** - Measure response times and reliability

### Testing Endpoints

#### Send Test Webhook
```
POST /webhooks/test
Content-Type: application/json

{
  "webhookId": "wh_123456",
  "eventType": "order.created",
  "testData": {
    "orderId": "ORD-12345",
    "customerId": "CUST-67890",
    "amount": 99.99,
    "currency": "USD"
  },
  "includeHeaders": true
}

Response:
{
  "success": true,
  "testResult": {
    "testId": "test_1234567890_abc123",
    "webhookId": "wh_123456",
    "statusCode": 200,
    "responseTime": 234,
    "response": "{\"acknowledged\": true}",
    "success": true,
    "timestamp": "2024-01-15T10:30:00Z",
    "requestHeaders": {
      "Content-Type": "application/json",
      "X-Webhook-ID": "wh_123456",
      "X-Test-Signature": "test-mode"
    },
    "responseHeaders": {
      "Content-Type": "application/json"
    }
  }
}
```

#### Get Test History
```
GET /webhooks/test/history/:webhookId?limit=10

Response:
{
  "webhookId": "wh_123456",
  "testHistory": [
    {
      "testId": "test_1234567890_abc123",
      "statusCode": 200,
      "responseTime": 234,
      "success": true,
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Get Sample Data
```
GET /webhooks/test/sample/:eventType

Response:
{
  "eventType": "order.created",
  "sampleData": {
    "orderId": "ORD-abc123",
    "customerId": "CUST-def456",
    "amount": 99.99,
    "currency": "USD",
    "items": [
      {
        "productId": "PROD-123",
        "quantity": 2,
        "price": 49.99
      }
    ]
  }
}
```

#### Validate URL
```
POST /webhooks/test/validate-url
Content-Type: application/json

{
  "url": "https://api.example.com/webhooks/orders"
}

Response:
{
  "url": "https://api.example.com/webhooks/orders",
  "valid": true
}
```

### Event Types & Sample Data

#### order.created
```json
{
  "orderId": "ORD-abc123",
  "customerId": "CUST-def456",
  "amount": 99.99,
  "currency": "USD",
  "items": [
    {
      "productId": "PROD-123",
      "quantity": 2,
      "price": 49.99
    }
  ],
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### payment.processed
```json
{
  "paymentId": "PAY-abc123",
  "orderId": "ORD-abc123",
  "amount": 99.99,
  "status": "success",
  "method": "card",
  "processedAt": "2024-01-15T10:30:00Z"
}
```

#### user.created
```json
{
  "userId": "USER-abc123",
  "email": "test@example.com",
  "name": "Test User",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

---

## 2. Event Versioning Management

### Purpose
Support backward compatibility as event schemas evolve, allowing subscribers to maintain subscriptions across API versions.

### Versioning Strategy

Events follow semantic versioning:
- **Major Version** (V1 → V2): Breaking changes to schema
- **Minor Version** (1.0 → 1.1): Non-breaking additions
- **Patch Version** (1.0.0 → 1.0.1): Bug fixes, metadata changes

### Current Event Versions

#### order.created

**V1.0** (Deprecated)
```json
{
  "orderId": "string",
  "customerId": "string",
  "amount": "number",
  "currency": "string",
  "items": [
    {
      "productId": "string",
      "quantity": "number",
      "price": "number"
    }
  ],
  "createdAt": "ISO-8601 datetime"
}
```

**V2.0** (Current)
```json
{
  "orderId": "string",
  "customerId": "string",
  "amount": "number",
  "currency": "string",
  "billingAddress": {
    "street": "string",
    "city": "string",
    "country": "string"
  },
  "shippingAddress": {
    "street": "string",
    "city": "string",
    "country": "string"
  },
  "items": [
    {
      "productId": "string",
      "quantity": "number",
      "price": "number",
      "sku": "string"  // NEW in V2
    }
  ],
  "shippingCost": "number",  // NEW in V2
  "taxCost": "number",       // NEW in V2
  "createdAt": "ISO-8601 datetime"
}
```

**Breaking Changes in V2:**
- Added required fields: `billingAddress`, `shippingAddress`
- Item structure now includes `sku` field
- New top-level fields: `shippingCost`, `taxCost`

#### payment.processed

**V1.0** (Deprecated)
```json
{
  "paymentId": "string",
  "orderId": "string",
  "amount": "number",
  "status": "success|failed|pending",
  "method": "string",
  "processedAt": "ISO-8601 datetime"
}
```

**V2.0** (Current)
```json
{
  "paymentId": "string",
  "orderId": "string",
  "amount": "number",
  "currency": "string",
  "status": "success|failed|pending|disputed",  // Added 'disputed'
  "method": "string",
  "methodDetails": {
    "last4": "string",
    "brand": "string",
    "country": "string"
  },
  "threeDSecure": "boolean",  // NEW in V2
  "riskScore": "number",       // NEW in V2
  "processedAt": "ISO-8601 datetime"
}
```

**Non-Breaking Changes in V2:**
- Added new `methodDetails` object
- Added `threeDSecure` and `riskScore` fields
- Added `disputed` status option
- Existing fields remain compatible with V1

### Version Management Endpoints

#### Get Available Versions
```
GET /webhooks/events/versions/:eventType

Response:
{
  "eventType": "order.created",
  "availableVersions": ["1.0", "2.0"],
  "latestVersion": "2.0"
}
```

#### Get Event Schema
```
GET /webhooks/events/schema/:eventType/:version

Response:
{
  "eventType": "order.created",
  "version": "2.0",
  "schema": {
    "description": "Enhanced order creation with billing/shipping split",
    "schema": { ... },
    "newFields": ["billingAddress", "shippingAddress", "shippingCost", "taxCost"],
    "breaking": true,
    "migrateFrom": "1.0"
  }
}
```

#### Validate Event Payload
```
POST /webhooks/events/validate
Content-Type: application/json

{
  "eventType": "order.created",
  "version": "2.0",
  "data": { ... }
}

Response:
{
  "valid": true,
  "errors": []
}
```

### Migration Strategy

When subscribing to V1 events in a V2 system:

1. **Automatic Migration**: System can auto-upgrade V1 events to V2 format
2. **Non-Breaking Subscription**: Old subscribers can receive V1 events indefinitely
3. **Explicit Version Request**: Subscribers specify which version they support

```javascript
// Example: Subscribe to events with version compatibility
const subscription = {
  webhookUrl: "https://api.example.com/webhooks/orders",
  eventTypes: ["order.created"],
  supportedVersions: ["1.0", "2.0"],  // Accepts both
  autoMigrate: true  // Automatically upgrade V1 → V2 if possible
};
```

---

## 3. Webhook Testing UI Integration

### CLI Testing Examples

```bash
# Test webhook immediately
curl -X POST http://localhost:3002/webhooks/test \
  -H "Content-Type: application/json" \
  -d '{
    "webhookId": "wh_123",
    "eventType": "order.created"
  }'

# Get sample data for event
curl http://localhost:3002/webhooks/test/sample/order.created

# Validate webhook URL
curl -X POST http://localhost:3002/webhooks/test/validate-url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/webhook"}'

# Validate event payload
curl -X POST http://localhost:3002/webhooks/events/validate \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "order.created",
    "version": "2.0",
    "data": { "orderId": "ORD-123" }
  }'
```

### Web UI Components (Frontend)

The webhook testing UI should include:

1. **Test Console**
   - Event type selector
   - Sample data generator
   - Custom payload editor
   - Send test button
   - Real-time response viewer

2. **Event Explorer**
   - Available event types
   - Version selector
   - Schema documentation
   - Field descriptions

3. **Test History Panel**
   - List of recent tests
   - Status indicators
   - Response times
   - Error messages

4. **URL Validator**
   - URL format checker
   - HTTPS enforcement
   - Reachability test

---

## 4. Best Practices

### For Event Producers
- Always include `version` in event metadata
- Document breaking changes prominently
- Provide migration guides for major versions
- Support at least 2 previous versions

### For Event Consumers
- Specify which event versions you support
- Implement version-aware handlers
- Test with multiple versions before updating
- Log received event versions for debugging

### For Operations
- Monitor which event versions are in use
- Plan deprecation timelines carefully
- Communicate breaking changes 3 months in advance
- Provide automated migration tools

