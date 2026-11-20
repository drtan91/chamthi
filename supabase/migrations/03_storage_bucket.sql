-- ==============================================================================
-- TẠO BUCKET LƯU TRỮ VIDEO TRÌNH DIỄN (SUPABASE STORAGE)
-- ==============================================================================

-- 1. Tạo bucket team-videos nếu chưa có
INSERT INTO storage.buckets (id, name, public) 
VALUES ('team-videos', 'team-videos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Thiết lập quyền truy cập công khai cho bucket team-videos
DROP POLICY IF EXISTS "Public team-videos select" ON storage.objects;
CREATE POLICY "Public team-videos select" ON storage.objects 
FOR SELECT USING (bucket_id = 'team-videos');

DROP POLICY IF EXISTS "Public team-videos insert" ON storage.objects;
CREATE POLICY "Public team-videos insert" ON storage.objects 
FOR INSERT WITH CHECK (bucket_id = 'team-videos');

DROP POLICY IF EXISTS "Public team-videos update" ON storage.objects;
CREATE POLICY "Public team-videos update" ON storage.objects 
FOR UPDATE USING (bucket_id = 'team-videos');

DROP POLICY IF EXISTS "Public team-videos delete" ON storage.objects;
CREATE POLICY "Public team-videos delete" ON storage.objects 
FOR DELETE USING (bucket_id = 'team-videos');
