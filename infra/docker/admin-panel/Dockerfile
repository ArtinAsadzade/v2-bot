# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV HUSKY=0

ENV PNPM_CONFIG_MINIMUM_RELEASE_AGE=0
ENV COREPACK_ENABLE_STRICT=0

RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app


FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

COPY packages/ui ./packages/ui
COPY packages/configs ./packages/configs
COPY apps/admin-panel/package.json ./apps/admin-panel/package.json

RUN pnpm install --filter @v2bot/admin-panel... --frozen-lockfile


FROM deps AS build

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY apps/admin-panel ./apps/admin-panel

RUN pnpm --filter @v2bot/ui build \
 && pnpm --filter @v2bot/admin-panel build


FROM node:22-alpine AS production

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

# IMPORTANT: standalone root files
COPY --from=build /app/apps/admin-panel/.next/standalone ./
COPY --from=build /app/apps/admin-panel/.next/static ./apps/admin-panel/.next/static
COPY --from=build /app/apps/admin-panel/public ./apps/admin-panel/public

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
CMD node -e "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# FIX: standalone entrypoint
CMD ["node", "server.js"]