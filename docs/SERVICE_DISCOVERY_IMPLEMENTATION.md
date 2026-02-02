# Service Discovery Implementation (AWS Cloud Map)

## Overview

This document describes the Service Discovery integration using AWS Cloud Map (Service Discovery) for the T3CK Core platform. It covers registration/deregistration patterns, IAM permissions, initialization details, health considerations, and troubleshooting.

**Status**: ✅ Implemented in `auth-service`, `webhook-service`, `tenant-service`

## Goals

- Register service instances in AWS Cloud Map for discovery by other services
- Automated deregistration on graceful shutdown
- Use metadata (environment, version, region) to aid routing and observability
- Fail gracefully when Cloud Map is unavailable

## High-level Pattern

- Each service contains a `ServiceRegistry` singleton (see `services/*/src/service-registry.ts`).
- On startup, services call `initializeServiceRegistry(serviceId, port, metadata)` to register.
- Registration uses `RegisterInstanceCommand` from `@aws-sdk/client-servicediscovery`.
- On SIGTERM the service calls `deregisterInstance` and closes the SDK client.
- Local fallback instanceId is returned when registration fails (graceful degradation).

## Files Added

- `services/auth-service/src/service-registry.ts`
- `services/webhook-service/src/service-registry.ts`
- `services/tenant-service/src/service-registry.ts`

Each file exports:

- `getServiceRegistry()` — singleton accessor
- `initializeServiceRegistry(serviceName, port, metadata)` — startup helper
- `getServiceRegistry().registerInstance(...)`, `deregisterInstance(...)` — low-level methods

## Initialization Example

In each service `index.ts` we wired initialization immediately after config/cache setup and before `app.listen`:

```ts
// after initializeConfig()
const SERVICE_PORT = parseInt(String(process.env.PORT || 3001));
initializeServiceRegistry('t3ck-auth', SERVICE_PORT, {
  service_type: 'authentication',
});

// later
const server = app.listen(SERVICE_PORT, () => {
  logger.info(`Auth service running on port ${SERVICE_PORT}`);
});
```

Notes:
- Use a consistent service identifier (Cloud Map ServiceId or human-friendly name depending on your Cloud Map setup).
- Provide metadata keys like `environment`, `version`, `region` to help routing/monitoring.

## IAM Policy Example

Grant the task/instance role permission to register and deregister instances and read operations as needed:

```json
{
  "Version":"2012-10-17",
  "Statement":[
    {
      "Effect":"Allow",
      "Action":[
        "servicediscovery:RegisterInstance",
        "servicediscovery:DeregisterInstance",
        "servicediscovery:GetInstance",
        "servicediscovery:ListInstances"
      ],
      "Resource":"arn:aws:servicediscovery:*:ACCOUNT_ID:service/*"
    }
  ]
}
```

Adjust `Resource` to scope to specific Cloud Map Service ARNs when possible.

## Cloud Map Setup Notes

- Create a namespace (HTTP or AWS Cloud Map) in the AWS Console or CloudFormation.
- Create one or more services in that namespace and use the Cloud Map `ServiceId` in production registration calls.
- For ECS/EKS setups, the Cloud Map integration can be automated; here we use the SDK to register arbitrary instances.

## Metadata & Attributes

The SDK call uses `Attributes` to attach instance metadata. Standard attributes include:

- `AWS_INSTANCE_IPV4` — instance IPv4
- `AWS_INSTANCE_PORT` — port
- Custom attributes: `environment`, `version`, `region`, `service_type`

Use these attributes for routing and filtering in consumers.

## Failure Modes & Graceful Degradation

- If Cloud Map is unavailable at startup, the `ServiceRegistry` logs an error and returns a fallback `instanceId`.
- The service continues running locally; client-side discovery should be resilient to missing registrations.
- The registry maintains an in-memory map of registered instances and marks `isHealthy = false` on errors.

## Observability

- Log `OperationId` returned by `RegisterInstanceCommand` for correlation with Cloud Map operations.
- Expose a small `/internal/registry` endpoint (optional) to list registered instances — helpful for debugging.
- Emit metrics:
  - `service_registry_register_attempts_total`
  - `service_registry_register_failures_total`
  - `service_registry_deregister_attempts_total`

## Security Considerations

- Assign an IAM role to the compute environment (ECS task role / EC2 instance profile / EKS service account) instead of using long-lived credentials.
- Scope IAM permissions narrowly to the Cloud Map namespace/service ARNs.

## Troubleshooting

- Error: `AccessDenied` ⇒ check IAM role attached to the task/instance.
- Registration not visible ⇒ verify namespace and service ids, check Cloud Map console for Operations.
- High registration latency ⇒ ensure network access to AWS endpoints and check IAM throttling (CloudWatch Metrics).

## Testing Locally

For local development, set `AWS_REGION` and provide credentials or use a local mock (e.g., LocalStack):

```bash
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
# or run LocalStack and set endpoints in SDK client
pnpm --filter services/auth-service dev
```

When using LocalStack you may need to override endpoints in the SDK constructors inside `service-registry.ts`.

## Next Steps & Enhancements

- Add a small internal `/internal/registry` HTTP route to dump `getAllInstances()` for debugging.
- Add metrics and traces for register/deregister operations.
- Optionally integrate with ECS/EKS service discovery primitives to avoid manual registration when running on-managed platforms.

## References

- AWS Cloud Map (Service Discovery): https://docs.aws.amazon.com/cloud-map/
- AWS SDK v3 ServiceDiscovery Client: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-servicediscovery/

---

**Last Updated:** Feb 2, 2026
