# Runbook: Failover de Banco (RDS)

## Objetivo

Restaurar conectividade do tenant-service com RDS.

## Sintomas

- Erros 5xx no tenant-service
- Logs com `ER_ACCESS_DENIED_ERROR` ou `ECONNREFUSED`
- Latência alta em operações de banco

## Verificações rápidas

1. Verificar status do RDS no console AWS.
2. Verificar métricas: CPU, conexões, FreeStorageSpace.
3. Verificar Security Group do RDS.

## Ações

1. Confirmar se o endpoint aponta para o writer atual.
2. Se Multi-AZ, iniciar failover manual pelo console (caso necessário).
3. Verificar se o Secrets Manager contém as credenciais atuais.
4. Reiniciar tarefas ECS do tenant-service após failover.

## Pós-ação

- Rodar health check `/health`
- Validar criação/consulta de tenant
- Atualizar registro do incidente
