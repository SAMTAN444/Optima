FROM node:20-alpine AS base
RUN npm install -g pnpm

# ---- Install dependencies ----
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --no-frozen-lockfile

# ---- Build ----
FROM deps AS build
WORKDIR /app

# Build args baked into the bundle at build time
ARG VITE_API_URL=http://localhost:4000
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

RUN pnpm --filter @optima/shared build
RUN pnpm --filter @optima/web build

# ---- Serve with nginx ----
FROM nginx:alpine AS runner

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
