-- ============================================
-- 测试数据
-- ============================================

INSERT OR IGNORE INTO products (id, name, description, max_per_user, status) VALUES
    ('GAME_KEY', '游戏激活码', '正版游戏激活密钥', 1, 'active'),
    ('VIP_30DAY', 'VIP会员码', '30天VIP会员', 3, 'active');

INSERT OR IGNORE INTO codes (product_id, code, status) VALUES
    ('GAME_KEY', 'GAME-1111-AAAA', 'available'),
    ('GAME_KEY', 'GAME-2222-BBBB', 'available'),
    ('GAME_KEY', 'GAME-3333-CCCC', 'available'),
    ('VIP_30DAY', 'VIP-0001-GOLD', 'available'),
    ('VIP_30DAY', 'VIP-0002-GOLD', 'available'),
    ('VIP_30DAY', 'VIP-0003-GOLD', 'available');
