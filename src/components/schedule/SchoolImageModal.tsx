import { useState, useRef } from 'react'
import { Image as ImageIcon, Upload, Plus, Trash2, CheckCircle, AlertTriangle, Sparkles, Loader2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { parseSchoolTimetable } from '../../lib/aiParser'
import { useAppStore } from '../../store/useAppStore'
import { VI_WEEKDAYS, VI_WEEKDAYS_FULL } from '../../lib/dateUtils'
import { cn, generateId } from '../../lib/utils'
import type { ParsedSchoolScheduleItem } from '../../types'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

interface SchoolImageModalProps {
  open: boolean
  onClose: () => void
}

export function SchoolImageModal({ open, onClose }: SchoolImageModalProps) {
  const { schoolSchedule, setSchoolSchedule, settings } = useAppStore()

  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ParsedSchoolScheduleItem[]>([])
  const [validFrom, setValidFrom] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [validTo, setValidTo] = useState(() => {
    const end = new Date()
    end.setMonth(end.getMonth() + 5)
    return format(end, 'yyyy-MM-dd')
  })
  const [showConfirmOverwrite, setShowConfirmOverwrite] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleScan = async () => {
    setLoading(true)
    try {
      const parsed = await parseSchoolTimetable({
        imageDataBase64: imagePreview || undefined,
        apiKey: settings.gemini_api_key,
      })
      setItems(parsed)
      toast.success(`Đã nhận diện ${parsed.length} tiết học! Vui lòng kiểm tra và sửa tay trước khi lưu.`)
    } catch (err: any) {
      toast.error('Lỗi khi đọc ảnh: ' + (err?.message || 'Không rõ'))
    } finally {
      setLoading(false)
    }
  }

  const updateItem = (id: string, patch: Partial<ParsedSchoolScheduleItem>) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item))
  }

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id))
  }

  const addNewRow = () => {
    const newItem: ParsedSchoolScheduleItem = {
      id: generateId(),
      weekday: 1,
      period: 'Tiết 1',
      start_time: '07:00',
      end_time: '07:45',
      class_name: '10A1',
      subject: 'Toán',
      room: 'P.101',
      confidence: 1.0,
    }
    setItems(prev => [...prev, newItem])
  }

  const handleSaveClick = () => {
    if (items.length === 0) {
      toast.error('Không có tiết học nào để lưu')
      return
    }

    if (schoolSchedule.length > 0) {
      setShowConfirmOverwrite(true)
    } else {
      executeSave()
    }
  }

  const executeSave = () => {
    setSchoolSchedule(
      items.map(it => ({
        weekday: it.weekday,
        period: it.period,
        start_time: it.start_time,
        end_time: it.end_time,
        class_name: it.class_name,
        subject: it.subject,
        room: it.room,
        valid_from: validFrom,
        valid_to: validTo || null,
      })),
      validFrom,
      validTo || null
    )
    toast.success('Đã lưu thời khóa biểu trường vào hệ thống!')
    onClose()
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Nhập thời khóa biểu trường từ ảnh" size="lg">
        <div className="flex flex-col gap-4">
          {/* File input / upload button */}
          <div className="flex flex-col gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-2 text-center">
                <img
                  src={imagePreview}
                  alt="Ảnh thời khóa biểu"
                  className="max-h-48 mx-auto object-contain rounded-lg"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary text-xs mt-2 py-1.5"
                >
                  Chọn ảnh khác
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-blue-500 transition-colors"
              >
                <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Nhấn để tải hoặc chụp ảnh thời khóa biểu
                </p>
                <p className="text-xs text-gray-400 mt-1">Hỗ trợ PNG, JPG</p>
              </div>
            )}
          </div>

          {/* Action button */}
          <button
            onClick={handleScan}
            disabled={loading}
            className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? 'Đang đọc thời khóa biểu bằng AI...' : 'Trích xuất thời khóa biểu'}
          </button>

          {/* Time range configuration */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-800">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                Áp dụng từ ngày *
              </label>
              <input
                type="date"
                className="input py-1.5 text-xs"
                value={validFrom}
                onChange={e => setValidFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                Đến ngày (học kỳ)
              </label>
              <input
                type="date"
                className="input py-1.5 text-xs"
                value={validTo}
                onChange={e => setValidTo(e.target.value)}
              />
            </div>
          </div>

          {/* Editable schedule table */}
          {items.length > 0 && (
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase">
                  Danh sách tiết học ({items.length} tiết) - Sửa tay từng ô:
                </span>
                <button onClick={addNewRow} className="btn-ghost text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <Plus size={14} /> Thêm tiết
                </button>
              </div>

              <div className="flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-1">
                {items.map(item => {
                  const isUncertain = (item.confidence ?? 1) < 0.8
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'p-2.5 rounded-lg border text-xs flex flex-col gap-2',
                        isUncertain
                          ? 'border-amber-300 bg-amber-50/70 dark:bg-amber-950/20'
                          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <select
                          className="input py-1 text-xs font-medium w-28 shrink-0"
                          value={item.weekday}
                          onChange={e => updateItem(item.id, { weekday: parseInt(e.target.value, 10) })}
                        >
                          {VI_WEEKDAYS_FULL.map((label, idx) => (
                            <option key={idx + 1} value={idx + 1}>{label}</option>
                          ))}
                        </select>

                        <div className="flex items-center gap-1 flex-1">
                          <input
                            type="time"
                            className="input py-1 text-xs flex-1"
                            value={item.start_time}
                            onChange={e => updateItem(item.id, { start_time: e.target.value })}
                          />
                          <span>–</span>
                          <input
                            type="time"
                            className="input py-1 text-xs flex-1"
                            value={item.end_time}
                            onChange={e => updateItem(item.id, { end_time: e.target.value })}
                          />
                        </div>

                        <button
                          onClick={() => removeItem(item.id)}
                          className="btn-icon text-red-400 p-1 shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <input
                          className="input py-1 text-xs"
                          placeholder="Lớp (vd 10A1)"
                          value={item.class_name}
                          onChange={e => updateItem(item.id, { class_name: e.target.value })}
                        />
                        <input
                          className="input py-1 text-xs"
                          placeholder="Môn (vd Toán)"
                          value={item.subject}
                          onChange={e => updateItem(item.id, { subject: e.target.value })}
                        />
                        <input
                          className="input py-1 text-xs"
                          placeholder="Phòng (vd P.201)"
                          value={item.room}
                          onChange={e => updateItem(item.id, { room: e.target.value })}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Confirm save button */}
              <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button onClick={onClose} className="btn-secondary flex-1">
                  Đóng
                </button>
                <button
                  onClick={handleSaveClick}
                  className="btn-primary flex-1 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle size={16} /> Lưu vào lịch ({items.length} tiết)
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={showConfirmOverwrite}
        onClose={() => setShowConfirmOverwrite(false)}
        onConfirm={executeSave}
        title="Thay thế thời khóa biểu cũ?"
        message="Hệ thống đã có thời khóa biểu trường. Bạn có chắc muốn ghi đè bằng thời khóa biểu mới này?"
        confirmLabel="Ghi đè"
        confirmVariant="danger"
      />
    </>
  )
}

