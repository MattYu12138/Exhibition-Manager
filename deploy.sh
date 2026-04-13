#!/bin/bash
# ============================================================
# Exhibition Manager - 生产服务器部署脚本
# 用法: ./deploy.sh
#
# 【环境分离说明】
#   本地开发: 使用 exhibition-backend/.env（从 .env.development.example 复制修改）
#   生产服务器: 使用 /home/ubuntu/.env.exhibition.production（永久保存在 git 仓库外）
#
#   首次部署前请先执行:
#     cp exhibition-backend/.env.production.example /home/ubuntu/.env.exhibition.production
#     nano /home/ubuntu/.env.exhibition.production   # 填入真实密钥
#
#   之后每次 ./deploy.sh 会自动从该文件注入配置，git pull 不会影响它
# ============================================================
set -e

APP_DIR="/home/ubuntu/Exhibition-Manager"
FRONTEND_DIR="$APP_DIR/exhibition-frontend"
BACKEND_DIR="$APP_DIR/exhibition-backend"
DATA_DIR="/data/exhibition-app"
BACKUP_DIR="$DATA_DIR/backups"

# 生产环境配置永久存储路径（在 git 仓库之外，不受 git pull 影响）
PROD_ENV_FILE="/home/ubuntu/.env.exhibition.production"

# ─── 检查生产配置文件 ─────────────────────────────────────────
if [ ! -f "$PROD_ENV_FILE" ]; then
  echo "❌ 未找到生产环境配置文件: $PROD_ENV_FILE"
  echo ""
  echo "首次部署请先执行:"
  echo "  cp $BACKEND_DIR/.env.production.example $PROD_ENV_FILE"
  echo "  nano $PROD_ENV_FILE   # 填入真实的 API 密钥和密码"
  echo ""
  exit 1
fi

echo "===== [0/5] 备份数据库 ====="
mkdir -p "$BACKUP_DIR"
DB_FILE="$DATA_DIR/database/exhibition.db"
if [ -f "$DB_FILE" ]; then
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  cp "$DB_FILE" "$BACKUP_DIR/pre_deploy_${TIMESTAMP}.sqlite"
  echo "✓ 数据库已备份到 $BACKUP_DIR/pre_deploy_${TIMESTAMP}.sqlite"
  # 只保留最近 10 个备份
  ls -t "$BACKUP_DIR"/*.sqlite 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
else
  echo "⚠ 未找到数据库文件，跳过备份"
fi
echo ""

echo "===== [1/5] 拉取最新代码 ====="
cd "$APP_DIR"
# .env 已在 .gitignore 中，git stash 不会影响它
# 但以防万一，先清理其他未追踪文件
git stash 2>/dev/null || true
git pull origin main
git stash drop 2>/dev/null || true
echo "✓ 代码已更新到最新版本"
echo ""

echo "===== [2/5] 注入生产环境配置 ====="
# Exhibition Manager
cp "$PROD_ENV_FILE" "$BACKEND_DIR/.env"
echo "✓ Exhibition Manager 配置已注入"

# Platform Backend
if [ -f /home/ubuntu/.env.platform.production ]; then
  cp /home/ubuntu/.env.platform.production "$APP_DIR/platform-backend/.env"
  echo "✓ Platform Backend 配置已注入"
else
  echo "⚠ 未找到 /home/ubuntu/.env.platform.production，使用示例配置"
  cp "$APP_DIR/platform-backend/.env.example" "$APP_DIR/platform-backend/.env" 2>/dev/null || true
fi

# Inventory Backend
if [ -f /home/ubuntu/.env.inventory.production ]; then
  cp /home/ubuntu/.env.inventory.production "$APP_DIR/inventory-backend/.env"
  echo "✓ Inventory Backend 配置已注入"
else
  echo "⚠ 未找到 /home/ubuntu/.env.inventory.production，使用示例配置"
  cp "$APP_DIR/inventory-backend/.env.example" "$APP_DIR/inventory-backend/.env" 2>/dev/null || true
fi

# 确保数据目录存在
mkdir -p /data/lummi-platform
echo ""

echo "===== [3/5] 构建前端 ====="
cd "$FRONTEND_DIR"
npm install --silent
npm run build
echo "✓ 前端构建完成"
echo ""

echo "===== [4/5] 重建并重启 Docker 容器 ====="
cd "$APP_DIR"
sudo docker compose build --no-cache
sudo docker compose up -d --force-recreate
echo ""

echo "===== [5/5] 健康检查 ====="
sleep 4
STATUS=$(curl -s http://localhost:3001/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('status:', d.get('status'), '| shopify:', d.get('shopify_configured'), '| square:', d.get('square_configured'))" 2>/dev/null || echo "健康检查失败，请查看日志: docker compose logs")
echo "✓ $STATUS"
echo ""
echo "✅ 部署完成！"
echo "   https://exhibition.lummiincolour.com.au"
