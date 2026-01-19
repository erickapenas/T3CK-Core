#!/bin/bash

# Script para rodar serviços em modo desenvolvimento

set -e

echo "🚀 Iniciando serviços em modo desenvolvimento..."

# Verificar se .env existe
if [ ! -f .env ]; then
    echo "❌ Arquivo .env não encontrado. Execute ./scripts/setup.sh primeiro"
    exit 1
fi

# Carregar variáveis de ambiente
export $(cat .env | grep -v '^#' | xargs)

# Iniciar serviços em paralelo
echo "📦 Iniciando Auth Service na porta ${AUTH_SERVICE_PORT:-3001}..."
cd services/auth-service && pnpm dev &
AUTH_PID=$!

echo "📦 Iniciando Webhook Service na porta ${WEBHOOK_SERVICE_PORT:-3002}..."
cd ../webhook-service && pnpm dev &
WEBHOOK_PID=$!

echo "📦 Iniciando Tenant Service na porta ${TENANT_SERVICE_PORT:-3003}..."
cd ../tenant-service && pnpm dev &
TENANT_PID=$!

echo "✅ Serviços iniciados!"
echo "Auth Service: http://localhost:${AUTH_SERVICE_PORT:-3001}"
echo "Webhook Service: http://localhost:${WEBHOOK_SERVICE_PORT:-3002}"
echo "Tenant Service: http://localhost:${TENANT_SERVICE_PORT:-3003}"
echo ""
echo "Pressione Ctrl+C para parar todos os serviços"

# Aguardar sinais
trap "kill $AUTH_PID $WEBHOOK_PID $TENANT_PID; exit" INT TERM

wait
