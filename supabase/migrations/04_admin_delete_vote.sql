-- ============================================================
-- Migration 04: Cấp quyền DELETE phiếu chấm cho Admin
-- Admin được xác định qua app_metadata.role = 'admin' hoặc 'super_admin'
-- ============================================================

-- 1. Cho phép authenticated user thực hiện DELETE trên votes
--    (trước đây bị REVOKE toàn bộ)
GRANT DELETE ON votes TO authenticated;

-- 2. Thêm RLS policy DELETE dành riêng cho admin
DROP POLICY IF EXISTS p_votes_admin_delete ON votes;
CREATE POLICY p_votes_admin_delete
  ON votes
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
  );

-- Kiểm tra: policy SELECT vẫn giữ nguyên (USING true)
-- Policy deny ALL cho authenticated giữ nguyên nhưng DELETE được ưu tiên
-- bởi policy mới (Supabase dùng OR giữa các policy cùng loại)
