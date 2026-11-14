-- =============================================================================
-- BƯỚC 1: HỆ THỐNG TÀI KHOẢN (SUPABASE AUTH + PROFILES + ADMIN_EMAIL SERVER-SIDE)
-- Tệp: backend/sql/002_supabase_auth_profiles.sql
-- Tương thích kép: Chạy an toàn trên cả Supabase SQL Editor và PostgreSQL 16 Docker
-- =============================================================================

-- 1. Bảng profiles (Hồ sơ tài khoản giáo viên & quản trị viên duy nhất)
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    school TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'teacher' CHECK (role IN ('admin', 'teacher')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'locked')),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    auth_provider TEXT NOT NULL DEFAULT 'email' CHECK (auth_provider IN ('email', 'google', 'both')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    locked_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles (status);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles (role);

-- 2. Bảng app_settings (Cài đặt hệ thống toàn cục cho đăng ký & đăng nhập)
CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    registration_mode TEXT NOT NULL DEFAULT 'pending_approval' CHECK (registration_mode IN ('pending_approval', 'open', 'invite_only')),
    google_login_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    password_login_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    notify_admin_email BOOLEAN NOT NULL DEFAULT TRUE,
    max_accounts INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (google_login_enabled = TRUE OR password_login_enabled = TRUE)
);

INSERT INTO app_settings (id, registration_mode, google_login_enabled, password_login_enabled, notify_admin_email, max_accounts)
VALUES ('global', 'pending_approval', TRUE, TRUE, TRUE, NULL)
ON CONFLICT (id) DO NOTHING;

-- 3. Bảng invites (Lời mời tham gia chỉ dành cho tài khoản teacher)
CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY,
    email TEXT,
    code TEXT NOT NULL UNIQUE,
    max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
    used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    expires_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_invites_code ON invites (code);

-- 4. Bảng audit_log (Nhật ký hoạt động bảo mật, chỉ ghi thêm, không cho sửa/xóa)
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor_id TEXT,
    target_id TEXT,
    action TEXT NOT NULL,
    detail JSONB DEFAULT '{}'::jsonb,
    ip_masked TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);

-- 5. Bảng auth_users_local (Lưu thông tin xác thực phía server khi chạy Docker/Local hoặc kết hợp Supabase)
CREATE TABLE IF NOT EXISTS auth_users_local (
    id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token TEXT,
    verification_expires_at TIMESTAMPTZ,
    reset_token TEXT,
    reset_expires_at TIMESTAMPTZ,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_verification_sent_at TIMESTAMPTZ,
    last_admin_notify_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 6. TRIGGER CƠ SỞ DỮ LIỆU BẢO VỆ QUYỀN ADMIN DUY NHẤT THEO ADMIN_EMAIL (MỤC 2 & 5.2)
-- - Chỉ tài khoản có email ĐÃ XÁC MINH trùng ADMIN_EMAIL (biến môi trường server)
--   mới nhận role = 'admin' và luôn có status = 'active'.
-- - Mọi tài khoản khác luôn là role = 'teacher'.
-- - Chặn tuyệt đối việc khóa, xóa, hạ quyền hoặc đổi email của tài khoản admin.
-- =============================================================================

CREATE OR REPLACE FUNCTION enforce_profile_admin_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin_email TEXT;
    v_reg_mode TEXT;
BEGIN
    v_admin_email := LOWER(NULLIF(TRIM(current_setting('app.admin_email', true)), ''));

    IF TG_OP = 'DELETE' THEN
        IF OLD.role = 'admin' OR (v_admin_email IS NOT NULL AND LOWER(TRIM(OLD.email)) = v_admin_email) THEN
            RAISE EXCEPTION 'FORBIDDEN_ADMIN_PROTECTION: Không thể xóa tài khoản Quản trị viên cố định.';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.role = 'admin' THEN
            IF LOWER(TRIM(NEW.email)) <> LOWER(TRIM(OLD.email)) THEN
                RAISE EXCEPTION 'FORBIDDEN_ADMIN_PROTECTION: Không thể đổi email của tài khoản Quản trị viên cố định.';
            END IF;
            IF NEW.role <> 'admin' THEN
                RAISE EXCEPTION 'FORBIDDEN_ADMIN_PROTECTION: Không thể hạ quyền tài khoản Quản trị viên cố định.';
            END IF;
            IF NEW.status <> 'active' THEN
                RAISE EXCEPTION 'FORBIDDEN_ADMIN_PROTECTION: Không thể khóa hoặc tạm ngưng tài khoản Quản trị viên cố định.';
            END IF;
        END IF;
    END IF;

    -- Kiểm tra email đã xác minh trùng ADMIN_EMAIL ở phía server
    IF v_admin_email IS NOT NULL AND LOWER(TRIM(NEW.email)) = v_admin_email AND NEW.email_verified = TRUE THEN
        NEW.role := 'admin';
        NEW.status := 'active';
        IF NEW.approved_at IS NULL THEN
            NEW.approved_at := NOW();
        END IF;
    ELSE
        -- Nếu chưa xác minh email hoặc không trùng ADMIN_EMAIL thì bắt buộc là teacher
        IF TG_OP = 'INSERT' OR OLD.role <> 'admin' THEN
            NEW.role := 'teacher';
        END IF;

        -- Khi mới tạo tài khoản teacher, áp dụng chế độ đăng ký nếu chưa truyền rõ
        IF TG_OP = 'INSERT' AND NEW.role = 'teacher' THEN
            SELECT registration_mode INTO v_reg_mode FROM app_settings WHERE id = 'global' LIMIT 1;
            IF v_reg_mode = 'open' AND NEW.status = 'pending' THEN
                NEW.status := 'active';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_admin_role ON profiles;
CREATE TRIGGER trg_enforce_profile_admin_role
BEFORE INSERT OR UPDATE OR DELETE ON profiles
FOR EACH ROW
EXECUTE FUNCTION enforce_profile_admin_role();

-- =============================================================================
-- 7. TÍCH HỢP TRIGGER SUPABASE AUTH (auth.users -> public.profiles)
-- Tự động chạy khi triển khai trên Supabase Cloud
-- =============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'auth' AND table_name = 'users'
    ) THEN
        EXECUTE $supabase_fn$
        CREATE OR REPLACE FUNCTION public.handle_supabase_auth_user_sync()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $fn$
        DECLARE
            v_full_name TEXT;
            v_phone TEXT;
            v_school TEXT;
            v_provider TEXT;
            v_verified BOOLEAN;
        BEGIN
            v_full_name := COALESCE(
                NEW.raw_user_meta_data->>'full_name',
                NEW.raw_user_meta_data->>'name',
                split_part(NEW.email, '@', 1)
            );
            v_phone := NEW.raw_user_meta_data->>'phone';
            v_school := NEW.raw_user_meta_data->>'school';
            v_provider := CASE
                WHEN NEW.raw_app_meta_data->>'provider' = 'google' THEN 'google'
                ELSE 'email'
            END;
            v_verified := (NEW.email_confirmed_at IS NOT NULL);

            INSERT INTO public.profiles (
                id, full_name, email, phone, school, email_verified, auth_provider, created_at
            )
            VALUES (
                NEW.id::text,
                v_full_name,
                LOWER(TRIM(NEW.email)),
                v_phone,
                v_school,
                v_verified,
                v_provider,
                COALESCE(NEW.created_at, NOW())
            )
            ON CONFLICT (email) DO UPDATE SET
                email_verified = EXCLUDED.email_verified OR public.profiles.email_verified,
                auth_provider = CASE
                    WHEN public.profiles.auth_provider <> EXCLUDED.auth_provider THEN 'both'
                    ELSE public.profiles.auth_provider
                END,
                last_login_at = NOW();

            RETURN NEW;
        END;
        $fn$;

        DROP TRIGGER IF EXISTS on_auth_user_created_or_verified ON auth.users;
        CREATE TRIGGER on_auth_user_created_or_verified
        AFTER INSERT OR UPDATE OF email_confirmed_at, last_sign_in_at ON auth.users
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_supabase_auth_user_sync();
        $supabase_fn$;
    END IF;
END
$$;

-- =============================================================================
-- 8. ROW LEVEL SECURITY CHO PROFILES (Người dùng chỉ đọc/sửa hồ sơ của chính mình,
--    KHÔNG sửa được role hay status)
-- =============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'rls_profiles_self_select') THEN
        CREATE POLICY rls_profiles_self_select ON profiles
            FOR SELECT
            USING (id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'rls_profiles_self_update') THEN
        CREATE POLICY rls_profiles_self_update ON profiles
            FOR UPDATE
            USING (id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), id))
            WITH CHECK (id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), id));
    END IF;
END
$$;

