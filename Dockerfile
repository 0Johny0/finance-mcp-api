FROM node:18-alpine

LABEL org.opencontainers.image.description="Market Data REST API (Yahoo Finance)"

WORKDIR /app

COPY api/package.json ./
RUN npm install --omit=dev

COPY api/server.js ./

ENV API_PORT=3100
ENV NODE_ENV=production

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3100/health || exit 1

CMD ["node", "server.js"]
