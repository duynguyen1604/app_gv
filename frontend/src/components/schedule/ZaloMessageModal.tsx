import { useState } from 'react'
import {
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Trash2,
  Sparkles,
  Loader2,
  Wand2,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { parseZaloMessages } from '../../lib/aiParser'
import { checkScheduleConflict } from '../../lib/conflictDetector'
import { useAppStore } from '../../store/useAppStore'
import { cn } from '../../lib/utils'
import type { ParsedScheduleItem } from '../../types'
import toast from 'react-hot-toast'

interface ZaloMessageModalProps {
  open: boolean
  onClose: () => void
  currentWeekStart: Date
}

export function ZaloMessageModal({
  open,
  onClose,
  currentWeekStart,
}: ZaloMessageModalProps) {
  const {
    classes,
    schoolSchedule,
    schoolPeriods,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    addExtraSession,
    addSessionException,
    settings,
  } = useAppStore()

  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsedItems, setParsedItems] = useState<ParsedScheduleItem[]>([])

  const handleParse = async () => {
    if (!messageText.trim()) {
      toast.error('Vui lòng dán hoặc nhập nội dung tin nhắn')
      return
    }

    setLoading(true)
    try {
      const items = await parseZaloMessages({
        text: messageText,
        weekStart: currentWeekStart,
        classes,
        apiKey: settings.gemini_api_key,
      })

      // Run conflict detection on each item (including schoolPeriods)
      const enriched = items.map((item) => {
        if (!item.start_time || !item.end_time || !item.date) return item
        const conflict = checkScheduleConflict({
          date: item.date,
          start_time: item.start_time,
          end_time: item.end_time,
          class_id: item.class_match || undefined,
          schoolSchedule,
          schoolPeriods,
          scheduleRules,
          sessionExceptions,
          extraSessions,
          classes,
        })
        return {
          ...item,
          conflict_warning: conflict.hasConflict ? conflict.message : null,
        }
      })

      setParsedItems(enriched)
      if (enriched.length === 0) {
        toast('Không tìm thấy thông tin lịch học trong tin nhắn', { icon: 'ℹ️' })
      } else {
        toast.success(`Đã bóc tách được ${enriched.length} buổi học!`)
      }
    } catch (err: any) {
      toast.error('Lỗi khi phân tích tin nhắn: ' + (err?.message || 'Không rõ'))
    } finally {
      setLoading(false)
    }
  }

  const updateItem = (index: number, patch: Partial<ParsedScheduleItem>) => {
    setParsedItems((prev) => {
      const copy = [...prev]
      const updated = { ...copy[index], ...patch }

      if (updated.date && updated.start_time && updated.end_time) {
        const conflict = checkScheduleConflict({
          date: updated.date,
          start_time: updated.start_time,
          end_time: updated.end_time,
          class_id: updated.class_match || undefined,
          schoolSchedule,
          schoolPeriods,
          scheduleRules,
          sessionExceptions,
          extraSessions,
          classes,
        })
        updated.conflict_warning = conflict.hasConflict ? conflict.message : null
      }

      copy[index] = updated
      return copy
    })
  }

  const removeItem = (index: number) => {
    setParsedItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleApply = () => {
    if (parsedItems.length === 0) return

    let appliedCount = 0

    for (const item of parsedItems) {
      if (!item.class_match) {
        toast.error(`Vui lòng chọn lớp cho buổi "${item.source_text}"`)
        return
      }
      if (!item.start_time || !item.end_time) {
        toast.error(
          `Vui lòng nhập giờ bắt đầu và kết thúc cho buổi "${item.source_text}"`
        )
        return
      }

      if (item.action === 'add') {
        addExtraSession({
          class_id: item.class_match,
          date: item.date,
          start_time: item.start_time,
          end_time: item.end_time,
          note: item.source_text,
          makeup_for: null,
        })
        appliedCount++
      } else if (item.action === 'move') {
        const rule = scheduleRules.find((r) => r.class_id === item.class_match)
        if (rule) {
          addSessionException({
            rule_id: rule.id,
            original_date: item.move_from_date || item.date,
            action: 'moved',
            new_date: item.date,
            new_start: item.start_time,
            new_end: item.end_time,
            reason: item.source_text,
            needs_makeup: false,
          })
          appliedCount++
        } else {
          addExtraSession({
            class_id: item.class_match,
            date: item.date,
            start_time: item.start_time,
            end_time: item.end_time,
            note: 'Dời lịch: ' + item.source_text,
            makeup_for: null,
          })
          appliedCount++
        }
      } else if (item.action === 'cancel') {
        const rule = scheduleRules.find((r) => r.class_id === item.class_match)
        if (rule) {
          addSessionException({
            rule_id: rule.id,
            original_date: item.date,
            action: 'cancelled',
            new_date: null,
            new_start: null,
            new_end: null,
            reason: item.source_text,
            needs_makeup: true,
          })
          appliedCount++
        }
      }
    }

    toast.success(`Đã cập nhật ${appliedCount} buổi vào thời gian biểu!`)
    onClose()
    setParsedItems([])
    setMessageText('')
  }

  const fillSampleText = () => {
    const sampleClass = classes[0]?.name || 'Toán 9'
    setMessageText(
      `- Thứ 7 sáng dạy bù lớp ${sampleClass} từ 08h00 đến 09h30\n- Chủ nhật dời lớp ${sampleClass} sang 19h00-20h30 nhé cô\n- Tối thứ 6 nghỉ lớp ${sampleClass} do bận họp phụ huynh`
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nhập lịch từ tin nhắn Zalo / SMS (Chia đôi màn hình)"
      size="split"
    >
      {/* Split-Screen Layout on Tablet/Desktop (Section 3.6: Trái là tin nhắn gốc, Phải là bảng kết quả sửa được) */}
      <div className="grid grid-cols-1 tablet:grid-cols-12 gap-5 items-start">
        {/* LEFT PANE (5/12): Raw Message Input */}
        <div className="tablet:col-span-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="label mb-0 flex items-center gap-1.5">
              <MessageSquare size={16} className="text-blue-600" />
              Nội dung tin nhắn gốc
            </label>
            <button
              type="button"
              onClick={fillSampleText}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              <Wand2 size={12} /> Dán tin mẫu
            </button>
          </div>

          <textarea
            className="input min-h-[180px] tablet:min-h-[240px] font-sans text-sm leading-relaxed"
            rows={8}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder={
              'Dán một hoặc nhiều tin nhắn Zalo vào đây:\n- T7 sáng dạy lớp 9 từ 9h-11h\n- Mai dời lớp 10 sang 19h30 nhé cô\n- Tối nay nghỉ lớp 11 do mưa to'
            }
            autoFocus
          />

          <button
            type="button"
            onClick={handleParse}
            disabled={loading || !messageText.trim()}
            className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
            {loading ? 'Đang phân tích ngữ nghĩa tiếng Việt...' : 'Phân tích tin nhắn sang lịch'}
          </button>

          {/* Color Legend (Section 3.6) */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 text-xs flex flex-col gap-1.5">
            <div className="font-bold text-slate-700 dark:text-slate-200">
              Quy ước màu kiểm tra:
            </div>
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <span className="w-3 h-3 rounded bg-amber-200 border border-amber-400 shrink-0" />
              <span>Ô tô vàng: Cần kiểm tra lại (thiếu tên lớp hoặc giờ chưa rõ)</span>
            </div>
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <span className="w-3 h-3 rounded bg-red-200 border border-red-500 shrink-0" />
              <span>Ô tô đỏ: Cảnh báo trùng giờ với lịch trường hoặc ca dạy khác</span>
            </div>
          </div>
        </div>

        {/* RIGHT PANE (7/12): Editable Results Table */}
        <div className="tablet:col-span-7 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Bảng kết quả xem trước ({parsedItems.length} buổi)
            </h4>
            <span className="text-xs text-slate-400">Sửa trực tiếp trước khi lưu</span>
          </div>

          {parsedItems.length === 0 ? (
            <div className="py-16 px-4 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-sm">
              Nhập hoặc dán tin nhắn ở khung bên trái rồi bấm{' '}
              <strong className="text-slate-600 dark:text-slate-300">
                "Phân tích tin nhắn sang lịch"
              </strong>{' '}
              để xem kết quả bóc tách tại đây.
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto pr-1">
                {parsedItems.map((item, idx) => {
                  const hasAmbiguity =
                    !!item.ambiguity || item.confidence < 0.75 || !item.class_match
                  const hasConflict = !!item.conflict_warning

                  return (
                    <div
                      key={idx}
                      className={cn(
                        'p-3.5 rounded-2xl border text-sm transition-all',
                        hasConflict
                          ? 'border-red-500 bg-red-50/80 dark:bg-red-950/30'
                          : hasAmbiguity
                          ? 'border-amber-400 bg-amber-50/80 dark:bg-amber-950/30'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-xs text-slate-600 dark:text-slate-300 italic bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                          Tin gốc: "{item.source_text}"
                        </span>
                        <button
                          onClick={() => removeItem(idx)}
                          className="btn-icon p-1 text-red-500 hover:bg-red-50"
                          title="Xóa dòng này"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {hasConflict && (
                        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-bold mb-2.5 p-2 rounded-lg bg-red-100/70 dark:bg-red-950/50">
                          <AlertTriangle size={14} className="shrink-0" />
                          <span>TRÙNG LỊCH: {item.conflict_warning}</span>
                        </div>
                      )}

                      {hasAmbiguity && !hasConflict && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300 font-semibold mb-2.5 p-2 rounded-lg bg-amber-100/70 dark:bg-amber-950/50">
                          <AlertTriangle size={14} className="shrink-0" />
                          <span>
                            {item.ambiguity ||
                              (!item.class_match
                                ? 'Chưa khớp tên lớp, vui lòng chọn lớp bên dưới'
                                : 'Cần kiểm tra lại giờ học')}
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-2.5">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-500">
                            Loại thay đổi
                          </label>
                          <select
                            className="input py-1.5 text-xs font-semibold"
                            value={item.action}
                            onChange={(e) =>
                              updateItem(idx, { action: e.target.value as any })
                            }
                          >
                            <option value="add">➕ Thêm buổi phát sinh / dạy bù</option>
                            <option value="move">🔄 Dời buổi học</option>
                            <option value="cancel">❌ Báo nghỉ / Hủy buổi</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-500">
                            Lớp dạy thêm *
                          </label>
                          <select
                            className={cn(
                              'input py-1.5 text-xs font-bold',
                              !item.class_match &&
                                'border-amber-500 bg-amber-100/80 dark:bg-amber-950/60'
                            )}
                            value={item.class_match || ''}
                            onChange={(e) =>
                              updateItem(idx, { class_match: e.target.value || null })
                            }
                          >
                            <option value="">-- Chọn lớp --</option>
                            {classes.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-500">
                            Ngày học
                          </label>
                          <input
                            type="date"
                            className="input py-1.5 text-xs"
                            value={item.date}
                            onChange={(e) => updateItem(idx, { date: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-500">
                            Giờ bắt đầu
                          </label>
                          <input
                            type="time"
                            className="input py-1.5 text-xs font-mono"
                            value={item.start_time || ''}
                            onChange={(e) =>
                              updateItem(idx, { start_time: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-500">
                            Giờ kết thúc
                          </label>
                          <input
                            type="time"
                            className="input py-1.5 text-xs font-mono"
                            value={item.end_time || ''}
                            onChange={(e) =>
                              updateItem(idx, { end_time: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setParsedItems([])}
                  className="btn-secondary flex-1"
                >
                  Xóa kết quả
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="btn-primary flex-1 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle size={16} />
                  Áp dụng vào lịch ({parsedItems.length} buổi)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
