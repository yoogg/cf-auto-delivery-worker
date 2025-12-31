# 自动发卡系统

基于 Cloudflare Workers + D1 的自动数字码发放系统。

## 功能

- ✅ 幂等发卡（同用户+产品返回相同码）
- ✅ 并发安全（D1 事务）
- ✅ 每用户限额配置
- ✅ Web 管理后台
- ✅ 批量上传激活码
- ✅ 手动分配激活码（无视限额）
- ✅ 删除激活码
- ✅ 自动创建数据库表

## 一键部署

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/yoogg/cf-auto-delivery-worker)

点击上方按钮，按提示操作：
1. 授权 Cloudflare 访问你的 GitHub
2. Fork 此仓库
3. 设置 `API_SECRET` 密钥
4. 完成部署

部署后访问 `https://your-worker.workers.dev/admin` 进入管理后台。

> **注意**：数据库表会在首次访问时自动创建，无需手动执行 SQL。

## 手动部署

```bash
# 克隆仓库
git clone https://github.com/yoogg/cf-auto-delivery-worker.git
cd cf-auto-delivery-worker

# 安装依赖
npm install

# 创建 D1 数据库
wrangler d1 create auto-delivery-db
# 复制 database_id 到 wrangler.toml

# 设置 API 密钥
wrangler secret put API_SECRET

# 部署（数据库表会自动创建）
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

## 许可证

MIT
