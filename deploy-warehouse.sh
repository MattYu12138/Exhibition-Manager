#!/bin/bash
# 部署 Warehouse Manager 到生产服务器
# 用法：bash deploy-warehouse.sh

set -e

echo "=== [1/5] 拉取最新代码 ==="
cd /home/ubuntu/Exhibition-Manager
git pull origin main

echo "=== [2/5] 注册 Warehouse Manager 到 platform_systems ==="
sqlite3 /data/lic/LIC_DB.db "
INSERT OR IGNORE INTO platform_systems
  (id, name, display_name, description, url, icon, sort_order, is_active)
VALUES
  ('SYS00000003', 'warehouse-manager', 'Warehouse Manager',
   '仓库管理系统，货位管理、拣货导航与订单备货',
   'https://warehouse.lummiincolour.com.au', '🏭', 3, 1);
"
echo "platform_systems 已更新"

echo "=== [3/5] 构建 warehouse 容器 ==="
docker build -t exhibition-manager-warehouse-backend:latest ./warehouse-backend
docker build -t exhibition-manager-warehouse-frontend:latest ./warehouse-frontend

echo "=== [4/5] 启动新容器 ==="
docker compose up -d warehouse-backend warehouse-frontend

echo "=== [5/5] 配置 Nginx 反向代理 ==="
# 检查是否已有 warehouse 配置
if [ ! -f /etc/nginx/sites-available/warehouse.lummiincolour.com.au ]; then
  cat > /etc/nginx/sites-available/warehouse.lummiincolour.com.au << 'NGINX'
server {
    listen 80;
    server_name warehouse.lummiincolour.com.au;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name warehouse.lummiincolour.com.au;

    ssl_certificate     /etc/letsencrypt/live/lummiincolour.com.au/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lummiincolour.com.au/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8083;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
  ln -sf /etc/nginx/sites-available/warehouse.lummiincolour.com.au /etc/nginx/sites-enabled/
  nginx -t && systemctl reload nginx
  echo "Nginx 配置已添加"
else
  echo "Nginx 配置已存在，跳过"
fi

echo ""
echo "=== 部署完成 ==="
echo "  Warehouse Manager: https://warehouse.lummiincolour.com.au"
echo "  后端健康检查: curl https://warehouse.lummiincolour.com.au/api/health"
