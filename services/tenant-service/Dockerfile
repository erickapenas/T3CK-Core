FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/shared ./packages/shared
COPY services/tenant-service ./services/tenant-service

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @t3ck/shared build
RUN pnpm --filter @t3ck/tenant-service build

# Produção
FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY services/tenant-service/package.json ./services/tenant-service/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/services/tenant-service/dist ./services/tenant-service/dist

WORKDIR /app/services/tenant-service

EXPOSE 3003

CMD ["node", "dist/index.js"]
