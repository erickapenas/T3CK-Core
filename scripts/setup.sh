#!/bin/bash

set -e

echo "🚀 Configurando ambiente de desenvolvimento T3CK..."

# Verificar pré-requisitos
echo "📋 Verificando pré-requisitos..."

command -v node >/dev/null 2>&1 || { echo "❌ Node.js não encontrado. Instale Node.js >= 18"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm não encontrado. Instale: npm install -g pnpm"; exit 1; }
command -v terraform >/dev/null 2>&1 || { echo "⚠️  Terraform não encontrado. Instale para usar IaC"; }
command -v aws >/dev/null 2>&1 || { echo "⚠️  AWS CLI não encontrado. Instale para deploy"; }
command -v docker >/dev/null 2>&1 || { echo "⚠️  Docker não encontrado. Instale para build de containers"; }

echo "✅ Pré-requisitos verificados"

# Instalar dependências
echo "📦 Instalando dependências..."
pnpm install

# Copiar arquivo .env.example se .env não existir
if [ ! -f .env ]; then
    echo "📝 Criando arquivo .env a partir de .env.example..."
    cp .env.example .env
    echo "⚠️  Configure as variáveis de ambiente no arquivo .env"
fi

# Build
echo "🔨 Fazendo build dos pacotes..."
pnpm build

echo "✅ Setup concluído!"
echo ""
echo "Próximos passos:"
echo "1. Configure o arquivo .env com suas credenciais"
echo "2. Configure AWS CLI: aws configure"
echo "3. Configure Firebase CLI: firebase login"
echo "4. Execute os testes: pnpm test"
echo "5. Inicie os serviços: pnpm dev"
