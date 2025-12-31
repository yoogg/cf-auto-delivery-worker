# 自动发卡系统

基于 Cloudflare Workers + D1 的自动数字码发放系统。

## 功能

- ✅ 幂等发卡（同用户+产品返回相同码）
- ✅ 并发安全（D1 事务）
- ✅ 每用户限额配置
- ✅ Web 管理后台
- ✅ 批量上传激活码

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 创建 D1 数据库
wrangler d1 create auto-delivery-db
# 复制 database_id 到 wrangler.toml

# 3. 设置 API 密钥
wrangler secret put API_SECRET

# 4. 初始化数据库
wrangler d1 execute auto-delivery-db --local --file=./schema.sql

# 5. 本地运行
npm run dev

# 6. 部署
npm run deploy
```

## 管理后台

访问 `/admin` 进入管理后台（需要 API_SECRET）。

功能：
- 产品管理（添加/编辑/删除）
- 设置每用户可获取的码数量
- 批量上传激活码
- 查看激活码状态

## API

### POST /api/get-code

获取激活码。

```json
// 请求
{ "product_id": "xxx", "password": "API_SECRET", "user": "user_id" }

// 响应
{ "success": true, "code": "XXXX-XXXX", "is_new": true, "count": 1, "max": 3 }
```

| 字段 | 说明 |
|------|------|
| code | 激活码 |
| is_new | 是否新分配 |
| count | 用户已获取数量 |
| max | 最大可获取数量 |

### POST /api/upload-codes

批量上传激活码。

```json
// 请求
{ "product_id": "xxx", "password": "API_SECRET", "codes": ["CODE1", "CODE2"] }

// 响应
{ "success": true, "inserted": 2, "duplicates": 0 }
```

### GET /api/inventory/:product_id?password=xxx

查询库存。

```json
{ "success": true, "available": 10, "assigned": 5 }
```

## 错误码

| 错误 | 说明 |
|------|------|
| NO_STOCK | 无可用库存 |
| PRODUCT_NOT_FOUND | 产品不存在 |
| 401 | 密码错误 |
