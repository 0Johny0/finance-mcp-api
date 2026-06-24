# ============================================
# 阶段 1：构建 FinanceMCP
# ============================================
FROM node:18-alpine AS mcp-builder

RUN apk add --no-cache git

WORKDIR /build
RUN git clone --depth 1 https://github.com/guangxiangdebizi/FinanceMCP.git finance-mcp

WORKDIR /build/finance-mcp
RUN npm ci && npm run build

# ============================================
# 阶段 2：安装 API 包装层依赖
# ============================================
FROM node:18-alpine AS api-builder

WORKDIR /build/api
COPY api/package.json ./
RUN npm ci --omit=dev

# ============================================
# 阶段 3：最终运行镜像
# ============================================
FROM node:18-alpine

LABEL org.opencontainers.image.source="https://github.com/你的用户名/finance-mcp-api"
LABEL org.opencontainers.image.description="FinanceMCP REST API for WidgetKit"

WORKDIR /app

# 拷贝 FinanceMCP 编译产物 + node_modules
COPY --from=mcp-builder /build/finance-mcp /app/finance-mcp

# 拷贝 API 包装层
COPY --from=api-builder /build/api/node_modules /app/api/node_modules
COPY api/package.json /app/api/
COPY api/server.js /app/api/

WORKDIR /app/api

ENV TUSHARE_TOKEN=""
ENV API_PORT=3100
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD wget -qO- http://localhost:3100/health || exit 1

CMD ["node", "server.js"]
