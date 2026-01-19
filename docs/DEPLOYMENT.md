# Guia de Deploy

## Deploy Automático

O deploy é automatizado via GitHub Actions:

- **Staging**: Push para `develop` → deploy automático
- **Production**: Push para `main` → deploy manual (requer aprovação)

## Deploy Manual

### Build

```bash
pnpm install
pnpm build
```

### Build Docker Images

```bash
docker build -t t3ck/auth-service:latest -f services/auth-service/Dockerfile .
docker build -t t3ck/webhook-service:latest -f services/webhook-service/Dockerfile .
docker build -t t3ck/tenant-service:latest -f services/tenant-service/Dockerfile .
```

### Push para ECR

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

docker tag t3ck/auth-service:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/t3ck/auth-service:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/t3ck/auth-service:latest
```

### Deploy no ECS

```bash
aws ecs update-service --cluster t3ck-cluster --service auth-service --force-new-deployment
```

## Rollback

Em caso de problemas:

```bash
# Listar revisões anteriores
aws ecs describe-services --cluster t3ck-cluster --services auth-service

# Fazer rollback para revisão anterior
aws ecs update-service --cluster t3ck-cluster --service auth-service --task-definition <previous-task-definition-arn>
```
