-- أقسام قائمة الطعام/المنتجات، توفر الصنف، وصورة لكل صنف
ALTER TABLE post_items ADD COLUMN section TEXT NOT NULL DEFAULT '' CHECK (length(section) <= 60);
ALTER TABLE post_items ADD COLUMN available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1));
ALTER TABLE post_items ADD COLUMN image TEXT CHECK (image IS NULL OR image GLOB '[0-9a-f]*.webp');
CREATE INDEX post_items_image ON post_items(image);

-- إثبات ملكية النشاط: صورة خاصة لا يراها إلا المدير، ورقم هاتف المحل
ALTER TABLE business_claims ADD COLUMN proof_file TEXT CHECK (proof_file IS NULL OR proof_file GLOB '[0-9a-f]*.webp');
ALTER TABLE business_claims ADD COLUMN business_phone TEXT CHECK (business_phone IS NULL OR (length(business_phone) = 11 AND business_phone GLOB '07[0-9]*'));

-- إعلانات الزوار من دون حساب: الاسم وبصمة الشبكة (للحد من الإزعاج)
ALTER TABLE posts ADD COLUMN guest_name TEXT CHECK (guest_name IS NULL OR length(guest_name) BETWEEN 2 AND 60);
ALTER TABLE posts ADD COLUMN ip_hash TEXT;
CREATE INDEX posts_ip ON posts(ip_hash, created_at);

-- حساب داخلي تُنسب إليه إعلانات الزوار. معطّل ولا يمكن الدخول به.
INSERT INTO users (name, phone, password_hash, role, status) VALUES ('زائر', '07000000009', '!', 'user', 'disabled');
