-- PostgreSQL Initial Schema for Teacher Schedule & Class Manager
-- Database: app_gv
-- Bảng nghiệp vụ đầy đủ: Lịch trường theo tiết, Quản lý công nợ FIFO, Nhật ký thay đổi, Đồng bộ Google Calendar 1 chiều & RLS

CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT DEFAULT '',
    price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
    color TEXT NOT NULL DEFAULT '#3B82F6',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_name TEXT,
    parent_phone TEXT,
    custom_price INTEGER,
    trial_price INTEGER,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'left')),
    start_date DATE,
    left_date DATE,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nhóm D & E: Ghi danh dài hạn học sinh vào các lớp (lớp chính primary hoặc lớp phụ extra)
CREATE TABLE IF NOT EXISTS student_enrollments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'extra')),
    schedule_rule_ids JSONB DEFAULT '[]'::jsonb,
    price_override INTEGER,
    from_date DATE NOT NULL,
    to_date DATE,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'local'
);

-- Nhóm A: Lịch sử chuyển trạng thái học sinh (trial -> active -> left) theo ngày hiệu lực
CREATE TABLE IF NOT EXISTS student_status_history (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    enrollment_id TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'left')),
    effective_from DATE NOT NULL,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'local'
);

-- Nhóm D: Học ghép / học thêm ngắn hạn theo từng buổi (swap hoặc extra)
CREATE TABLE IF NOT EXISTS session_guests (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    host_class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'extra' CHECK (kind IN ('swap', 'extra')),
    home_class_id TEXT,
    home_session_key TEXT,
    billing_mode TEXT NOT NULL DEFAULT 'free' CHECK (billing_mode IN ('free', 'home_price', 'host_price', 'custom')),
    custom_amount INTEGER,
    billed_class_id TEXT,
    reason TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS schedule_rules (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE,
    user_id TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS session_exceptions (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL REFERENCES schedule_rules(id) ON DELETE CASCADE,
    original_date DATE NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('moved', 'cancelled')),
    new_date DATE,
    new_start TEXT,
    new_end TEXT,
    reason TEXT,
    needs_makeup BOOLEAN DEFAULT FALSE,
    user_id TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS extra_sessions (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    note TEXT,
    makeup_for TEXT,
    user_id TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS school_periods (
    id TEXT PRIMARY KEY,
    period_code TEXT NOT NULL,
    session TEXT NOT NULL DEFAULT 'morning' CHECK (session IN ('morning', 'afternoon')),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    schedule_name TEXT DEFAULT 'Giờ chuẩn',
    valid_from DATE NOT NULL DEFAULT '2020-01-01',
    valid_to DATE,
    user_id TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS school_schedule (
    id TEXT PRIMARY KEY,
    week_start DATE NOT NULL DEFAULT '2026-01-05',
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    period TEXT NOT NULL DEFAULT 'S1',
    period_code TEXT NOT NULL DEFAULT 'S1',
    session TEXT NOT NULL DEFAULT 'morning' CHECK (session IN ('morning', 'afternoon')),
    cell_type TEXT NOT NULL DEFAULT 'class' CHECK (cell_type IN ('class', 'duty', 'other')),
    start_time TEXT NOT NULL DEFAULT '07:00',
    end_time TEXT NOT NULL DEFAULT '07:45',
    class_name TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    room TEXT DEFAULT '',
    note TEXT DEFAULT '',
    valid_from DATE NOT NULL,
    valid_to DATE,
    user_id TEXT NOT NULL DEFAULT 'local'
);

-- Nhóm B: Cấu hình thời khóa biểu trường theo từng tuần (chiều có ra chơi dài hay không, tên GV, số tiết khai báo)
CREATE TABLE IF NOT EXISTS school_week_configs (
    id TEXT PRIMARY KEY,
    week_start DATE NOT NULL,
    afternoon_long_break BOOLEAN DEFAULT FALSE,
    afternoon_long_break_minutes INTEGER DEFAULT 20,
    teacher_name TEXT DEFAULT '',
    declared_period_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'local',
    UNIQUE (user_id, week_start)
);

CREATE TABLE IF NOT EXISTS holidays (
    id TEXT PRIMARY KEY,
    date DATE NOT NULL,
    note TEXT NOT NULL,
    user_id TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS session_notes (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TEXT NOT NULL,
    content TEXT NOT NULL,
    user_id TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TEXT NOT NULL,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused')),
    user_id TEXT NOT NULL DEFAULT 'local',
    UNIQUE (class_id, date, start_time, student_id)
);

-- Bảng payments cũ (giữ lại để tương thích ngược khi migrate sang payment_transactions)
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    paid BOOLEAN NOT NULL DEFAULT FALSE,
    paid_at TIMESTAMPTZ,
    user_id TEXT NOT NULL DEFAULT 'local',
    UNIQUE (student_id, month)
);

-- Mục 2.9 & Mục 3: Bảng giao dịch thu học phí (thay thế ô tích đã đóng cứng)
CREATE TABLE IF NOT EXISTS payment_transactions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount > 0),
    paid_at DATE NOT NULL,
    method TEXT NOT NULL DEFAULT 'transfer' CHECK (method IN ('cash', 'transfer', 'other')),
    note TEXT DEFAULT '',
    group_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'local'
);

-- Mục 2.9 & Mục 3: Bảng chốt học phí tháng theo lớp
CREATE TABLE IF NOT EXISTS month_locks (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    locked_at TIMESTAMPTZ DEFAULT NOW(),
    snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    user_id TEXT NOT NULL DEFAULT 'local',
    UNIQUE (class_id, month)
);

-- Mục 2.9 & Mục 3: Nhật ký thay đổi khoản thu & điểm danh
CREATE TABLE IF NOT EXISTS change_log (
    id TEXT PRIMARY KEY,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    "before" JSONB,
    "after" JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'local'
);

-- Mục 2.10 & Mục 3: Ánh xạ buổi dạy thực tế sang sự kiện trên Google Calendar
CREATE TABLE IF NOT EXISTS calendar_event_map (
    id TEXT PRIMARY KEY,
    session_key TEXT NOT NULL,
    google_event_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'local',
    UNIQUE (user_id, session_key)
);

-- Mục 2.10 & Mục 3: Lịch sử đồng bộ Google Calendar
CREATE TABLE IF NOT EXISTS calendar_sync_log (
    id TEXT PRIMARY KEY,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'partial', 'error')),
    error TEXT,
    user_id TEXT NOT NULL DEFAULT 'local'
);

-- Mục 4: Bảng lưu mã kết nối OAuth Google Calendar mã hóa AES-256-GCM (chỉ dùng phía server, không bao giờ gửi xuống trình duyệt)
CREATE TABLE IF NOT EXISTS gcal_tokens (
    user_id TEXT PRIMARY KEY,
    encrypted_tokens TEXT NOT NULL,
    calendar_id TEXT DEFAULT '',
    account_email TEXT DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'oauth',
    token_expired BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    user_id TEXT NOT NULL DEFAULT 'local',
    notify_enabled BOOLEAN DEFAULT FALSE,
    notify_time TEXT DEFAULT '06:00',
    notify_email TEXT DEFAULT '',
    notify_content TEXT DEFAULT 'both' CHECK (notify_content IN ('both', 'school', 'tutoring')),
    weekly_summary BOOLEAN DEFAULT FALSE,
    gemini_api_key TEXT DEFAULT '',
    afternoon_start TEXT DEFAULT '12:00',
    evening_start TEXT DEFAULT '17:00',
    show_session_overlay BOOLEAN DEFAULT TRUE,
    show_duty_in_email BOOLEAN DEFAULT TRUE,
    show_duty_in_gcal BOOLEAN DEFAULT TRUE,
    period_duration_minutes INTEGER DEFAULT 45,
    morning_long_break_minutes INTEGER DEFAULT 20,
    duty_end_time TEXT DEFAULT '16:30',
    default_trial_sessions INTEGER DEFAULT 2,
    gcal_enabled BOOLEAN DEFAULT FALSE,
    gcal_calendar_id TEXT DEFAULT '',
    gcal_connected BOOLEAN DEFAULT FALSE,
    gcal_account_email TEXT DEFAULT '',
    gcal_token_expired BOOLEAN DEFAULT FALSE,
    gcal_content TEXT DEFAULT 'both' CHECK (gcal_content IN ('school', 'extra', 'both')),
    gcal_reminders JSONB DEFAULT '[30]'::jsonb,
    gcal_school_reminders JSONB DEFAULT '[30]'::jsonb,
    gcal_extra_reminders JSONB DEFAULT '[30]'::jsonb,
    gcal_weeks_ahead INTEGER DEFAULT 8,
    gcal_travel_reminder BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS notification_log (
    id TEXT PRIMARY KEY,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    to_email TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'error')),
    error TEXT,
    subject TEXT,
    user_id TEXT NOT NULL DEFAULT 'local'
);

-- Backward compatibility migrations for existing volumes
ALTER TABLE students ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS left_date DATE;

ALTER TABLE school_schedule ADD COLUMN IF NOT EXISTS week_start DATE DEFAULT '2026-01-05';
ALTER TABLE school_schedule ADD COLUMN IF NOT EXISTS period_code TEXT DEFAULT 'S1';
ALTER TABLE school_schedule ADD COLUMN IF NOT EXISTS session TEXT DEFAULT 'morning';
ALTER TABLE school_schedule ADD COLUMN IF NOT EXISTS cell_type TEXT DEFAULT 'class';
ALTER TABLE school_schedule ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';

ALTER TABLE settings ADD COLUMN IF NOT EXISTS afternoon_start TEXT DEFAULT '12:00';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS evening_start TEXT DEFAULT '17:00';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_session_overlay BOOLEAN DEFAULT TRUE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_duty_in_email BOOLEAN DEFAULT TRUE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_duty_in_gcal BOOLEAN DEFAULT TRUE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS period_duration_minutes INTEGER DEFAULT 45;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS morning_long_break_minutes INTEGER DEFAULT 20;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS duty_end_time TEXT DEFAULT '16:30';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_trial_sessions INTEGER DEFAULT 2;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_calendar_id TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_account_email TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_token_expired BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_content TEXT DEFAULT 'both';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_reminders JSONB DEFAULT '[30]'::jsonb;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_school_reminders JSONB DEFAULT '[30]'::jsonb;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_extra_reminders JSONB DEFAULT '[30]'::jsonb;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_weeks_ahead INTEGER DEFAULT 8;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_travel_reminder BOOLEAN DEFAULT TRUE;

ALTER TABLE holidays DROP CONSTRAINT IF EXISTS holidays_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS holidays_user_date_uidx ON holidays (user_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS settings_user_id_uidx ON settings (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS session_notes_lookup_uidx ON session_notes (class_id, date, start_time);

CREATE INDEX IF NOT EXISTS idx_classes_user ON classes (user_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON students (class_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_user ON student_enrollments (user_id, student_id);
CREATE INDEX IF NOT EXISTS idx_student_status_history_user ON student_status_history (user_id, student_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_session_guests_user ON session_guests (user_id, host_class_id, date);
CREATE INDEX IF NOT EXISTS idx_schedule_rules_user ON schedule_rules (user_id);
CREATE INDEX IF NOT EXISTS idx_schedule_rules_class ON schedule_rules (class_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_rule_date ON session_exceptions (rule_id, original_date);
CREATE INDEX IF NOT EXISTS idx_exceptions_user ON session_exceptions (user_id);
CREATE INDEX IF NOT EXISTS idx_extra_sessions_user_date ON extra_sessions (user_id, date);
CREATE INDEX IF NOT EXISTS idx_school_periods_user ON school_periods (user_id, period_code);
CREATE INDEX IF NOT EXISTS idx_school_schedule_user ON school_schedule (user_id, week_start, weekday);
CREATE INDEX IF NOT EXISTS idx_school_week_configs_user ON school_week_configs (user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_holidays_user_date ON holidays (user_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance (user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_user ON payment_transactions (user_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_tx_student ON payment_transactions (student_id, paid_at ASC);
CREATE INDEX IF NOT EXISTS idx_month_locks_user ON month_locks (user_id, month);
CREATE INDEX IF NOT EXISTS idx_change_log_user ON change_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cal_event_map_user ON calendar_event_map (user_id, session_key);
CREATE INDEX IF NOT EXISTS idx_cal_sync_log_user ON calendar_sync_log (user_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log (user_id, sent_at DESC);

-- Mục 4: Row Level Security (RLS) cho tất cả bảng mới & bảng chính (mỗi tài khoản chỉ đọc/ghi dữ liệu của chính mình)
ALTER TABLE student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_week_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE month_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gcal_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'student_enrollments' AND policyname = 'rls_student_enrollments_user') THEN
        CREATE POLICY rls_student_enrollments_user ON student_enrollments
            USING (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id))
            WITH CHECK (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'student_status_history' AND policyname = 'rls_student_status_history_user') THEN
        CREATE POLICY rls_student_status_history_user ON student_status_history
            USING (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id))
            WITH CHECK (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'session_guests' AND policyname = 'rls_session_guests_user') THEN
        CREATE POLICY rls_session_guests_user ON session_guests
            USING (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id))
            WITH CHECK (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'school_week_configs' AND policyname = 'rls_school_week_configs_user') THEN
        CREATE POLICY rls_school_week_configs_user ON school_week_configs
            USING (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id))
            WITH CHECK (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payment_transactions' AND policyname = 'rls_payment_transactions_user') THEN
        CREATE POLICY rls_payment_transactions_user ON payment_transactions
            USING (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id))
            WITH CHECK (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'month_locks' AND policyname = 'rls_month_locks_user') THEN
        CREATE POLICY rls_month_locks_user ON month_locks
            USING (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id))
            WITH CHECK (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'change_log' AND policyname = 'rls_change_log_user') THEN
        CREATE POLICY rls_change_log_user ON change_log
            USING (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id))
            WITH CHECK (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_event_map' AND policyname = 'rls_calendar_event_map_user') THEN
        CREATE POLICY rls_calendar_event_map_user ON calendar_event_map
            USING (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id))
            WITH CHECK (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_sync_log' AND policyname = 'rls_calendar_sync_log_user') THEN
        CREATE POLICY rls_calendar_sync_log_user ON calendar_sync_log
            USING (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id))
            WITH CHECK (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gcal_tokens' AND policyname = 'rls_gcal_tokens_user') THEN
        CREATE POLICY rls_gcal_tokens_user ON gcal_tokens
            USING (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id))
            WITH CHECK (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id));
    END IF;
END
$$;

INSERT INTO settings (id, user_id, notify_enabled, notify_time, notify_email, notify_content, weekly_summary)
VALUES ('default', 'local', false, '06:00', '', 'both', false)
ON CONFLICT (id) DO NOTHING;
