/**
 * 自动发卡系统 - 主处理器
 */

import type { Env, GetCodeRequest, BatchUploadRequest, ApiResponse } from './types';
import { deliverCode, uploadCodes, getInventoryStatus } from './delivery';
import ADMIN_HTML from './admin.html';

// 响应工具
const json = (data: ApiResponse, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });

const error = (msg: string, code = 400) => json({ success: false, error: msg }, code);

// 验证密码
const auth = (body: any, env: Env) => body?.password === env.API_SECRET;

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': '*',
                    'Access-Control-Allow-Headers': '*'
                }
            });
        }

        // 主页重定向到管理后台
        if (path === '/' || path === '') {
            return Response.redirect(url.origin + '/admin', 302);
        }

        // 管理后台页面
        if (path === '/admin' || path === '/admin/') {
            return new Response(ADMIN_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
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
    },
};
