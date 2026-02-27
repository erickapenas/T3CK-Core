FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/shared ./packages/shared
COPY services/admin-service ./services/admin-service

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @t3ck/shared build
RUN pnpm --filter @t3ck/admin-service build

FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY services/admin-service/package.json ./services/admin-service/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/services/admin-service/dist ./services/admin-service/dist

WORKDIR /app/services/admin-service

EXPOSE 3006

CMD ["node", "dist/index.js"]
