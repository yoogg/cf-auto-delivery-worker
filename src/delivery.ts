/**
 * 发放服务 - 核心业务逻辑
 */

import type { Product } from './types';

interface DeliveryResult {
    code: string;
    is_new: boolean;
    count: number;      // 用户已获取的码数量
    max: number;        // 最大可获取数量
}

/**
 * 为用户发放激活码（幂等、并发安全）
 */
export async function deliverCode(
    db: D1Database,
    productId: string,
    userId: string
): Promise<DeliveryResult> {
    // 获取产品配置
    const product = await db
        .prepare('SELECT max_per_user FROM products WHERE id = ? AND status = ?')
        .bind(productId, 'active')
        .first<Pick<Product, 'max_per_user'>>();

    if (!product) {
        throw new Error('PRODUCT_NOT_FOUND');
    }

    const maxPerUser = product.max_per_user || 1;

    // 查询用户已获得的码
    const existingCodes = await db
        .prepare('SELECT code FROM deliveries WHERE product_id = ? AND user = ?')
        .bind(productId, userId)
        .all<{ code: string }>();

    const userCodeCount = existingCodes.results?.length || 0;

    // 已达上限，返回最后一个码
    if (userCodeCount >= maxPerUser) {
        const lastCode = existingCodes.results![userCodeCount - 1].code;
        return { code: lastCode, is_new: false, count: userCodeCount, max: maxPerUser };
    }

    // 获取一个可用码
    const availableCode = await db
        .prepare("SELECT id, code FROM codes WHERE product_id = ? AND status = 'available' LIMIT 1")
        .bind(productId)
        .first<{ id: number; code: string }>();

    if (!availableCode) {
        throw new Error('NO_STOCK');
    }

    const now = new Date().toISOString();

    // 原子操作：分配码 + 记录发放
    try {
        const results = await db.batch([
            db.prepare("UPDATE codes SET status = 'assigned', assigned_to = ?, assigned_at = ? WHERE id = ? AND status = 'available'")
                .bind(userId, now, availableCode.id),
            db.prepare('INSERT INTO deliveries (product_id, user, code, created_at) VALUES (?, ?, ?, ?)')
                .bind(productId, userId, availableCode.code, now),
        ]);

        // 检查更新是否成功（处理并发竞争）
        if (!results[0].meta.changes) {
            return deliverCode(db, productId, userId); // 重试
        }

        return { code: availableCode.code, is_new: true, count: userCodeCount + 1, max: maxPerUser };
    } catch (e: any) {
        // 唯一约束冲突，说明并发请求已处理
        if (e.message?.includes('UNIQUE constraint')) {
            return deliverCode(db, productId, userId);
        }
        throw e;
    }
}

/**
 * 批量上传激活码
 */
export async function uploadCodes(
    db: D1Database,
    productId: string,
    codes: string[]
): Promise<{ inserted: number; duplicates: number }> {
    const product = await db.prepare('SELECT id FROM products WHERE id = ?').bind(productId).first();
    if (!product) throw new Error('PRODUCT_NOT_FOUND');

    const statements = codes.map(code =>
        db.prepare("INSERT OR IGNORE INTO codes (product_id, code, status) VALUES (?, ?, 'available')").bind(productId, code)
    );

    const results = await db.batch(statements);
    let inserted = 0, duplicates = 0;

    for (const r of results) {
        r.meta.changes ? inserted++ : duplicates++;
    }

    return { inserted, duplicates };
}

/**
 * 获取库存状态
 */
export async function getInventoryStatus(db: D1Database, productId: string) {
    const result = await db.prepare(`
    SELECT 
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned
    FROM codes WHERE product_id = ?
  `).bind(productId).first<{ available: number; assigned: number }>();

    return { available: result?.available || 0, assigned: result?.assigned || 0 };
}
