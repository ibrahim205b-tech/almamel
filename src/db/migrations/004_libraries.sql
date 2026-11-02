-- صنف خاص لأصحاب المكتبات والخدمات الإلكترونية
UPDATE categories SET sort = 14 WHERE section = 'business' AND name = 'أنشطة تجارية أخرى';
INSERT OR IGNORE INTO categories (section, name, icon, is_food, sort) VALUES ('business', 'مكتبات وخدمات إلكترونية', 'book', 0, 13);
