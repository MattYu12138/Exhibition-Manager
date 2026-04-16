#!/bin/bash
# ============================================================
# Exhibition Manager - 生产服务器部署脚本
# 用法: ./deploy.sh
#
# 【环境分离说明】
#   本地开发: 各后端目录下的 .env（从 .env.example 复制修改）
#   生产服务器: 以下三个文件永久保存在 git 仓库外，不受 git pull 影响
#     /home/ubuntu/.env.exhibition.production
#     /home/ubuntu/.env.platform.production
#     /home/ubuntu/.env.inventory.production
#
#   首次部署前请先执行:
#     cp exhibition-backend/.env.example /home/ubuntu/.env.exhibition.production
#     cp platform-backend/.env.example   /home/ubuntu/.env.platform.production
#     cp inventory-backend/.env.example  /home/ubuntu/.env.inventory.production
#     # 然后编辑三个文件，填入真实密钥和生产路径
#
#   之后每次 ./deploy.sh 会自动从这三个文件注入配置
# ============================================================
set -e

APP_DIR="/home/ubuntu/Exhibition-Manager"
DATA_DIR="/data/lic"
BACKUP_DIR="$DATA_DIR/backups"
DB_FILE="$DATA_DIR/database/LIC_DB.db"

# 生产环境配置文件路径
ENV_EXHIBITION="/home/ubuntu/.env.exhibition.production"
ENV_PLATFORM="/home/ubuntu/.env.platform.production"
ENV_INVENTORY="/home/ubuntu/.env.inventory.production"

# ─── 检查生产配置文件 ─────────────────────────────────────────
MISSING=0
for f in "$ENV_EXHIBITION" "$ENV_PLATFORM" "$ENV_INVENTORY"; do
  if [ ! -f "$f" ]; then
    echo "❌ 未找到生产环境配置文件: $f"
    MISSING=1
  fi
done
if [ "$MISSING" -eq 1 ]; then
  echo ""
  echo "首次部署请参考各后端目录下的 .env.example 创建以上文件"
  exit 1
fi

echo "===== [0/5] 备份数据库 ====="
mkdir -p "$BACKUP_DIR"
if [ -f "$DB_FILE" ]; then
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  cp "$DB_FILE" "$BACKUP_DIR/pre_deploy_${TIMESTAMP}.sqlite"
  echo "✓ 数据库已备份到 $BACKUP_DIR/pre_deploy_${TIMESTAMP}.sqlite"
  # 只保留最近 10 个备份
  ls -t "$BACKUP_DIR"/*.sqlite 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
else
  echo "⚠ 未找到数据库文件 $DB_FILE，跳过备份"
fi
echo ""

echo "===== [1/5] 拉取最新代码 ====="
cd "$APP_DIR"
git stash 2>/dev/null || true
git pull origin main
git stash drop 2>/dev/null || true
echo "✓ 代码已更新到最新版本"
echo ""

echo "===== [2/5] 注入生产环境配置 ====="
cp "$ENV_EXHIBITION" "$APP_DIR/exhibition-backend/.env"
echo "✓ Exhibition Backend 配置已注入"

cp "$ENV_PLATFORM" "$APP_DIR/platform-backend/.env"
echo "✓ Platform Backend 配置已注入"

cp "$ENV_INVENTORY" "$APP_DIR/inventory-backend/.env"
echo "✓ Inventory Backend 配置已注入"

# 确保数据目录存在
mkdir -p "$DATA_DIR/database"
echo ""

echo "===== [3/5] 重建 Docker 镜像 ====="
cd "$APP_DIR"
sudo docker compose build --no-cache
echo "✓ 镜像构建完成"
echo ""

echo "===== [4/5] 重启 Docker 容器 ====="
sudo docker compose up -d --force-recreate
echo ""

echo "===== [5/5] 健康检查 ====="
sleep 5
for PORT in 3000 3001 3002; do
  STATUS=$(curl -s "http://localhost:$PORT/api/health" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "无响应")
  echo "  Port $PORT: $STATUS"
done
echo ""
echo "✅ 部署完成！"
echo "   Platform:   https://licplatform.lummiincolour.com.au"
echo "   Exhibition: https://exhibition.lummiincolour.com.au"
echo "   Inventory:  https://inventory.lummiincolour.com.au"
