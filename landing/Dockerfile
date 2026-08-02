# Landing page (Next.js). Runtime `next start` a partir do build `standalone`.
#
# Por que um processo Node e não um build estático servido por nginx: é o Next
# que entrega o SSR, o `llms.txt` gerado do conteúdo e a porta aberta para
# rota dinâmica no futuro. O `standalone` é o que mantém isso barato — ele
# empacota só as dependências realmente usadas, não o `node_modules` inteiro.

# ---- build ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# A URL canônica entra no BUILD (vai para <link rel=canonical>, OG e sitemap).
# Errada aqui, o Google indexa o endereço errado — por isso é argumento e não
# um valor fixo no código.
ARG NEXT_PUBLIC_SITE_URL=https://chegou.bellory.com.br
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build

# ---- runtime ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usuário sem privilégio: o processo é exposto à internet pelo proxy.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# O standalone traz o `server.js` e as dependências; `static` e `public` são
# copiados à parte porque o Next não os embute no bundle do servidor.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
