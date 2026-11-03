-- PostgreSQL Initial Schema for Teacher Schedule & Class Manager
-- Database: app_gv
-- 11 bảng nghiệp vụ + nhật ký thông báo

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
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'left')),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS school_schedule (
    id TEXT PRIMARY KEY,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    period TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    class_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    room TEXT DEFAULT '',
    valid_from DATE NOT NULL,
    valid_to DATE,
    user_id TEXT NOT NULL DEFAULT 'local'
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

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    paid BOOLEAN NOT NULL DEFAULT FALSE,
    paid_at TIMESTAMPTZ,
    user_id TEXT NOT NULL DEFAULT 'local',
    UNIQUE (student_id, month)
);

CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    user_id TEXT NOT NULL DEFAULT 'local',
    notify_enabled BOOLEAN DEFAULT FALSE,
    notify_time TEXT DEFAULT '06:00',
    notify_email TEXT DEFAULT '',
    notify_content TEXT DEFAULT 'both' CHECK (notify_content IN ('both', 'school', 'tutoring')),
    weekly_summary BOOLEAN DEFAULT FALSE,
    gemini_api_key TEXT DEFAULT ''
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

-- Ràng buộc duy nhất theo giáo viên (tương thích nếu volume cũ còn UNIQUE(date) trên holidays)
ALTER TABLE holidays DROP CONSTRAINT IF EXISTS holidays_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS holidays_user_date_uidx ON holidays (user_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS settings_user_id_uidx ON settings (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS session_notes_lookup_uidx ON session_notes (class_id, date, start_time);

CREATE INDEX IF NOT EXISTS idx_classes_user ON classes (user_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON students (class_id);
CREATE INDEX IF NOT EXISTS idx_schedule_rules_user ON schedule_rules (user_id);
CREATE INDEX IF NOT EXISTS idx_schedule_rules_class ON schedule_rules (class_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_rule_date ON session_exceptions (rule_id, original_date);
CREATE INDEX IF NOT EXISTS idx_exceptions_user ON session_exceptions (user_id);
CREATE INDEX IF NOT EXISTS idx_extra_sessions_user_date ON extra_sessions (user_id, date);
CREATE INDEX IF NOT EXISTS idx_school_schedule_user ON school_schedule (user_id, weekday);
CREATE INDEX IF NOT EXISTS idx_holidays_user_date ON holidays (user_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance (user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log (user_id, sent_at DESC);

INSERT INTO settings (id, user_id, notify_enabled, notify_time, notify_email, notify_content, weekly_summary)
VALUES ('default', 'local', false, '06:00', '', 'both', false)
ON CONFLICT (id) DO NOTHING;
