# Blocks Release builds this image with Kaniko (see blocks release deploy).
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_BLOCKS_API_URL
ARG VITE_BLOCKS_X_BLOCKS_KEY
ARG VITE_BLOCKS_APP_DOMAIN
ARG VITE_BLOCKS_OIDC_URL
ARG VITE_BLOCKS_OIDC_CLIENT_ID
ARG VITE_BLOCKS_OIDC_SCOPE=openid profile
ENV VITE_BLOCKS_API_URL=$VITE_BLOCKS_API_URL \
    VITE_BLOCKS_X_BLOCKS_KEY=$VITE_BLOCKS_X_BLOCKS_KEY \
    VITE_BLOCKS_APP_DOMAIN=$VITE_BLOCKS_APP_DOMAIN \
    VITE_BLOCKS_OIDC_URL=$VITE_BLOCKS_OIDC_URL \
    VITE_BLOCKS_OIDC_CLIENT_ID=$VITE_BLOCKS_OIDC_CLIENT_ID \
    VITE_BLOCKS_OIDC_SCOPE=$VITE_BLOCKS_OIDC_SCOPE
RUN pnpm build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Non-root, read-only-root-fs pods: unprivileged port 8080, no pid file to write,
# temp dirs pre-created (nginx only mkdirs them at startup when missing), and no
# entrypoint scripts that rewrite /etc/nginx.
RUN sed -i 's|^pid .*|pid /dev/null;|' /etc/nginx/nginx.conf \
  && mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp \
     /var/cache/nginx/fastcgi_temp /var/cache/nginx/uwsgi_temp /var/cache/nginx/scgi_temp \
  && chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx \
  && rm -f /docker-entrypoint.d/*
# Numeric uid (nginx = 101): runAsNonRoot can't verify a named user and rejects the pod.
USER 101:101
EXPOSE 8080
