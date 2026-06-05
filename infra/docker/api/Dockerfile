# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV HUSKY=0
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
RUN apk add --no-cache openssl

WORKDIR /app


# ---------------- deps ----------------
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/configs/package.json ./packages/configs/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY apps/api/package.json ./apps/api/package.json

COPY packages/shared ./packages/shared
COPY packages/configs ./packages/configs
COPY packages/types ./packages/types

RUN pnpm install --filter @v2bot/api... --frozen-lockfile


# ---------------- build ----------------
FROM deps AS build

COPY apps/api ./apps/api

RUN pnpm --filter @v2bot/shared build \
 && pnpm --filter @v2bot/api prisma:generate \
 && pnpm --filter @v2bot/api build


# ---------------- production ----------------
FROM node:22-alpine AS production

ENV NODE_ENV=production
ENV PORT=4000

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

# فقط چیزهای لازم (نه node_modules کامل!)
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/packages ./packages
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

COPY infra/docker/api/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER app

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/main.js"]