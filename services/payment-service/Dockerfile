FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY services/payment-service/package.json ./services/payment-service/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build --filter @t3ck/payment-service

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/services/payment-service/dist ./dist
COPY --from=builder /app/services/payment-service/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

EXPOSE 3010

CMD ["node", "dist/index.js"]
