-- ============================================
-- 数字码发放系统 - D1 数据库结构
-- ============================================

-- 产品表
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    max_per_user INTEGER DEFAULT 1,               -- 每用户最多可获取的码数量
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TEXT DEFAULT (datetime('now'))
);

-- 激活码表
CREATE TABLE IF NOT EXISTS codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'assigned')),
    assigned_to TEXT,
    assigned_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 发放记录表（支持多码发放）
CREATE TABLE IF NOT EXISTS deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    user TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(product_id, user, code),               -- 防止同一码重复发给同一用户
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_codes_product_status ON codes(product_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_product_user ON deliveries(product_id, user);
