#!/bin/bash
# ============================================================
# Exhibition Manager - Safe Deploy Script (Docker)
# 用法: ./deploy.sh
# 功能:
#   0. 备份数据库
#   1. 备份并保留 .env 文件（不被 git 覆盖）
#   2. 拉取最新代码（git stash 避免冲突）
#   3. 恢复 .env
#   4. 构建前端
#   5. 重建并重启 Docker 容器
# ============================================================

set -e

APP_DIR="/home/ubuntu/Exhibition-Manager"
FRONTEND_DIR="$APP_DIR/frontend"
BACKEND_DIR="$APP_DIR/backend"
DATA_DIR="/data/exhibition-app"
BACKUP_DIR="$DATA_DIR/backups"
ENV_BACKUP="/home/ubuntu/.env.exhibition.backup"

echo "===== [0/5] 备份数据库 ====="
mkdir -p "$BACKUP_DIR"
DB_FILE="$DATA_DIR/database/exhibition.db"
if [ -f "$DB_FILE" ]; then
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  cp "$DB_FILE" "$BACKUP_DIR/pre_deploy_${TIMESTAMP}.sqlite"
  echo "✓ 数据库已备份到 $BACKUP_DIR/pre_deploy_${TIMESTAMP}.sqlite"
else
  echo "⚠ 未找到数据库文件，跳过备份"
fi

echo ""
echo "===== [1/5] 备份 .env 文件 ====="
if [ -f "$BACKEND_DIR/.env" ]; then
  cp "$BACKEND_DIR/.env" "$ENV_BACKUP"
  echo "✓ .env 已备份到 $ENV_BACKUP"
else
  echo "⚠ 未找到 .env 文件"
fi

echo ""
echo "===== [2/5] 拉取最新代码 ====="
cd "$APP_DIR"
git stash --include-untracked 2>/dev/null || true
git pull origin main
git stash drop 2>/dev/null || true
echo "✓ 代码已更新到最新版本"

echo ""
echo "===== [3/5] 恢复 .env 文件 ====="
if [ -f "$ENV_BACKUP" ]; then
  cp "$ENV_BACKUP" "$BACKEND_DIR/.env"
  echo "✓ .env 已恢复"
else
  echo "⚠ 无 .env 备份，请手动检查配置"
fi

echo ""
echo "===== [4/5] 构建前端 ====="
cd "$FRONTEND_DIR"
npm install --silent
npm run build
echo "✓ 前端构建完成"

echo ""
echo "===== [5/5] 重建并重启 Docker 容器 ====="
cd "$APP_DIR"
sudo docker compose build --no-cache
sudo docker compose up -d --force-recreate
sleep 3
STATUS=$(curl -s http://localhost:3001/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','unknown'))" 2>/dev/null || echo "error")
echo "✓ 健康检查: $STATUS"

echo ""
echo "✅ 部署完成！"
echo "   https://exhibition.lummiincolour.com.au"
