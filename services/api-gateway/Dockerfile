FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/shared ./packages/shared
COPY services/api-gateway ./services/api-gateway

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Build shared package first
RUN pnpm --filter @t3ck/shared build

# Build api-gateway
RUN pnpm --filter @t3ck/api-gateway build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY services/api-gateway/package.json ./services/api-gateway/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/services/api-gateway/dist ./services/api-gateway/dist

WORKDIR /app/services/api-gateway

EXPOSE 3000

CMD ["node", "dist/index.js"]
