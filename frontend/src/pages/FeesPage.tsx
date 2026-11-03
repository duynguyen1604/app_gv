import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { 
  Download, 
  Send, 
  MessageSquare, 
  ChevronDown, 
  ChevronRight, 
  CheckCircle, 
  Circle, 
  TrendingUp, 
  FileSpreadsheet, 
  Mail, 
  BarChart3,
  Copy,
  Check
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useAppStore } from '../store/useAppStore'
import { TopBar } from '../components/ui/TopBar'
import { formatMoney, formatMonth, getCurrentMonth, getDaysInMonth, dateToWeekday } from '../lib/dateUtils'
import { cn } from '../lib/utils'
import type { FeeRow } from '../types'
import toast from 'react-hot-toast'

export function FeesPage() {
  const {
    classes, 
    students, 
    attendance, 
    payments, 
    scheduleRules, 
    extraSessions,
    sessionExceptions, 
    setPayment,
    settings
  } = useAppStore()
  
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [selectedClassId, setSelectedClassId] = useState<string>('all')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [showWhatsapp, setShowWhatsapp] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'table' | 'stats'>('table')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Generate months list (last 12 months + current)
  const months = useMemo(() => {
    const result: string[] = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      result.push(format(d, 'yyyy-MM'))
    }
    return result
  }, [])

  // Filter classes
  const filteredClasses = selectedClassId === 'all'
    ? classes
    : classes.filter(c => c.id === selectedClassId)

  // Compute fee rows per class
  const feeData = useMemo(() => {
    const result: { cls: typeof classes[0], rows: FeeRow[], totalDue: number, totalPaid: number }[] = []
    
    for (const cls of filteredClasses) {
      const classStudents = students.filter(s => s.class_id === cls.id && s.status !== 'left')
      
      // Get all sessions in this month for this class
      const daysInMonth = getDaysInMonth(selectedMonth)
      const sessions: { date: string, start_time: string }[] = []
      
      for (const day of daysInMonth) {
        const dateStr = format(day, 'yyyy-MM-dd')
        const weekday = dateToWeekday(day)
        
        // From schedule rules
        const applicable = scheduleRules.filter(r =>
          r.class_id === cls.id &&
          r.weekday === weekday &&
          r.valid_from <= dateStr &&
          (!r.valid_to || r.valid_to >= dateStr)
        )
        for (const rule of applicable) {
          const exception = sessionExceptions.find(e => e.rule_id === rule.id && e.original_date === dateStr)
          if (exception?.action === 'cancelled') continue
          if (exception?.action === 'moved') {
            if (exception.new_date?.startsWith(selectedMonth) && exception.new_date && exception.new_start) {
              const already = sessions.find(s => s.date === exception.new_date && s.start_time === exception.new_start)
              if (!already) sessions.push({ date: exception.new_date, start_time: exception.new_start })
            }
            continue
          }
          sessions.push({ date: dateStr, start_time: rule.start_time })
        }
      }
      
      // Add extra sessions in this month
      extraSessions
        .filter(e => e.class_id === cls.id && e.date.startsWith(selectedMonth))
        .forEach(e => {
          const already = sessions.find(s => s.date === e.date && s.start_time === e.start_time)
          if (!already) sessions.push({ date: e.date, start_time: e.start_time })
        })
      
      const rows: FeeRow[] = classStudents.map(student => {
        let presentCount = 0
        let absentCount = 0
        
        for (const session of sessions) {
          const att = attendance.find(a =>
            a.student_id === student.id &&
            a.class_id === cls.id &&
            a.date === session.date &&
            a.start_time === session.start_time
          )
          if (att?.status === 'present') presentCount++
          else if (att?.status === 'absent' || att?.status === 'excused') absentCount++
        }
        
        // Skip trial students from fee calculation (0đ)
        const price = student.status === 'trial' ? 0 : (student.custom_price ?? cls.price)
        const total = presentCount * price
        const payment = payments.find(p => p.student_id === student.id && p.month === selectedMonth)
        
        return {
          student,
          present_count: presentCount,
          absent_count: absentCount,
          excused_count: 0,
          price_per_session: price,
          total,
          paid: payment?.paid ?? false,
          paid_at: payment?.paid_at ?? null,
        }
      })
      
      const totalDue = rows.reduce((sum, r) => sum + r.total, 0)
      const totalPaid = rows.filter(r => r.paid).reduce((sum, r) => sum + r.total, 0)
      
      result.push({ cls, rows, totalDue, totalPaid })
    }
    
    return result
  }, [filteredClasses, students, attendance, payments, scheduleRules, extraSessions, sessionExceptions, selectedMonth])

  const grandTotal = feeData.reduce((sum, d) => sum + d.totalDue, 0)
  const grandPaid = feeData.reduce((sum, d) => sum + d.totalPaid, 0)
  const grandRemaining = grandTotal - grandPaid

  const generateReminder = (row: FeeRow, cls: typeof classes[0]) => {
    const monthLabel = formatMonth(selectedMonth)
    return `Kính gửi quý phụ huynh bé ${row.student.name},
Xin gửi bảng thông báo học phí ${monthLabel} (Lớp: ${cls.name}):
- Số buổi học sinh có mặt: ${row.present_count} buổi
- Đơn giá: ${formatMoney(row.price_per_session)} / buổi
- Tổng học phí: ${formatMoney(row.total)}
(Ghi chú: Các buổi nghỉ/vắng không tính tiền).

Kính mong quý phụ huynh thu xếp chuyển khoản trước ngày 10 của tháng.
Trân trọng cảm ơn quý phụ huynh!`
  }

  const handleCopyReminder = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.success('Đã sao chép tin nhắn nhắc học phí!')
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Export native Excel .xlsx using SheetJS
  const exportExcel = () => {
    const data: any[] = []

    feeData.forEach(({ cls, rows }) => {
      rows.forEach(r => {
        data.push({
          'Lớp': cls.name,
          'Địa điểm': cls.location || '',
          'Tên học sinh': r.student.name,
          'Trạng thái': r.student.status === 'trial' ? 'Học thử' : 'Đang học',
          'Số buổi có mặt': r.present_count,
          'Số buổi vắng': r.absent_count,
          'Giá / buổi (VNĐ)': r.price_per_session,
          'Thành tiền (VNĐ)': r.total,
          'Tình trạng đóng': r.paid ? 'Đã đóng' : 'Chưa đóng',
          'SĐT Phụ huynh': r.student.parent_phone || '',
        })
      })
    })

    if (data.length === 0) {
      toast.error('Không có dữ liệu học phí để xuất')
      return
    }

    const worksheet = XLSX.utils.json_to_sheet(data)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, `Học phí ${selectedMonth}`)

    XLSX.writeFile(workbook, `Bang-Hoc-Phi-${selectedMonth}.xlsx`)
    toast.success('Đã xuất file Excel (.xlsx) thành công!')
  }

  // Send summary email via mailto
  const handleSendEmailSummary = () => {
    const subject = encodeURIComponent(`Báo cáo tổng hợp học phí ${formatMonth(selectedMonth)}`)
    let body = `BÁO CÁO TỔNG HỢP HỌC PHÍ ${formatMonth(selectedMonth).toUpperCase()}\n`
    body += `Tổng phải thu: ${formatMoney(grandTotal)}\n`
    body += `Đã thu: ${formatMoney(grandPaid)}\n`
    body += `Còn lại chưa thu: ${formatMoney(grandRemaining)}\n\n`

    feeData.forEach(({ cls, rows, totalDue, totalPaid }) => {
      body += `--- LỚP: ${cls.name} (Phải thu: ${formatMoney(totalDue)} | Đã thu: ${formatMoney(totalPaid)}) ---\n`
      rows.forEach(r => {
        body += `- ${r.student.name}: ${r.present_count} buổi = ${formatMoney(r.total)} [${r.paid ? 'ĐÃ ĐÓNG' : 'CHƯA ĐÓNG'}]\n`
      })
      body += '\n'
    })

    const recipient = settings.notify_email || ''
    window.location.href = `mailto:${recipient}?subject=${subject}&body=${encodeURIComponent(body)}`
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar
        title="Tổng hợp học phí"
        rightContent={
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveView(activeView === 'table' ? 'stats' : 'table')}
              className="btn-ghost text-xs flex items-center gap-1"
              title="Biểu đồ thu nhập"
            >
              {activeView === 'table' ? <BarChart3 size={17} /> : <FileSpreadsheet size={17} />}
              <span>{activeView === 'table' ? 'Thống kê' : 'Bảng'}</span>
            </button>
            <button
              onClick={exportExcel}
              className="btn-primary py-1 px-2.5 text-xs flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700"
              title="Xuất Excel .xlsx"
            >
              <Download size={14} /> Xuất Excel
            </button>
          </div>
        }
      />

      {/* Filters: Month & Class */}
      <div className="px-4 pt-3 pb-2 flex gap-2">
        <div className="flex-1">
          <label className="label text-xs">Tháng</label>
          <select
            className="input text-xs py-2"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
          >
            {months.map(m => (
              <option key={m} value={m}>{formatMonth(m)}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="label text-xs">Lớp</label>
          <select
            className="input text-xs py-2"
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
          >
            <option value="all">Tất cả lớp ({classes.length})</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="px-4 pb-3 grid grid-cols-3 gap-2">
        <div className="card p-3 text-center border-blue-100 dark:border-blue-900/40">
          <div className="text-[11px] text-gray-500 font-medium mb-0.5">Phải thu</div>
          <div className="font-extrabold text-sm text-gray-900 dark:text-white">{formatMoney(grandTotal)}</div>
        </div>
        <div className="card p-3 text-center border-green-100 dark:border-green-900/40">
          <div className="text-[11px] text-gray-500 font-medium mb-0.5">Đã thu</div>
          <div className="font-extrabold text-sm text-green-600 dark:text-green-400">{formatMoney(grandPaid)}</div>
        </div>
        <div className="card p-3 text-center border-red-100 dark:border-red-900/40">
          <div className="text-[11px] text-gray-500 font-medium mb-0.5">Còn lại</div>
          <div className={cn('font-extrabold text-sm', grandRemaining > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600')}>
            {formatMoney(grandRemaining)}
          </div>
        </div>
      </div>

      {/* Quick Action buttons */}
      <div className="px-4 pb-3 flex gap-2">
        <button
          onClick={handleSendEmailSummary}
          className="btn-secondary py-1.5 px-3 text-xs flex-1 flex items-center justify-center gap-1.5"
        >
          <Mail size={14} className="text-blue-500" />
          Gửi báo cáo qua Gmail
        </button>
      </div>

      {/* MAIN VIEW: TABLE OR INCOME STATS */}
      {activeView === 'stats' ? (
        /* INCOME COMPARISON BETWEEN CLASSES (Mục 2.8) */
        <div className="px-4 flex flex-col gap-3">
          <div className="card p-4">
            <h3 className="section-title text-sm mb-3 flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-500" />
              So sánh thu nhập giữa các lớp ({formatMonth(selectedMonth)})
            </h3>

            <div className="flex flex-col gap-4">
              {feeData.map(({ cls, totalDue, totalPaid, rows }) => {
                const percent = grandTotal > 0 ? Math.round((totalDue / grandTotal) * 100) : 0
                const paidPercent = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0

                return (
                  <div key={cls.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-gray-800 dark:text-gray-200">{cls.name}</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatMoney(totalDue)} ({percent}%)
                      </span>
                    </div>

                    {/* Total bar */}
                    <div className="w-full h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    {/* Paid status */}
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>Đã thu: {formatMoney(totalPaid)} ({paidPercent}%)</span>
                      <span className={totalDue - totalPaid > 0 ? 'text-red-500 font-medium' : 'text-green-500 font-medium'}>
                        Còn thiếu: {formatMoney(totalDue - totalPaid)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        /* FEE TABLES PER CLASS */
        <div className="px-4 flex flex-col gap-4">
          {feeData.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <TrendingUp size={48} className="mx-auto mb-3 opacity-30" />
              <p>Chưa có dữ liệu học phí cho tháng này.</p>
            </div>
          ) : (
            feeData.map(({ cls, rows, totalDue, totalPaid }) => (
              <div key={cls.id} className="card overflow-hidden">
                {/* Class header */}
                <div
                  className="px-4 py-3 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/60"
                  style={{ borderLeftColor: cls.color, borderLeftWidth: 4 }}
                >
                  <div>
                    <div className="font-bold text-gray-900 dark:text-white text-sm">{cls.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Phải thu: <strong>{formatMoney(totalDue)}</strong> · Đã thu: <strong className="text-green-600">{formatMoney(totalPaid)}</strong>
                    </div>
                  </div>
                  <span className={cn(
                    'badge text-xs',
                    totalDue - totalPaid > 0 ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                  )}>
                    {totalDue - totalPaid > 0 ? `Còn thiếu ${formatMoney(totalDue - totalPaid)}` : 'Đã thu đủ'}
                  </span>
                </div>

                {/* Student rows */}
                {rows.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-gray-400">Lớp chưa có học sinh</div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {rows.map(row => (
                      <div key={row.student.id}>
                        <div
                          className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors"
                          onClick={() => setExpandedRows(prev => {
                            const next = new Set(prev)
                            if (next.has(row.student.id)) next.delete(row.student.id)
                            else next.add(row.student.id)
                            return next
                          })}
                        >
                          {/* Paid Checkbox toggle */}
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              setPayment(row.student.id, selectedMonth, !row.paid)
                              toast.success(row.paid ? 'Đã đánh dấu chưa đóng' : 'Đã đánh dấu đã đóng học phí!')
                            }}
                            className={cn(
                              'shrink-0 p-1 rounded-full transition-colors',
                              row.paid ? 'text-green-600 dark:text-green-400' : 'text-gray-300 dark:text-gray-600 hover:text-gray-400'
                            )}
                            title={row.paid ? 'Đã đóng (nhấn để đổi)' : 'Chưa đóng (nhấn để đánh dấu đã đóng)'}
                          >
                            {row.paid ? <CheckCircle size={22} /> : <Circle size={22} />}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {row.student.name}
                              </span>
                              {row.student.status === 'trial' && (
                                <span className="badge bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-[10px]">
                                  Học thử (0đ)
                                </span>
                              )}
                              {row.paid && (
                                <span className="text-[11px] text-green-600 dark:text-green-400 font-semibold">
                                  ✓ Đã đóng
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-gray-500 mt-0.5">
                              {row.present_count} buổi có mặt × {formatMoney(row.price_per_session)} = 
                              <span className="font-bold text-gray-800 dark:text-gray-200 ml-1">
                                {formatMoney(row.total)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                setShowWhatsapp(showWhatsapp === row.student.id ? null : row.student.id)
                              }}
                              className="btn-icon p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50"
                              title="Soạn tin nhắc học phí Zalo"
                            >
                              <MessageSquare size={16} />
                            </button>
                            <ChevronRight size={15} className={cn('text-gray-300 transition-transform duration-200', expandedRows.has(row.student.id) && 'rotate-90')} />
                          </div>
                        </div>

                        {/* Expanded details */}
                        {expandedRows.has(row.student.id) && (
                          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-800">
                            <div className="grid grid-cols-2 gap-2 text-center text-xs">
                              <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded-lg">
                                <div className="font-bold text-base text-green-700 dark:text-green-400">{row.present_count}</div>
                                <div className="text-[11px] text-green-600 font-medium">Có mặt (tính tiền)</div>
                              </div>
                              <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded-lg">
                                <div className="font-bold text-base text-red-700 dark:text-red-400">{row.absent_count}</div>
                                <div className="text-[11px] text-red-600 font-medium">Vắng (không tính tiền)</div>
                              </div>
                            </div>

                            <p className="text-[11px] text-gray-500 text-center mt-2 italic">
                              * Quy tắc: Chỉ tính tiền buổi có mặt ({formatMoney(row.price_per_session)}/buổi). Buổi nghỉ/vắng không tính.
                            </p>
                          </div>
                        )}

                        {/* Reminder message generator */}
                        {showWhatsapp === row.student.id && (
                          <div className="px-4 py-3 bg-blue-50/70 dark:bg-blue-950/30 border-t border-blue-100 dark:border-blue-900/50">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                                Tin nhắn nhắc học phí (Zalo / SMS):
                              </span>
                              <button
                                onClick={() => handleCopyReminder(generateReminder(row, cls), row.student.id)}
                                className="btn-primary py-0.5 px-2 text-xs flex items-center gap-1"
                              >
                                {copiedId === row.student.id ? <Check size={12} /> : <Copy size={12} />}
                                {copiedId === row.student.id ? 'Đã sao chép' : 'Sao chép tin'}
                              </button>
                            </div>
                            <textarea
                              className="input text-xs font-mono bg-white dark:bg-gray-900 p-2 text-gray-700 dark:text-gray-300 select-all"
                              rows={8}
                              readOnly
                              value={generateReminder(row, cls)}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
