# ---- build (compila TS + módulos nativos como bcrypt) ----
FROM node:20-alpine AS build
WORKDIR /app
# toolchain necessária para compilar bcrypt no Alpine (musl)
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime (só o necessário, sem toolchain) ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
COPY --from=build /app/scripts ./scripts
EXPOSE 3000
# roda migrations (idempotente) e sobe a API
CMD ["sh", "-c", "npm run db:migrate && node dist/main.js"]
