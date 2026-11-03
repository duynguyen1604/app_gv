import { useState } from 'react'
import { MessageSquare, Upload, AlertTriangle, CheckCircle, Trash2, Plus, Sparkles, Loader2 } from 'lucide-react'
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

export function ZaloMessageModal({ open, onClose, currentWeekStart }: ZaloMessageModalProps) {
  const { 
    classes, 
    schoolSchedule, 
    scheduleRules, 
    sessionExceptions, 
    extraSessions, 
    addExtraSession, 
    addSessionException,
    settings 
  } = useAppStore()

  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsedItems, setParsedItems] = useState<ParsedScheduleItem[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleParse = async () => {
    if (!messageText.trim() && !selectedFile) {
      toast.error('Vui lòng nhập nội dung tin nhắn hoặc tải ảnh')
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

      // Run conflict detection on each item
      const enriched = items.map(item => {
        if (!item.start_time || !item.end_time || !item.date) return item
        const conflict = checkScheduleConflict({
          date: item.date,
          start_time: item.start_time,
          end_time: item.end_time,
          class_id: item.class_match || undefined,
          schoolSchedule,
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
        toast('Không tìm thấy thông tin lịch trong tin nhắn', { icon: 'ℹ️' })
      } else {
        toast.success(`Đã phân tích được ${enriched.length} buổi`)
      }
    } catch (err: any) {
      toast.error('Lỗi khi phân tích tin nhắn: ' + (err?.message || 'Không rõ'))
    } finally {
      setLoading(false)
    }
  }

  const updateItem = (index: number, patch: Partial<ParsedScheduleItem>) => {
    setParsedItems(prev => {
      const copy = [...prev]
      const updated = { ...copy[index], ...patch }

      // Re-run conflict check if date/time changed
      if (updated.date && updated.start_time && updated.end_time) {
        const conflict = checkScheduleConflict({
          date: updated.date,
          start_time: updated.start_time,
          end_time: updated.end_time,
          class_id: updated.class_match || undefined,
          schoolSchedule,
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
    setParsedItems(prev => prev.filter((_, i) => i !== index))
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
        toast.error(`Vui lòng nhập giờ bắt đầu và kết thúc cho buổi "${item.source_text}"`)
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
        // Find existing schedule rule for this class
        const rule = scheduleRules.find(r => r.class_id === item.class_match)
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
          // If no rule, just add as extra session
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
        const rule = scheduleRules.find(r => r.class_id === item.class_match)
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

  return (
    <Modal open={open} onClose={onClose} title="Dán tin nhắn Zalo / SMS" size="lg">
      <div className="flex flex-col gap-4">
        <div>
          <label className="label flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <MessageSquare size={16} className="text-blue-500" />
              Nội dung tin nhắn
            </span>
            <span className="text-xs text-gray-400 font-normal">Có thể dán nhiều tin</span>
          </label>
          <textarea
            className="input min-h-[90px] font-sans text-sm"
            rows={4}
            value={messageText}
            onChange={e => setMessageText(e.target.value)}
            placeholder={"Ví dụ:\n- T7 sáng dạy lớp 9 từ 9h-11h\n- Mai dời lớp 10 sang 19h30 nhé cô\n- Tối nay nghỉ lớp 11 do mưa to"}
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleParse}
            disabled={loading || !messageText.trim()}
            className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? 'Đang phân tích...' : 'Phân tích tin nhắn'}
          </button>
        </div>

        {/* Results preview */}
        {parsedItems.length > 0 && (
          <div className="flex flex-col gap-3 mt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Kết quả phân tích ({parsedItems.length} buổi) - Cho phép sửa tay:
              </h4>
            </div>

            <div className="flex flex-col gap-3 max-h-[380px] overflow-y-auto pr-1">
              {parsedItems.map((item, idx) => {
                const hasAmbiguity = !!item.ambiguity || item.confidence < 0.75
                const hasConflict = !!item.conflict_warning

                return (
                  <div
                    key={idx}
                    className={cn(
                      'p-3 rounded-xl border text-sm transition-all',
                      hasConflict
                        ? 'border-red-400 bg-red-50/70 dark:bg-red-950/20'
                        : hasAmbiguity
                          ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20'
                          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/80'
                    )}
                  >
                    {/* Raw text */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-xs text-gray-500 italic bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                        Tin: "{item.source_text}"
                      </span>
                      <button
                        onClick={() => removeItem(idx)}
                        className="btn-icon p-1 text-red-500 hover:bg-red-50"
                        title="Xóa dòng này"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Ambiguity or conflict notice */}
                    {hasAmbiguity && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 mb-2">
                        <AlertTriangle size={13} className="shrink-0" />
                        <span>{item.ambiguity || 'Độ tin cậy thấp, vui lòng kiểm tra kỹ'}</span>
                      </div>
                    )}
                    {hasConflict && (
                      <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-semibold mb-2">
                        <AlertTriangle size={13} className="shrink-0" />
                        <span>CẢNH BÁO TRÙNG LỊCH: {item.conflict_warning}</span>
                      </div>
                    )}

                    {/* Form controls */}
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="text-[11px] font-medium text-gray-500">Hành động</label>
                        <select
                          className="input py-1 text-xs"
                          value={item.action}
                          onChange={e => updateItem(idx, { action: e.target.value as any })}
                        >
                          <option value="add">➕ Thêm buổi mới</option>
                          <option value="move">🔄 Dời buổi</option>
                          <option value="cancel">❌ Hủy / Nghỉ</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-gray-500">Lớp</label>
                        <select
                          className={cn('input py-1 text-xs', !item.class_match && 'border-amber-400 bg-amber-50')}
                          value={item.class_match || ''}
                          onChange={e => updateItem(idx, { class_match: e.target.value || null })}
                        >
                          <option value="">-- Chọn lớp --</option>
                          {classes.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[11px] font-medium text-gray-500">Ngày</label>
                        <input
                          type="date"
                          className="input py-1 text-xs"
                          value={item.date}
                          onChange={e => updateItem(idx, { date: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-gray-500">Bắt đầu</label>
                        <input
                          type="time"
                          className="input py-1 text-xs"
                          value={item.start_time || ''}
                          onChange={e => updateItem(idx, { start_time: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-gray-500">Kết thúc</label>
                        <input
                          type="time"
                          className="input py-1 text-xs"
                          value={item.end_time || ''}
                          onChange={e => updateItem(idx, { end_time: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setParsedItems([])}
                className="btn-secondary flex-1"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5"
              >
                <CheckCircle size={16} />
                Xác nhận lưu ({parsedItems.length} buổi)
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

