# =====================================================================
# Cupula Celestial - HMI Operador
# Multi-stage build con nginx + cabeceras de seguridad
# H-ALT-010 OPSEC: hostnames productivos parametrizados
# =====================================================================

# ---- Stage 1: build ----
FROM node:20-alpine AS builder
WORKDIR /app

# Solo dependencias primero (cache)
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Resto del codigo
COPY . .

# Variables de build (override en CI). Defaults parametrizados — NO usar hostnames
# operacionales reales por OPSEC.
ARG HMI_GW_HOSTNAME=localhost
ARG VITE_API_BASE_URL=https://${HMI_GW_HOSTNAME}
ARG VITE_WS_URL=wss://${HMI_GW_HOSTNAME}/ws
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_USE_MOCKS=false

RUN npm run build

# ---- Stage 2: nginx hardened ----
FROM nginx:1.27-alpine AS runtime

# Eliminar config por defecto
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/hmi.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# Endurecimiento basico
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

EXPOSE 8443
USER nginx

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -q --spider http://localhost:8443/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
