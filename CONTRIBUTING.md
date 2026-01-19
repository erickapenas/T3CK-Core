# Guia de Contribuição

## Setup do Ambiente

1. Clone o repositório
2. Instale dependências: `pnpm install`
3. Configure variáveis de ambiente (ver `.env.example`)
4. Execute testes: `pnpm test`

## Padrões de Código

- TypeScript strict mode
- ESLint + Prettier
- Testes unitários obrigatórios
- Coverage mínimo: 80%

## Workflow

1. Criar branch: `git checkout -b feature/nova-feature`
2. Fazer alterações
3. Executar lint: `pnpm lint`
4. Executar testes: `pnpm test`
5. Commit: `git commit -m "feat: nova feature"`
6. Push: `git push origin feature/nova-feature`
7. Abrir Pull Request

## Commits

Seguir [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` Nova feature
- `fix:` Correção de bug
- `docs:` Documentação
- `style:` Formatação
- `refactor:` Refatoração
- `test:` Testes
- `chore:` Tarefas de manutenção

## Pull Requests

- Descrição clara do que foi alterado
- Referenciar issues relacionadas
- Garantir que todos os testes passam
- Garantir que o build passa
