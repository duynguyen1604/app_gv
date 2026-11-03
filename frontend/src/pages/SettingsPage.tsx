import { useState, useMemo, useRef, useEffect } from 'react'
import { 
  Moon, 
  Sun, 
  Bell, 
  BellOff, 
  Mail, 
  Clock, 
  Send, 
  CheckCircle, 
  XCircle, 
  Trash2, 
  Key, 
  CalendarOff, 
  Plus, 
  Download, 
  Upload, 
  Eye, 
  EyeOff, 
  Sparkles,
  AlertTriangle,
  History,
  Cloud,
  RefreshCw
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { TopBar } from '../components/ui/TopBar'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { formatFullDate, formatDate, dateToWeekday, dateToStr } from '../lib/dateUtils'
import { cn } from '../lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { bootstrapCloudSync, fetchHealth, pushServerState, sendTestEmail } from '../lib/backendSync'

export function SettingsPage() {
  const { 
    darkMode, 
    toggleDarkMode, 
    settings, 
    updateSettings, 
    notificationLogs, 
    addNotificationLog,
    classes,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    schoolSchedule,
    holidays,
    addHoliday,
    deleteHoliday,
    students,
    attendance,
    payments,
    sessionNotes,
    userId,
  } = useAppStore()

  const [cloudStatus, setCloudStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [syncing, setSyncing] = useState(false)

  const [showLogs, setShowLogs] = useState(false)
  const [showEmailPreview, setShowEmailPreview] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  
  // Holidays
  const [newHolidayDate, setNewHolidayDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [newHolidayNote, setNewHolidayNote] = useState('')
  const [deleteHolidayId, setDeleteHolidayId] = useState<string | null>(null)

  // Backup restore file input
  const fileInputRef = useRef<HTMLInputElement>(null)

  const toggleNotify = () => updateSettings({ notify_enabled: !settings.notify_enabled })

  // Compute today's actual schedule for email preview
  const todayDateStr = dateToStr(new Date())
  const todayWeekday = dateToWeekday(new Date())

  const todaySessions = useMemo(() => {
    const list: { type: string, title: string, time: string, location?: string }[] = []

    // School schedule
    if (settings.notify_content === 'both' || settings.notify_content === 'school') {
      schoolSchedule
        .filter(s => s.weekday === todayWeekday && s.valid_from <= todayDateStr && (!s.valid_to || s.valid_to >= todayDateStr))
        .forEach(s => {
          list.push({
            type: 'Trường',
            title: `${s.class_name} - Môn ${s.subject}`,
            time: `${s.start_time} – ${s.end_time}`,
            location: s.room ? `Phòng ${s.room}` : undefined
          })
        })
    }

    // Tutoring fixed rules
    if (settings.notify_content === 'both' || settings.notify_content === 'tutoring') {
      scheduleRules
        .filter(r => r.weekday === todayWeekday && r.valid_from <= todayDateStr && (!r.valid_to || r.valid_to >= todayDateStr))
        .forEach(rule => {
          const ex = sessionExceptions.find(e => e.rule_id === rule.id && e.original_date === todayDateStr)
          if (ex?.action === 'cancelled' || ex?.action === 'moved') return

          const cls = classes.find(c => c.id === rule.class_id)
          list.push({
            type: 'Dạy thêm',
            title: cls?.name || 'Lớp dạy thêm',
            time: `${rule.start_time} – ${rule.end_time}`,
            location: cls?.location || undefined
          })
        })

      // Extra sessions today
      extraSessions
        .filter(e => e.date === todayDateStr)
        .forEach(e => {
          const cls = classes.find(c => c.id === e.class_id)
          list.push({
            type: 'Phát sinh',
            title: `${cls?.name || 'Lớp'} (Buổi phát sinh)`,
            time: `${e.start_time} – ${e.end_time}`,
            location: cls?.location || undefined
          })
        })

      // Moved sessions landing today
      sessionExceptions
        .filter(e => e.action === 'moved' && e.new_date === todayDateStr && e.new_start && e.new_end)
        .forEach(e => {
          const rule = scheduleRules.find(r => r.id === e.rule_id)
          const cls = classes.find(c => c.id === rule?.class_id)
          list.push({
            type: 'Dời đến',
            title: `${cls?.name || 'Lớp'} (Buổi dời)`,
            time: `${e.new_start} – ${e.new_end}`,
            location: cls?.location || undefined
          })
        })
    }

    return list.sort((a, b) => a.time.localeCompare(b.time))
  }, [schoolSchedule, scheduleRules, sessionExceptions, extraSessions, classes, todayWeekday, todayDateStr, settings.notify_content])

  useEffect(() => {
    void fetchHealth()
      .then(() => setCloudStatus('online'))
      .catch(() => setCloudStatus('offline'))
  }, [])

  const handleSendTestEmail = async () => {
    if (!settings.notify_email) {
      toast.error('Vui lòng nhập email nhận thông báo')
      return
    }

    try {
      const result = await sendTestEmail(settings.notify_email, todaySessions)
      addNotificationLog({
        sent_at: new Date().toISOString(),
        to: settings.notify_email,
        status: 'success',
        error: null,
        subject: `[Kiểm thử Thông báo Lịch dạy] ${formatFullDate(new Date())}`,
      })
      if (result?.result?.simulated) {
        toast.success('Backend đã nhận yêu cầu. SMTP chưa cấu hình nên email được mô phỏng.')
      } else {
        toast.success(`Đã gửi email kiểm thử tới ${settings.notify_email}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gửi email thất bại'
      addNotificationLog({
        sent_at: new Date().toISOString(),
        to: settings.notify_email,
        status: 'error',
        error: message,
        subject: `[Kiểm thử Thông báo Lịch dạy] ${formatFullDate(new Date())}`,
      })
      toast.error(message)
    }
  }

  const handleManualSync = async () => {
    setSyncing(true)
    try {
      const result = await bootstrapCloudSync()
      if (result === 'offline') {
        setCloudStatus('offline')
        toast.error('Không kết nối được backend. Hãy chạy Docker PostgreSQL + API.')
        return
      }
      if (result === 'pulled') {
        toast.success('Đã kéo dữ liệu mới nhất từ PostgreSQL')
      } else {
        await pushServerState(userId)
        toast.success('Đã đẩy dữ liệu lên PostgreSQL')
      }
      setCloudStatus('online')
    } catch (err: unknown) {
      setCloudStatus('offline')
      toast.error(err instanceof Error ? err.message : 'Đồng bộ thất bại')
    } finally {
      setSyncing(false)
    }
  }

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newHolidayDate) return
    addHoliday({
      date: newHolidayDate,
      note: newHolidayNote.trim() || 'Nghỉ lễ / Nghỉ chung',
    })
    toast.success(`Đã thêm ngày nghỉ lễ ${formatDate(newHolidayDate)}`)
    setNewHolidayNote('')
  }

  // Backup entire data to JSON
  const handleExportBackup = () => {
    const data = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      classes,
      students,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      schoolSchedule,
      holidays,
      sessionNotes,
      attendance,
      payments,
      settings,
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sao-luu-lich-day-${format(new Date(), 'yyyy-MM-dd')}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Đã xuất file sao lưu dữ liệu thành công!')
  }

  // Restore data from JSON
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        if (!data.classes || !Array.isArray(data.classes)) {
          throw new Error('Định dạng file sao lưu không hợp lệ')
        }

        // Update state
        useAppStore.setState({
          classes: data.classes || [],
          students: data.students || [],
          scheduleRules: data.scheduleRules || [],
          sessionExceptions: data.sessionExceptions || [],
          extraSessions: data.extraSessions || [],
          schoolSchedule: data.schoolSchedule || [],
          holidays: data.holidays || [],
          sessionNotes: data.sessionNotes || [],
          attendance: data.attendance || [],
          payments: data.payments || [],
        })

        toast.success('Khôi phục dữ liệu từ bản sao lưu thành công!')
      } catch (err: any) {
        toast.error('Lỗi khi khôi phục: ' + (err?.message || 'File không đúng cấu trúc'))
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Cài đặt hệ thống" />

      <div className="p-4 flex flex-col gap-4">
        {/* Appearance */}
        <section className="card p-4">
          <h2 className="section-title mb-3">Giao diện</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {darkMode ? <Moon size={18} className="text-blue-400" /> : <Sun size={18} className="text-yellow-500" />}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {darkMode ? 'Chế độ tối (Dark Mode)' : 'Chế độ sáng (Light Mode)'}
              </span>
            </div>
            <button
              onClick={toggleDarkMode}
              className={cn(
                'relative w-12 h-6 rounded-full transition-colors duration-200',
                darkMode ? 'bg-blue-600' : 'bg-gray-300'
              )}
            >
              <div className={cn(
                'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200',
                darkMode && 'translate-x-6'
              )} />
            </button>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="section-title mb-2 flex items-center gap-2">
            <Cloud size={18} className="text-sky-500" />
            Đồng bộ PostgreSQL
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Dữ liệu lớp, lịch, điểm danh và cài đặt được lưu trên trình duyệt và tự đẩy lên database khi backend đang chạy.
          </p>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs">
              <div className="font-semibold text-gray-700 dark:text-gray-300">
                {cloudStatus === 'checking' && 'Đang kiểm tra máy chủ...'}
                {cloudStatus === 'online' && 'Backend & database đang kết nối'}
                {cloudStatus === 'offline' && 'Chưa kết nối backend'}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">Tài khoản dữ liệu: {userId}</div>
            </div>
            <button
              type="button"
              onClick={() => void handleManualSync()}
              disabled={syncing}
              className="btn-secondary text-xs inline-flex items-center gap-1"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              Đồng bộ ngay
            </button>
          </div>
        </section>

        {/* AI & Gemini Configuration */}
        <section className="card p-4">
          <h2 className="section-title mb-2 flex items-center gap-2">
            <Sparkles size={18} className="text-purple-500" />
            Cấu hình AI (Google Gemini)
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Dùng để đọc ảnh Thời khóa biểu trường (Vision) và tự động nhận diện tin nhắn Zalo. Ứng dụng đã có sẵn bộ giải mã tiếng Việt offline, nhưng bạn có thể thêm API Key để xử lý thông minh hơn.
          </p>

          <div>
            <label className="label text-xs">Google Gemini API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                className="input pr-10 text-xs font-mono"
                placeholder="AIzaSy..."
                value={settings.gemini_api_key || ''}
                onChange={e => updateSettings({ gemini_api_key: e.target.value.trim() })}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </section>

        {/* Notifications (Gmail) */}
        <section className="card p-4">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Mail size={18} className="text-blue-500" />
            Thông báo lịch dạy qua Gmail
          </h2>
          
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {settings.notify_enabled 
                ? <Bell size={18} className="text-blue-500" /> 
                : <BellOff size={18} className="text-gray-400" />}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {settings.notify_enabled ? 'Đang bật tự động gửi email' : 'Chưa bật tự động'}
              </span>
            </div>
            <button
              onClick={toggleNotify}
              className={cn(
                'relative w-12 h-6 rounded-full transition-colors duration-200',
                settings.notify_enabled ? 'bg-blue-600' : 'bg-gray-300'
              )}
            >
              <div className={cn(
                'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200',
                settings.notify_enabled && 'translate-x-6'
              )} />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="label text-xs">Email giáo viên nhận thông báo</label>
              <input
                className="input text-xs"
                type="email"
                value={settings.notify_email}
                onChange={e => updateSettings({ notify_email: e.target.value })}
                placeholder="giaovien@gmail.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Giờ gửi hằng ngày</label>
                <input
                  className="input text-xs"
                  type="time"
                  value={settings.notify_time}
                  onChange={e => updateSettings({ notify_time: e.target.value })}
                />
              </div>

              <div>
                <label className="label text-xs">Nội dung gửi</label>
                <select
                  className="input text-xs py-2"
                  value={settings.notify_content}
                  onChange={e => updateSettings({ notify_content: e.target.value as any })}
                >
                  <option value="both">Cả trường & dạy thêm</option>
                  <option value="school">Chỉ lịch trường</option>
                  <option value="tutoring">Chỉ lịch dạy thêm</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">Tóm tắt cuối tuần</div>
                <div className="text-[11px] text-gray-400">Gửi tổng quan tuần sau vào mỗi Chủ nhật</div>
              </div>
              <button
                onClick={() => updateSettings({ weekly_summary: !settings.weekly_summary })}
                className={cn(
                  'relative w-10 h-5 rounded-full transition-colors duration-200',
                  settings.weekly_summary ? 'bg-blue-600' : 'bg-gray-300'
                )}
              >
                <div className={cn(
                  'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                  settings.weekly_summary && 'translate-x-5'
                )} />
              </button>
            </div>

            {/* Preview & Test Buttons */}
            <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setShowEmailPreview(true)}
                className="btn-secondary py-2 flex-1 text-xs flex items-center justify-center gap-1.5"
              >
                <Eye size={14} /> Xem trước email
              </button>
              <button
                onClick={handleSendTestEmail}
                className="btn-primary py-2 flex-1 text-xs flex items-center justify-center gap-1.5"
              >
                <Send size={14} /> Gửi thử
              </button>
            </div>
          </div>
        </section>

        {/* Holiday Management (Mục 2.8) */}
        <section className="card p-4">
          <h2 className="section-title mb-1 flex items-center gap-2">
            <CalendarOff size={18} className="text-orange-500" />
            Ngày nghỉ lễ / Nghỉ chung
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            Tự động ẩn mọi buổi học trong ngày đó trên thời gian biểu mà không cần hủy từng buổi.
          </p>

          <form onSubmit={handleAddHoliday} className="flex gap-2 mb-3">
            <input
              type="date"
              className="input py-1.5 text-xs w-36 shrink-0"
              value={newHolidayDate}
              onChange={e => setNewHolidayDate(e.target.value)}
            />
            <input
              className="input py-1.5 text-xs flex-1"
              placeholder="Tên ngày nghỉ (vd: 20/11, Nghỉ Tết...)"
              value={newHolidayNote}
              onChange={e => setNewHolidayNote(e.target.value)}
            />
            <button type="submit" className="btn-primary py-1.5 px-3 text-xs shrink-0">
              <Plus size={14} /> Thêm
            </button>
          </form>

          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
            {holidays.length === 0 ? (
              <p className="text-xs text-gray-400 py-2 text-center">Chưa có ngày nghỉ lễ nào được đặt.</p>
            ) : (
              holidays.map(h => (
                <div key={h.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800 text-xs">
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      {formatDate(h.date)}
                    </span>
                    <span className="text-gray-500 ml-2">({h.note})</span>
                  </div>
                  <button
                    onClick={() => setDeleteHolidayId(h.id)}
                    className="btn-icon p-1 text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Backup and Restore (Mục 2.8) */}
        <section className="card p-4">
          <h2 className="section-title mb-2">Sao lưu & Khôi phục dữ liệu</h2>
          <p className="text-xs text-gray-400 mb-3">
            Tải toàn bộ dữ liệu lịch dạy, học sinh, điểm danh và học phí về máy để lưu trữ hoặc chuyển sang thiết bị khác.
          </p>

          <input
            type="file"
            ref={fileInputRef}
            accept=".json"
            className="hidden"
            onChange={handleImportBackup}
          />

          <div className="flex gap-2">
            <button
              onClick={handleExportBackup}
              className="btn-secondary py-2 flex-1 text-xs flex items-center justify-center gap-1.5"
            >
              <Download size={14} /> Sao lưu ra file JSON
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary py-2 flex-1 text-xs flex items-center justify-center gap-1.5"
            >
              <Upload size={14} /> Khôi phục dữ liệu
            </button>
          </div>
        </section>

        {/* Notification History Logs */}
        <section className="card p-4">
          <button
            className="flex items-center justify-between w-full"
            onClick={() => setShowLogs(!showLogs)}
          >
            <div className="flex items-center gap-2">
              <History size={17} className="text-gray-500" />
              <h2 className="section-title">Lịch sử gửi thông báo</h2>
            </div>
            <span className="text-xs text-gray-400">{notificationLogs.length} bản ghi</span>
          </button>
          
          {showLogs && (
            <div className="mt-3 flex flex-col gap-2">
              {notificationLogs.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Chưa có thông báo nào được ghi nhận.</p>
              ) : (
                notificationLogs.slice(0, 15).map(log => (
                  <div key={log.id} className="flex items-start gap-2 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0 text-xs">
                    {log.status === 'success' 
                      ? <CheckCircle size={15} className="text-green-500 shrink-0 mt-0.5" />
                      : <XCircle size={15} className="text-red-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 dark:text-gray-200 truncate">
                        {log.subject || 'Thông báo lịch dạy'}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {format(new Date(log.sent_at), 'HH:mm dd/MM/yyyy')} → {log.to}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      </div>

      {/* Email Preview Modal */}
      <Modal open={showEmailPreview} onClose={() => setShowEmailPreview(false)} title="Xem trước nội dung email hằng ngày" size="md">
        <div className="flex flex-col gap-3">
          <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/40 text-xs">
            <p><strong>Người nhận:</strong> {settings.notify_email || '(Chưa cài email)'}</p>
            <p className="mt-0.5"><strong>Tiêu đề:</strong> [Lịch Dạy] {formatFullDate(new Date())}</p>
          </div>

          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-sans">
            <h4 className="font-bold text-sm text-blue-700 dark:text-blue-400 mb-2">
              Chào Thầy/Cô, đây là lịch dạy thực tế hôm nay:
            </h4>

            {todaySessions.length === 0 ? (
              <p className="text-gray-400 py-2">Hôm nay không có lịch dạy nào.</p>
            ) : (
              <div className="flex flex-col gap-2 my-2">
                {todaySessions.map((s, idx) => (
                  <div key={idx} className="p-2 rounded bg-gray-50 dark:bg-gray-900 border-l-4 border-blue-500">
                    <div className="font-bold text-gray-900 dark:text-white">
                      [{s.type}] {s.title}
                    </div>
                    <div className="text-gray-600 dark:text-gray-300 mt-0.5">
                      ⏰ Giờ: {s.time} {s.location ? `· 📍 ${s.location}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-gray-500 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 text-[11px]">
              * Lịch đã tự động cập nhật các buổi dời, hủy, và phát sinh mới nhất.
            </p>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setShowEmailPreview(false)} className="btn-secondary flex-1 text-xs">
              Đóng
            </button>
            <button onClick={handleSendTestEmail} className="btn-primary flex-1 text-xs">
              Gửi email này ngay
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Holiday Confirm */}
      <ConfirmDialog
        open={!!deleteHolidayId}
        onClose={() => setDeleteHolidayId(null)}
        onConfirm={() => {
          if (deleteHolidayId) deleteHoliday(deleteHolidayId)
          toast.success('Đã xóa ngày nghỉ lễ')
        }}
        title="Xóa ngày nghỉ lễ"
        message="Bạn có chắc muốn xóa ngày nghỉ lễ này? Các buổi học sẽ hiển thị trở lại."
        confirmLabel="Xóa"
      />
    </div>
  )
}
