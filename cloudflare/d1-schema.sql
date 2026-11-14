-- ============================================================================
-- CLOUDFLARE D1 DATABASE SCHEMA (SQLite Edge Database)
-- Hệ thống Quản lý Lịch dạy & Học phí Giáo viên
-- Ghi chú: Backend Cloudflare Pages Functions / Workers cũng tự động chạy lệnh
-- CREATE TABLE IF NOT EXISTS này ở request đầu tiên nên bạn không lo lỗi thiếu bảng.
-- ============================================================================

CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kv_store_updated_at ON kv_store(updated_at);

