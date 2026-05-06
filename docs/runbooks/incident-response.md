# Runbook: Incidentes (Geral)

## Objetivo

Restaurar serviço com impacto mínimo e registrar causas.

## Severidades

- **SEV-1**: Sistema indisponível / perda de dados
- **SEV-2**: Degradação significativa / falha parcial
- **SEV-3**: Erro localizado / workaround disponível

## Checklist inicial (5 min)

1. Identificar serviço afetado (auth, webhook, tenant).
2. Verificar status do ALB e health checks.
3. Verificar logs do ECS e erros 5xx no CloudWatch.
4. Verificar fila (BullMQ) e Redis.
5. Registrar início do incidente.

## Passos de contenção

1. Se houver deploy recente, faça rollback imediato.
2. Reduza tráfego (rate limit / WAF) se necessário.
3. Aplique workaround temporário (feature flag se existir).

## Diagnóstico

- Logs do ECS:
  - `/aws/ecs/t3ck-cluster`
- Status do ECS:
  - `aws ecs describe-services --cluster t3ck-cluster --services auth-service webhook-service tenant-service`
- Status do ALB:
  - `aws elbv2 describe-target-health --target-group-arn <ARN>`

## Comunicação

- Notificar time no canal de incidentes.
- Atualizar status page (se aplicável).

## Encerramento

1. Confirmar estabilidade por 30 min.
2. Registrar causa raiz e ações preventivas.
3. Criar ticket de follow-up.
