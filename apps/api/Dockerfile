FROM node:20-alpine AS base
RUN npm install -g pnpm

# ---- Install all workspace dependencies ----
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --no-frozen-lockfile

# ---- Build ----
FROM deps AS build
WORKDIR /app

COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# Build shared package
RUN pnpm --filter @optima/shared build

# Generate Prisma client (writes into node_modules/.pnpm/@prisma+client/.../node_modules/@prisma/client)
WORKDIR /app/apps/api
RUN npx prisma generate

# Build TypeScript
WORKDIR /app
RUN pnpm --filter @optima/api build

# ---- Production runner ----
# Copy node_modules from the build stage so the pnpm-generated Prisma client
# (inside node_modules/.pnpm/) is available without a separate generate step.
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl && npm install -g pnpm

WORKDIR /app

# Copy workspace manifests and full node_modules from build
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
# shared package dist is needed because apps/api/node_modules/@optima/shared symlinks here
COPY --from=build /app/packages/shared ./packages/shared

# Copy built API output, prisma schema, and import scripts
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/scripts ./apps/api/scripts

WORKDIR /app/apps/api
EXPOSE 4000

CMD ["sh", "-c", "/app/node_modules/.bin/prisma db push --skip-generate --schema=/app/apps/api/prisma/schema.prisma && node dist/index.js"]
