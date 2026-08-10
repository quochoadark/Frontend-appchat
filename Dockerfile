# ==========================================
# Stage 1: Build React Native Expo Web Bundle
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package descriptors
COPY package.json package-lock.json ./
RUN npm ci

# Copy source files & build production web bundle
COPY . .
ENV NODE_ENV=production
RUN npx expo export --platform web || npm run build --if-present

# ==========================================
# Stage 2: Hardened Nginx Production Web Server
# ==========================================
FROM nginx:1.25-alpine AS runner
WORKDIR /usr/share/nginx/html

# Create custom non-root Nginx user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Remove default nginx static assets
RUN rm -rf ./*

# Copy exported static bundle from builder
COPY --from=builder --chown=appuser:appgroup /app/dist ./

# Security Headers Nginx Config
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    add_header X-Frame-Options "SAMEORIGIN"; \
    add_header X-Content-Type-Options "nosniff"; \
    add_header X-XSS-Protection "1; mode=block"; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Set permissions for non-root execution
RUN touch /var/run/nginx.pid && \
    chown -R appuser:appgroup /var/run/nginx.pid /var/cache/nginx /var/log/nginx

USER appuser
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
