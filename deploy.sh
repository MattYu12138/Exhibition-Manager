#!/bin/bash
# ============================================================
# Exhibition Manager - Safe Deploy Script
# 用法: ./deploy.sh
# 功能:
#   1. 备份数据库
#   2. 备份并保留 .env 文件（不被 git 覆盖）
#   3. 拉取最新代码
#   4. 恢复 .env
#   5. 安装依赖并重新编译 better-sqlite3（原生模块）
#   6. 重启 PM2
# ============================================================

set -e

APP_DIR="/home/ubuntu/Exhibition-Manager"
DATA_DIR="/data/exhibition-app"
BACKUP_DIR="$DATA_DIR/backups"
ENV_BACKUP="/tmp/exhibition_env_backup"

echo "===== [1/6] 备份数据库 ====="
mkdir -p "$BACKUP_DIR"
if [ -f "$DATA_DIR/exhibition.db" ]; then
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  cp "$DATA_DIR/exhibition.db" "$BACKUP_DIR/pre_deploy_${TIMESTAMP}.sqlite"
  echo "✓ 数据库已备份到 $BACKUP_DIR/pre_deploy_${TIMESTAMP}.sqlite"
else
  echo "⚠ 未找到数据库文件，跳过备份"
fi

echo ""
echo "===== [2/6] 备份 .env 文件 ====="
if [ -f "$APP_DIR/backend/.env" ]; then
  cp "$APP_DIR/backend/.env" "$ENV_BACKUP"
  echo "✓ .env 已备份到 $ENV_BACKUP"
else
  echo "⚠ 未找到 .env 文件"
fi

echo ""
echo "===== [3/6] 拉取最新代码 ====="
cd "$APP_DIR"
git fetch origin main
git reset --hard origin/main
echo "✓ 代码已更新到最新版本"

echo ""
echo "===== [4/6] 恢复 .env 文件 ====="
if [ -f "$ENV_BACKUP" ]; then
  cp "$ENV_BACKUP" "$APP_DIR/backend/.env"
  echo "✓ .env 已恢复"
else
  echo "⚠ 无 .env 备份，请手动检查配置"
fi

echo ""
echo "===== [5/6] 安装依赖并重新编译原生模块 ====="
cd "$APP_DIR/backend"
npm install --production
# 强制重新编译 better-sqlite3（避免跨平台 ELF 错误）
npm rebuild better-sqlite3
echo "✓ 依赖安装完成，better-sqlite3 已重新编译"

echo ""
echo "===== [6/6] 重启 PM2 ====="
pm2 restart exhibition-manager --update-env
sleep 2
pm2 status exhibition-manager
echo ""
echo "✅ 部署完成！"
