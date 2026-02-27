FROM node:20-alpine

WORKDIR /app

COPY package.json tsconfig.json ./
COPY src ./src
COPY ../../packages/shared ../../packages/shared

RUN npm install -g pnpm && pnpm install --filter @t3ck/product-service... --frozen-lockfile=false
RUN pnpm --filter @t3ck/product-service build

EXPOSE 3004
CMD ["node", "dist/index.js"]
