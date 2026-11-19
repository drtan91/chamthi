-- ==============================================================================
-- DATABASE SCHEMA MIGRATION: HỆ THỐNG BÌNH CHỌN VÀ CHẤM ĐIỂM HỘI THI HÁT
-- Phiên bản: 1.5.4 (Explicit Error Mapping Architecture & Deep Snapshot Verification)
-- Quản trị: PostgreSQL (Supabase Engine)
-- ==============================================================================

-- Kích hoạt tiện ích mở rộng pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. BẢNG CẤU HÌNH VÀ KHÓA HỆ THỐNG: system_settings
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    locked_at TIMESTAMPTZ NULL,
    locked_by UUID NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Khởi tạo bản ghi cấu hình đơn nhất nếu chưa tồn tại
INSERT INTO system_settings (id, is_locked)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. BẢNG ĐỘI THI: teams
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL CHECK (length(trim(name)) > 0),
    display_order INTEGER NOT NULL,
    video_url TEXT NULL,
    video_path TEXT NULL,
    teammate_bonus INTEGER NOT NULL DEFAULT 0 CHECK (teammate_bonus IN (0, 3)),
    lucky_star INTEGER NOT NULL DEFAULT 5 CHECK (lucky_star IN (5, -5)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. BẢNG NGƯỜI THAM GIA: participants
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(64) NOT NULL UNIQUE CHECK (username = lower(trim(username)) AND length(username) > 0),
    name VARCHAR(255) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 4. BẢNG PHIẾU CHẤM ĐIỂM: votes
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    vocal_score INTEGER NOT NULL CHECK (vocal_score >= 1 AND vocal_score <= 25),
    performance_score INTEGER NOT NULL CHECK (performance_score >= 1 AND performance_score <= 25),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_participant_team UNIQUE (participant_id, team_id)
);

-- ------------------------------------------------------------------------------
-- 5. BẢNG HÀNG ĐỢI DỌN DẸP STORAGE: storage_cleanup_jobs
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS storage_cleanup_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id VARCHAR(64) NOT NULL DEFAULT 'team-videos',
    file_path TEXT NOT NULL,
    reason VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 6. BẢNG NHẬT KÝ QUẢN TRỊ: audit_logs
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(64) NOT NULL,
    performed_by UUID NOT NULL REFERENCES auth.users(id),
    reason TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 7. CHỈ MỤC TỐI ƯU HÓA HIỆU NĂNG (INDEXES)
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_participant_team ON votes(participant_id, team_id);
CREATE INDEX IF NOT EXISTS idx_teams_display_order ON teams(display_order ASC);
CREATE INDEX IF NOT EXISTS idx_votes_team_id ON votes(team_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_username ON participants(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_auth_user_id ON participants(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_jobs_status_retry ON storage_cleanup_jobs(status, next_retry_at) WHERE status IN ('pending', 'failed');

-- ------------------------------------------------------------------------------
-- 8. VIEW CÔNG KHAI NGƯỜI THAM GIA (BẢO VỆ QUYỀN RIÊNG TƯ)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_participants_public AS
SELECT 
    id,
    username,
    name,
    is_active
FROM participants;

GRANT SELECT ON view_participants_public TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 9. TRIGGERS BẢO VỆ TÍNH TOÀN VẸN CƠ SỞ DỮ LIỆU
-- ------------------------------------------------------------------------------

-- Trigger 9.1: Chặn ghi phiếu sau khi khóa với cơ chế FOR SHARE đồng bộ
CREATE OR REPLACE FUNCTION fn_enforce_voting_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_locked BOOLEAN;
BEGIN
    SELECT is_locked INTO v_is_locked 
    FROM system_settings 
    WHERE id = 1 
    FOR SHARE;

    IF v_is_locked = TRUE THEN
        PERFORM set_config('response.status', '403', true);
        RAISE EXCEPTION 'ERR_VOTING_LOCKED' 
            USING MESSAGE = 'Đã khóa chấm điểm',
                  DETAIL = 'ERR_VOTING_LOCKED';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_voting_lock ON votes;
CREATE TRIGGER trg_enforce_voting_lock
BEFORE INSERT OR UPDATE ON votes
FOR EACH ROW EXECUTE FUNCTION fn_enforce_voting_lock();

-- Trigger 9.2: Kiểm tra video hiện hành cho cả INSERT và UPDATE
CREATE OR REPLACE FUNCTION fn_enforce_team_video()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_video_url TEXT;
BEGIN
    SELECT video_url INTO v_video_url FROM teams WHERE id = NEW.team_id;
    IF v_video_url IS NULL OR length(trim(v_video_url)) = 0 THEN
        PERFORM set_config('response.status', '400', true);
        RAISE EXCEPTION 'ERR_NO_VIDEO' 
            USING MESSAGE = 'Đội thi chưa có video dự thi, không thể chấm điểm.',
                  DETAIL = 'ERR_NO_VIDEO';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_team_video ON votes;
CREATE TRIGGER trg_enforce_team_video
BEFORE INSERT OR UPDATE ON votes
FOR EACH ROW EXECUTE FUNCTION fn_enforce_team_video();

-- Trigger 9.3: Kiểm tra tài khoản người tham gia còn hoạt động
CREATE OR REPLACE FUNCTION fn_enforce_active_participant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_active BOOLEAN;
BEGIN
    SELECT is_active INTO v_is_active FROM participants WHERE id = NEW.participant_id;
    IF v_is_active IS DISTINCT FROM TRUE THEN
        PERFORM set_config('response.status', '403', true);
        RAISE EXCEPTION 'ERR_ACCOUNT_DEACTIVATED' 
            USING MESSAGE = 'Tài khoản người tham gia đã bị vô hiệu hóa bởi Ban tổ chức.',
                  DETAIL = 'ERR_ACCOUNT_DEACTIVATED';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_active_participant ON votes;
CREATE TRIGGER trg_enforce_active_participant
BEFORE INSERT OR UPDATE ON votes
FOR EACH ROW EXECUTE FUNCTION fn_enforce_active_participant();

-- ------------------------------------------------------------------------------
-- 10. STORED PROCEDURES (RPCs) BẢO MẬT
-- ------------------------------------------------------------------------------

-- Procedure 10.1: Chấm điểm tối ưu đồng thời FOR SHARE & Chống giả mạo
CREATE OR REPLACE FUNCTION submit_vote(p_team_id UUID, p_vocal INT, p_performance INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_participant_id UUID;
    v_is_locked BOOLEAN;
    v_video_url TEXT;
    v_vote_id UUID;
BEGIN
    -- 1. Khóa chia sẻ dòng (FOR SHARE): Tối ưu cho 300 người chấm cùng lúc
    SELECT is_locked INTO v_is_locked 
    FROM system_settings 
    WHERE id = 1 
    FOR SHARE;

    IF v_is_locked = TRUE THEN
        PERFORM set_config('response.status', '403', true);
        RAISE EXCEPTION 'ERR_VOTING_LOCKED' 
            USING MESSAGE = 'Đã khóa chấm điểm',
                  DETAIL = 'ERR_VOTING_LOCKED';
    END IF;

    -- 2. Chống giả mạo participant_id: Trích xuất trực tiếp từ auth.uid() của JWT session
    SELECT id INTO v_participant_id 
    FROM participants 
    WHERE auth_user_id = auth.uid() AND is_active = TRUE;

    IF v_participant_id IS NULL THEN
        PERFORM set_config('response.status', '403', true);
        RAISE EXCEPTION 'ERR_ACCOUNT_DEACTIVATED' 
            USING MESSAGE = 'Tài khoản không hợp lệ hoặc đã bị vô hiệu hóa bởi Ban tổ chức.',
                  DETAIL = 'ERR_ACCOUNT_DEACTIVATED';
    END IF;

    -- 3. Kiểm tra video dự thi của đội
    SELECT video_url INTO v_video_url FROM teams WHERE id = p_team_id;
    IF v_video_url IS NULL OR length(trim(v_video_url)) = 0 THEN
        PERFORM set_config('response.status', '400', true);
        RAISE EXCEPTION 'ERR_NO_VIDEO' 
            USING MESSAGE = 'Đội thi chưa có video dự thi, không thể chấm điểm.',
                  DETAIL = 'ERR_NO_VIDEO';
    END IF;

    -- 4. Kiểm tra thang điểm hợp lệ (Số nguyên: 1 đến 25)
    IF p_vocal < 1 OR p_vocal > 25 OR p_performance < 1 OR p_performance > 25 THEN
        PERFORM set_config('response.status', '400', true);
        RAISE EXCEPTION 'ERR_INVALID_SCORE_RANGE' 
            USING MESSAGE = 'Điểm chấm phải là số nguyên từ 1 đến 25.',
                  DETAIL = 'ERR_INVALID_SCORE_RANGE';
    END IF;

    -- 5. Thực hiện UPSERT an toàn dựa trên UNIQUE(participant_id, team_id)
    INSERT INTO votes (participant_id, team_id, vocal_score, performance_score, updated_at)
    VALUES (v_participant_id, p_team_id, p_vocal, p_performance, NOW())
    ON CONFLICT (participant_id, team_id)
    DO UPDATE SET 
        vocal_score = EXCLUDED.vocal_score,
        performance_score = EXCLUDED.performance_score,
        updated_at = NOW()
    RETURNING id INTO v_vote_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Phiếu chấm đã được ghi nhận thành công.',
        'data', jsonb_build_object(
            'vote_id', v_vote_id,
            'team_id', p_team_id,
            'vocal_score', p_vocal,
            'performance_score', p_performance,
            'total_score', (p_vocal + p_performance)
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_vote(UUID, INT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION submit_vote(UUID, INT, INT) TO authenticated;

-- Procedure 10.2: Khóa chấm điểm độc quyền FOR UPDATE một chiều
CREATE OR REPLACE FUNCTION lock_voting_system()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_role TEXT;
    v_current_locked BOOLEAN;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    v_user_role := (auth.jwt() -> 'app_metadata' ->> 'role');
    IF v_user_role IS DISTINCT FROM 'admin' AND v_user_role IS DISTINCT FROM 'super_admin' THEN
        PERFORM set_config('response.status', '403', true);
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_ACCESS' 
            USING MESSAGE = 'Bạn không có quyền thực hiện thao tác này.',
                  DETAIL = 'ERR_UNAUTHORIZED_ACCESS';
    END IF;

    -- Khóa độc quyền (FOR UPDATE)
    SELECT is_locked INTO v_current_locked 
    FROM system_settings 
    WHERE id = 1 
    FOR UPDATE;

    IF v_current_locked = TRUE THEN
        RETURN jsonb_build_object(
            'success', true, 
            'message', 'Đã khóa chấm điểm',
            'data', jsonb_build_object('is_locked', true, 'locked_at', v_now, 'locked_by', auth.uid())
        );
    END IF;

    UPDATE system_settings
    SET is_locked = TRUE,
        locked_at = v_now,
        locked_by = auth.uid(),
        updated_at = v_now
    WHERE id = 1;

    INSERT INTO audit_logs (action, performed_by, reason, metadata)
    VALUES (
        'LOCK_VOTING',
        auth.uid(),
        'Admin kích hoạt khóa chấm điểm sự kiện',
        jsonb_build_object('locked_at', v_now, 'role', v_user_role)
    );

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Đã khóa chấm điểm',
        'data', jsonb_build_object('is_locked', true, 'locked_at', v_now, 'locked_by', auth.uid())
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION lock_voting_system() FROM public, anon;
GRANT EXECUTE ON FUNCTION lock_voting_system() TO authenticated;

-- Procedure 10.3: Mở khóa khẩn cấp dành riêng cho Super Admin
CREATE OR REPLACE FUNCTION emergency_unlock_system(p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_role TEXT;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    v_user_role := (auth.jwt() -> 'app_metadata' ->> 'role');
    IF v_user_role IS DISTINCT FROM 'super_admin' THEN
        PERFORM set_config('response.status', '403', true);
        RAISE EXCEPTION 'ERR_FORBIDDEN' 
            USING MESSAGE = 'Chỉ quản trị hệ thống đặc biệt mới có quyền mở khóa.',
                  DETAIL = 'ERR_FORBIDDEN';
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
        PERFORM set_config('response.status', '400', true);
        RAISE EXCEPTION 'ERR_UNLOCK_REASON_REQUIRED' 
            USING MESSAGE = 'Bắt buộc phải cung cấp lý do mở khóa hợp lệ.',
                  DETAIL = 'ERR_UNLOCK_REASON_REQUIRED';
    END IF;

    PERFORM 1 FROM system_settings WHERE id = 1 FOR UPDATE;

    UPDATE system_settings
    SET is_locked = FALSE,
        updated_at = v_now
    WHERE id = 1;

    INSERT INTO audit_logs (action, performed_by, reason, metadata)
    VALUES (
        'EMERGENCY_UNLOCK', 
        auth.uid(), 
        p_reason, 
        jsonb_build_object('unlocked_at', v_now, 'role', v_user_role)
    );

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Đã mở khóa khẩn cấp thành công.',
        'data', jsonb_build_object(
            'is_locked', false,
            'unlocked_at', v_now,
            'unlocked_by', auth.uid(),
            'reason', p_reason
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION emergency_unlock_system(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION emergency_unlock_system(TEXT) TO authenticated;

-- Procedure 10.4: Vô hiệu hóa từng người tham gia
CREATE OR REPLACE FUNCTION deactivate_participant(p_participant_id UUID, p_is_active BOOLEAN, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_role TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        PERFORM set_config('response.status', '401', true);
        RAISE EXCEPTION 'ERR_UNAUTHORIZED' 
            USING MESSAGE = 'Yêu cầu đăng nhập.',
                  DETAIL = 'ERR_UNAUTHORIZED';
    END IF;

    v_user_role := (auth.jwt() -> 'app_metadata' ->> 'role');
    IF v_user_role IS DISTINCT FROM 'admin' AND v_user_role IS DISTINCT FROM 'super_admin' THEN
        PERFORM set_config('response.status', '403', true);
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_ACCESS' 
            USING MESSAGE = 'Chỉ Admin hoặc Super Admin mới có quyền thực hiện.',
                  DETAIL = 'ERR_UNAUTHORIZED_ACCESS';
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
        PERFORM set_config('response.status', '400', true);
        RAISE EXCEPTION 'ERR_REASON_REQUIRED' 
            USING MESSAGE = 'Bắt buộc phải cung cấp lý do thay đổi trạng thái tài khoản.',
                  DETAIL = 'ERR_REASON_REQUIRED';
    END IF;

    UPDATE participants
    SET is_active = p_is_active,
        updated_at = NOW()
    WHERE id = p_participant_id;

    INSERT INTO audit_logs (action, performed_by, reason, metadata)
    VALUES (
        'UPDATE_PARTICIPANT_STATUS',
        auth.uid(),
        p_reason,
        jsonb_build_object('participant_id', p_participant_id, 'is_active', p_is_active)
    );

    RETURN jsonb_build_object(
        'success', true, 
        'participant_id', p_participant_id, 
        'is_active', p_is_active,
        'message', 'Cập nhật trạng thái người tham gia thành công.'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION deactivate_participant(UUID, BOOLEAN, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION deactivate_participant(UUID, BOOLEAN, TEXT) TO authenticated;

-- Procedure 10.5: Vô hiệu hóa toàn bộ tài khoản sau hội thi
CREATE OR REPLACE FUNCTION deactivate_all_participants(p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_role TEXT;
    v_count INT;
BEGIN
    IF auth.uid() IS NULL THEN
        PERFORM set_config('response.status', '401', true);
        RAISE EXCEPTION 'ERR_UNAUTHORIZED' 
            USING MESSAGE = 'Yêu cầu đăng nhập.',
                  DETAIL = 'ERR_UNAUTHORIZED';
    END IF;

    v_user_role := (auth.jwt() -> 'app_metadata' ->> 'role');
    IF v_user_role IS DISTINCT FROM 'super_admin' THEN
        PERFORM set_config('response.status', '403', true);
        RAISE EXCEPTION 'ERR_FORBIDDEN' 
            USING MESSAGE = 'Chỉ quản trị hệ thống đặc biệt mới có quyền vô hiệu hóa toàn bộ tài khoản.',
                  DETAIL = 'ERR_FORBIDDEN';
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
        PERFORM set_config('response.status', '400', true);
        RAISE EXCEPTION 'ERR_REASON_REQUIRED' 
            USING MESSAGE = 'Bắt buộc phải cung cấp lý do vô hiệu hóa hàng loạt.',
                  DETAIL = 'ERR_REASON_REQUIRED';
    END IF;

    UPDATE participants
    SET is_active = FALSE,
        updated_at = NOW()
    WHERE is_active = TRUE;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO audit_logs (action, performed_by, reason, metadata)
    VALUES (
        'BATCH_DEACTIVATE_PARTICIPANTS',
        auth.uid(),
        p_reason,
        jsonb_build_object('deactivated_count', v_count, 'executed_at', NOW())
    );

    RETURN jsonb_build_object(
        'success', true, 
        'deactivated_count', v_count, 
        'message', 'Đã vô hiệu hóa toàn bộ tài khoản participant sau hội thi.'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION deactivate_all_participants(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION deactivate_all_participants(TEXT) TO authenticated;

-- Procedure 10.6: Lấy bảng điểm tổng hợp 4 cột chuẩn
CREATE OR REPLACE FUNCTION get_team_board()
RETURNS TABLE (
    team_id UUID,
    team_name VARCHAR(255),
    display_order INT,
    video_url TEXT,
    teammate_bonus INT,
    lucky_star INT,
    valid_vote_count BIGINT,
    raw_audience_score NUMERIC,
    display_audience_score TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT 
        t.id AS team_id,
        t.name AS team_name,
        t.display_order,
        t.video_url,
        t.teammate_bonus,
        t.lucky_star,
        COUNT(v.id) AS valid_vote_count,
        ROUND(AVG(v.vocal_score + v.performance_score), 2) AS raw_audience_score,
        CASE 
            WHEN COUNT(v.id) = 0 THEN 'Chưa có điểm'
            ELSE TO_CHAR(ROUND(AVG(v.vocal_score + v.performance_score), 2), 'FM999999990.##')
        END AS display_audience_score
    FROM teams t
    LEFT JOIN votes v ON t.id = v.team_id
    GROUP BY t.id, t.name, t.display_order, t.video_url, t.teammate_bonus, t.lucky_star
    ORDER BY t.display_order ASC;
$$;

REVOKE EXECUTE ON FUNCTION get_team_board() FROM public;
GRANT EXECUTE ON FUNCTION get_team_board() TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- 11.1. Bảng teams
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_teams_select ON teams;
CREATE POLICY p_teams_select ON teams FOR SELECT USING (true);
DROP POLICY IF EXISTS p_teams_admin_write ON teams;
CREATE POLICY p_teams_admin_write ON teams FOR ALL TO authenticated 
USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

-- 11.2. Bảng votes
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_votes_select_all ON votes;
CREATE POLICY p_votes_select_all ON votes FOR SELECT USING (true);

-- Cấm hoàn toàn Client ghi trực tiếp vào bảng votes (mọi thao tác phải qua submit_vote)
REVOKE INSERT, UPDATE, DELETE ON votes FROM anon, authenticated;
DROP POLICY IF EXISTS p_votes_direct_write_deny ON votes;
CREATE POLICY p_votes_direct_write_deny ON votes FOR ALL TO authenticated 
USING (false) WITH CHECK (false);

-- 11.3. Bảng participants
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_participants_select_own ON participants;
CREATE POLICY p_participants_select_own ON participants FOR SELECT TO authenticated 
USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS p_participants_select_admin ON participants;
CREATE POLICY p_participants_select_admin ON participants FOR SELECT TO authenticated 
USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

-- 11.4. Bảng storage_cleanup_jobs
ALTER TABLE storage_cleanup_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_cleanup_jobs_admin ON storage_cleanup_jobs;
CREATE POLICY p_cleanup_jobs_admin ON storage_cleanup_jobs FOR ALL TO authenticated 
USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

-- 11.5. Bảng audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_audit_logs_select_admin ON audit_logs;
CREATE POLICY p_audit_logs_select_admin ON audit_logs FOR SELECT TO authenticated 
USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));
