/**
 * 自动发卡系统 - 主处理器
 */

import type { Env, GetCodeRequest, BatchUploadRequest, ApiResponse } from './types';
import { deliverCode, uploadCodes, getInventoryStatus } from './delivery';
import ADMIN_HTML from './admin.html';

// CORS 头
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// 响应工具
const json = (data: ApiResponse, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...corsHeaders
        }
    });

const error = (msg: string, code = 400) => json({ success: false, error: msg }, code);

// 验证密码
const auth = (body: any, env: Env) => body?.password === env.API_SECRET;

// 自动初始化数据库
async function initDatabase(db: D1Database) {
    await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            max_per_user INTEGER DEFAULT 1,
            status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
            created_at TEXT DEFAULT (datetime('now'))
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            status TEXT DEFAULT 'available' CHECK (status IN ('available', 'assigned')),
            assigned_to TEXT,
            assigned_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS deliveries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id TEXT NOT NULL,
            user TEXT NOT NULL,
            code TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(product_id, user, code),
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_codes_product_status ON codes(product_id, status)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_deliveries_product_user ON deliveries(product_id, user)`),
    ]);
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS 预检
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // 自动初始化数据库（如果表不存在）
            await initDatabase(env.DB);
            // 主页
            if (path === '/' || path === '') {
                return new Response(
                    '<html><head><meta charset="utf-8"><title>Auto Delivery Worker</title></head>' +
                    '<body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;background:#0f172a;color:#e2e8f0">' +
                    '<div style="text-align:center"><h1>📦 Auto Delivery Worker</h1>' +
                    '<p>开源地址: <a href="https://github.com/yoogg/cf-auto-delivery-worker" style="color:#818cf8">GitHub</a></p></div></body></html>',
                    { headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } }
                );
            }

            // 管理后台页面
            if (path === '/admin' || path === '/admin/') {
                return new Response(ADMIN_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } });
            }

            // API 路由
            if (request.method === 'POST') {
                let body: any;
                try { body = await request.json(); }
                catch { return error('无效的 JSON'); }

                // === 公开 API ===
                if (path === '/api/get-code') {
                    if (!body.product_id || !body.user) return error('缺少 product_id 或 user');
                    if (!auth(body, env)) return error('密码错误', 401);

                    try {
                        const result = await deliverCode(env.DB, body.product_id, body.user);
                        return json({ success: true, ...result });
                    } catch (e: any) {
                        if (e.message === 'NO_STOCK') return error('无可用库存', 404);
                        if (e.message === 'PRODUCT_NOT_FOUND') return error('产品不存在', 404);
                        throw e;
                    }
                }

                if (path === '/api/upload-codes') {
                    if (!body.product_id || !body.codes?.length) return error('缺少 product_id 或 codes');
                    if (!auth(body, env)) return error('密码错误', 401);

                    try {
                        const result = await uploadCodes(env.DB, body.product_id, body.codes);
                        return json({ success: true, ...result });
                    } catch (e: any) {
                        if (e.message === 'PRODUCT_NOT_FOUND') return error('产品不存在', 404);
                        throw e;
                    }
                }

                // === 管理 API ===
                if (path.startsWith('/api/admin/')) {
                    if (!auth(body, env)) return error('密码错误', 401);

                    // 产品列表
                    if (path === '/api/admin/products') {
                        const data = await env.DB.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
                        return json({ success: true, data: data.results });
                    }

                    // 添加产品
                    if (path === '/api/admin/products/add') {
                        const { id, name, description, max_per_user } = body;
                        if (!id || !name) return error('缺少 id 或 name');

                        try {
                            await env.DB.prepare('INSERT INTO products (id, name, description, max_per_user) VALUES (?, ?, ?, ?)')
                                .bind(id, name, description || null, max_per_user || 1).run();
                            return json({ success: true });
                        } catch (e: any) {
                            if (e.message?.includes('UNIQUE')) return error('产品 ID 已存在');
                            throw e;
                        }
                    }

                    // 更新产品
                    if (path === '/api/admin/products/update') {
                        const { id, name, description, max_per_user, status } = body;
                        if (!id) return error('缺少 id');

                        const sets: string[] = [];
                        const vals: any[] = [];
                        if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
                        if (description !== undefined) { sets.push('description = ?'); vals.push(description); }
                        if (max_per_user !== undefined) { sets.push('max_per_user = ?'); vals.push(max_per_user); }
                        if (status !== undefined) { sets.push('status = ?'); vals.push(status); }

                        if (!sets.length) return error('无更新内容');
                        vals.push(id);

                        await env.DB.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
                        return json({ success: true });
                    }

                    // 删除产品
                    if (path === '/api/admin/products/delete') {
                        if (!body.id) return error('缺少 id');
                        await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(body.id).run();
                        return json({ success: true });
                    }

                    // 库存查询
                    if (path === '/api/admin/inventory') {
                        if (!body.product_id) return error('缺少 product_id');
                        const result = await getInventoryStatus(env.DB, body.product_id);
                        return json({ success: true, ...result });
                    }

                    // 激活码列表
                    if (path === '/api/admin/codes') {
                        if (!body.product_id) return error('缺少 product_id');
                        let sql = 'SELECT * FROM codes WHERE product_id = ?';
                        const params: any[] = [body.product_id];

                        if (body.status) {
                            sql += ' AND status = ?';
                            params.push(body.status);
                        }
                        sql += ' ORDER BY id DESC LIMIT 100';

                        const data = await env.DB.prepare(sql).bind(...params).all();
                        return json({ success: true, data: data.results });
                    }

                    // 上传激活码 (管理后台)
                    if (path === '/api/admin/codes/upload') {
                        if (!body.product_id || !body.codes?.length) return error('缺少 product_id 或 codes');
                        const result = await uploadCodes(env.DB, body.product_id, body.codes);
                        return json({ success: true, ...result });
                    }

                    // 删除激活码
                    if (path === '/api/admin/codes/delete') {
                        if (!body.code_id) return error('缺少 code_id');
                        await env.DB.prepare('DELETE FROM codes WHERE id = ?').bind(body.code_id).run();
                        return json({ success: true });
                    }

                    // 手动分配激活码 (不受用户限额限制)
                    if (path === '/api/admin/codes/assign') {
                        if (!body.code_id || !body.user) return error('缺少 code_id 或 user');

                        // 获取激活码信息
                        const code = await env.DB.prepare('SELECT id, product_id, code, status FROM codes WHERE id = ?')
                            .bind(body.code_id).first<{ id: number; product_id: string; code: string; status: string }>();

                        if (!code) return error('激活码不存在', 404);
                        if (code.status === 'assigned') return error('激活码已被分配');

                        const now = new Date().toISOString();

                        // 分配码并记录发放 (不检查用户限额)
                        await env.DB.batch([
                            env.DB.prepare("UPDATE codes SET status = 'assigned', assigned_to = ?, assigned_at = ? WHERE id = ?")
                                .bind(body.user, now, body.code_id),
                            env.DB.prepare('INSERT INTO deliveries (product_id, user, code, created_at) VALUES (?, ?, ?, ?)')
                                .bind(code.product_id, body.user, code.code, now),
                        ]);

                        return json({ success: true, code: code.code });
                    }

                    return error('未找到', 404);
                }
            }

            // 库存查询 (GET)
            if (request.method === 'GET' && path.startsWith('/api/inventory/')) {
                const productId = path.split('/')[3];
                const password = url.searchParams.get('password');
                if (password !== env.API_SECRET) return error('密码错误', 401);

                const result = await getInventoryStatus(env.DB, productId);
                return json({ success: true, product_id: productId, ...result });
            }

            return error('未找到', 404);
        } catch (e: any) {
            console.error('Worker error:', e);
            return json({ success: false, error: e.message || '服务器错误' }, 500);
        }
    },
};

