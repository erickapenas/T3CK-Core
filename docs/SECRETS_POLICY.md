# T3CK Core — Secrets Policy

## Objetivo

Definir o tratamento de segredos e arquivos de ambiente do projeto T3CK Core.

## Regras obrigatórias

1. O arquivo `.env` é **local** e **não pode ser versionado**.
2. O arquivo `.env.example` é o único modelo permitido no repositório.
3. Segredos de staging e produção devem ficar em:
   - Google Secret Manager
   - Google Secret Manager
4. Chaves privadas, tokens, credenciais de banco, DSNs sensíveis e webhook secrets não devem aparecer em commits, logs, screenshots, documentação ou tickets.
5. Arquivos de chave (`*.pem`, `*.key`) e diretórios de segredo não devem ser versionados.

## Evidências atuais do repositório

### Proteções já presentes
- `.gitignore` ignora `.env`, `.env.local` e `.env.*.local`
- `.gitignore` ignora `*.pem`, `*.key` e `secrets/`
- `docs/CONFIG_MANAGEMENT_IMPLEMENTATION.md` define uso de Google Secret Manager
- `.env.example` já orienta uso de values seguros em secret manager para produção

### Achado crítico
Existe um arquivo `.env` na raiz do projeto contendo material sensível real. Mesmo que o `.gitignore` reduza o risco de versionamento, a presença desse arquivo exige controle operacional.

## Tratamento do `.env`

### Desenvolvimento local
- permitido apenas para ambiente local
- deve conter somente o mínimo necessário
- não deve ser compartilhado por chat, e-mail ou commit
- deve ser regenerado a partir de `.env.example` quando necessário

### Staging e produção
- proibido depender de `.env` local distribuído manualmente
- obrigatório usar stores centralizados de segredo
- obrigatório usar credenciais com rotação e princípio do menor privilégio

## Procedimento recomendado

### Criação
1. Copiar `.env.example` para `.env`
2. Preencher somente para uso local
3. Nunca reutilizar segredos de produção em desenvolvimento

### Rotação
1. Rotacionar credenciais comprometidas ou expostas imediatamente
2. Rotacionar credenciais operacionais em janela periódica definida
3. Atualizar stores centralizados antes de atualizar workloads
4. Revogar material antigo após validação

### Incidente de exposição
1. Assumir comprometimento do segredo exposto
2. Rotacionar imediatamente os segredos afetados
3. Revisar logs, acessos e integrações impactadas
4. Registrar incidente e evidências
5. Validar limpeza do histórico e artefatos derivados

## Requisitos de documentação

Toda documentação futura deve:
- usar placeholders
- evitar exemplos com chaves reais
- apontar para Secrets Manager / Parameter Store
- informar que `.env` é apenas local

## Status atual

- Política de ignore: adequada
- Modelo `.env.example`: adequado como base
- Store centralizado: documentado
- Presença de `.env` sensível local: requer ação corretiva operacional

## Ações imediatas recomendadas

1. Rotacionar todos os segredos reais presentes no `.env` local.
2. Substituir qualquer credencial reutilizada em outros ambientes.
3. Revisar histórico git para confirmar que `.env` nunca foi commitado.
4. Manter `.env` somente como arquivo local temporário.
5. Preferir bootstrap automatizado puxando segredos do store centralizado.
