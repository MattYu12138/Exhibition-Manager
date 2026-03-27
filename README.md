# 展会备货与盘点管理系统 (Shopify & Square 集成)

这是一个专为展会场景设计的私有 App，旨在帮助商家高效管理展会备货清单、进行货品清点，并通过集成 Shopify 与 Square API，实现展会前后的库存同步与差值计算。

## 核心功能

1. **商品管理**：从 Shopify 后台拉取商品数据（含变体、SKU、GTIN 等）。
2. **展会备货**：创建展会，选择需要带到展会的商品并设置计划带走数量。
3. **货品清点**：提供可视化的清点清单，支持逐件打勾或按商品一键全选。
4. **库存同步与盘点**：
   - **出发前**：记录 Square 当前库存快照。
   - **展会后**：获取 Square 最新库存，通过差值计算展会销售量和剩余物品数量。
   - **库存更新**：将计算出的剩余数量一键同步回 Square。

## 技术栈

- **前端**：Vue 3 + Vite + Pinia + Vue Router + Element Plus
- **后端**：Node.js + Express + SQLite (Better-SQLite3)
- **接口集成**：Shopify Admin REST API, Square Inventory/Catalog API

## 部署与运行指南

### 1. 环境要求
- Node.js (v18 或更高版本)
- npm 或 yarn

### 2. 获取 API 密钥

**Shopify 密钥获取**：
1. 登录 Shopify 后台，进入 `Settings` -> `Apps and sales channels` -> `Develop apps`。
2. 点击 `Create an app`，命名为“展会管理系统”。
3. 在 `Configuration` 中，配置 `Admin API integration`，勾选以下权限（Scopes）：
   - `read_products`
   - `read_inventory`
4. 点击 `Install app` 获取 `Admin API access token`（以 `shpat_` 开头）。

**Square 密钥获取**：
1. 登录 [Square Developer Dashboard](https://developer.squareup.com/apps)。
2. 创建一个新应用。
3. 在 `Credentials` 页面获取 `Access token`（支持 Sandbox 和 Production）。
4. 在 `Locations` 页面获取对应的 `Location ID`。

### 3. 后端配置与启动

```bash
cd backend
npm install

# 复制环境变量文件并填入你的 API 密钥
cp .env.example .env
```

编辑 `.env` 文件，填入真实信息：
```env
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

SQUARE_ACCESS_TOKEN=your_square_access_token
SQUARE_LOCATION_ID=your_square_location_id
SQUARE_ENVIRONMENT=sandbox  # 或 production

PORT=3001
FRONTEND_URL=http://localhost:5173
```

启动后端服务：
```bash
npm start
```

### 4. 前端配置与启动

```bash
cd frontend
npm install

# 启动开发服务器
npm run dev
```
前端将在 `http://localhost:5173` 启动，自动代理 API 请求至后端。

## 使用流程说明

1. **新建展会**：在首页点击“新建展会”，填写基本信息。
2. **选择商品**：进入展会详情，点击“选择商品”，从 Shopify 商品库中挑选并设置数量。
3. **出发前同步**：在展会详情页点击“出发前同步”，系统会记录 Square 中对应商品的当前库存。
4. **货品清点**：点击“清点货品”，对着实物逐一打勾确认。
5. **展会后盘点**：展会结束后，点击“展会结束盘点” -> “展会结束同步”，系统会自动计算剩余数量。
6. **更新库存**：确认差值无误后，点击“将剩余数量同步至 Square”完成闭环。

## 匹配规则说明
系统在同步 Square 库存时，优先通过商品的 **GTIN** 进行精确匹配。如果 GTIN 缺失，将尝试通过 **商品名称** 进行模糊匹配。为保证盘点准确性，强烈建议在 Shopify 和 Square 中保持 GTIN（条形码）一致。
