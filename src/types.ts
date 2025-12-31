/**
 * 自动发卡系统 - 类型定义
 */

export interface Env {
    DB: D1Database;
    API_SECRET: string;
}

// 数据库模型
export interface Product {
    id: string;
    name: string;
    description: string | null;
    max_per_user: number;
    status: 'active' | 'inactive';
    created_at: string;
}

export interface Code {
    id: number;
    product_id: string;
    code: string;
    status: 'available' | 'assigned';
    assigned_to: string | null;
    assigned_at: string | null;
    created_at: string;
}

// API 请求
export interface GetCodeRequest {
    product_id: string;
    password: string;
    user: string;
}

export interface BatchUploadRequest {
    product_id: string;
    password: string;
    codes: string[];
}

// API 响应
export interface ApiResponse {
    success: boolean;
    error?: string;
    [key: string]: any;
}
