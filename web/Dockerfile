# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# VITE_API_URL vazio de propósito: o front chama /api no MESMO domínio,
# e o nginx-proxy encaminha /api pro backend (sem CORS, sem domínio hardcoded).
ENV VITE_API_URL=""
RUN npm run build

# ---- runtime (nginx estático) ----
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
