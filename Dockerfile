# Web UI stage: own lockfile, install scripts disabled (web/.npmrc), typecheck + security gate run as part of the build.
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json web/.npmrc ./
RUN npm ci --no-audit --no-fund --ignore-scripts
COPY web/ ./
RUN npm run build

# Build stage: full dependencies, TypeScript compiled to dist/. Also used as the `test` service image.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
COPY methodology ./methodology
COPY test ./test
COPY scripts ./scripts
COPY fixtures ./fixtures
COPY evals ./evals
COPY templates ./templates
COPY --from=web /web/src/api ./web/src/api
RUN npm run build && mkdir -p dist/data && cp src/data/*.json dist/data/

# Runtime stage: production dependencies and the compiled engine only.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/data ./src/data
COPY --from=web /web/dist ./web/dist
COPY migrations ./migrations
COPY methodology ./methodology
COPY fixtures ./fixtures
# The RCM template: offered to users who have no RCM, and filled in by `seed` for the demo engagement.
COPY templates ./templates
EXPOSE 8765
# Run as the image's unprivileged user; the app's files stay root-owned, so the process cannot modify its own code.
USER node
CMD ["node", "dist/server.js"]
