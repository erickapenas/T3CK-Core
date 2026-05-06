# Runbook: Rollback Urgente

## Objetivo

Reverter rapidamente uma versão problemática.

## Critérios de rollback

- Erros 5xx > 2% por 5 min
- Falha de health checks
- Incidentes SEV-1/SEV-2 ligados ao deploy

## Comandos

### Linux/macOS

```
./scripts/rollback-production.sh all
```

### Windows

```
.\scripts\rollback-production.ps1 -Service all
```

## Validação

1. Confirmar ECS tasks em RUNNING.
2. Verificar `/health` em todos os serviços.
3. Monitorar logs por 15 min.
