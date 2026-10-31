-- شعار المطعم/المحل: صورة مصغّرة تظهر بجانب الاسم في القوائم وصفحة المحل
ALTER TABLE posts ADD COLUMN logo TEXT CHECK (logo IS NULL OR logo GLOB '[0-9a-f]*.webp');
