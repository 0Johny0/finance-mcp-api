# FinanceMCP REST API

## 快速开始

### 1. 在 GitHub Fork 本仓库并配置

仓库 Settings → Secrets and variables → Actions，无需额外配置，
`GITHUB_TOKEN` 会自动用于 GHCR 推送。

首次 push 到 main 分支后，GitHub Actions 会自动构建镜像并推送到
`ghcr.io/你的用户名/finance-mcp-api:latest`。

### 2. 在 NAS 上部署

```bash
mkdir -p /volume1/docker/finance-mcp
cd /volume1/docker/finance-mcp

# 创建 .env 文件
cat > .env << 'EOF'
TUSHARE_TOKEN=你的token写在这里
EOF

# 下载 compose 文件（或手动复制）
wget https://raw.githubusercontent.com/你的用户名/finance-mcp-api/main/docker-compose.yml

# 拉取镜像并启动
docker compose up -d

# 验证
curl http://localhost:3100/health
