# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV HUSKY=0
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/configs/package.json ./packages/configs/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY apps/bot/package.json ./apps/bot/package.json
COPY packages/shared ./packages/shared
COPY packages/configs ./packages/configs
COPY packages/types ./packages/types
RUN pnpm install --filter @v2bot/bot... --frozen-lockfile

FROM deps AS build
COPY apps/bot ./apps/bot
RUN pnpm --filter @v2bot/shared build \
  && pnpm --filter @v2bot/bot build

FROM node:22-alpine AS production
ENV NODE_ENV=production
RUN apk add --no-cache procps && addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/bot/package.json ./apps/bot/package.json
COPY --from=build /app/apps/bot/dist ./apps/bot/dist

USER app
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD pgrep -f "apps/bot/dist/main.js" >/dev/null || exit 1
CMD ["node", "apps/bot/dist/main.js"]
