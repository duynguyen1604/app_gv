import React, { useState, useRef, useMemo } from 'react'
import {
  Upload,
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Loader2,
  Grid,
  List,
  Copy,
  Calendar,
  ShieldAlert,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { parseSchoolTimetableResult } from '../../lib/aiParser'
import { useAppStore } from '../../store/useAppStore'
import { VI_WEEKDAYS_FULL } from '../../lib/dateUtils'
import {
  addDaysToDateStr,
  getEffectivePeriodsForDate,
  getMondayOfDateStr,
} from '../../lib/schoolPeriods'
import { computeSessionsForDate } from '../../lib/conflictDetector'
import { formatFullDdMmYyyy, formatShortDdMm } from '../../lib/debtEngine'
import { cn, generateId } from '../../lib/utils'
import type { ParsedSchoolScheduleItem, SchoolCellType } from '../../types'
import toast from 'react-hot-toast'

interface SchoolImageModalProps {
  open: boolean
  onClose: () => void
  initialWeekStart?: string
  onRequestApplyMoreWeeks?: (sourceWeekStart: string) => void
}

const WEEKDAYS_T2_T7 = [
  { weekday: 1, short: 'T2', full: 'Thứ Hai' },
  { weekday: 2, short: 'T3', full: 'Thứ Ba' },
  { weekday: 3, short: 'T4', full: 'Thứ Tư' },
  { weekday: 4, short: 'T5', full: 'Thứ Năm' },
  { weekday: 5, short: 'T6', full: 'Thứ Sáu' },
  { weekday: 6, short: 'T7', full: 'Thứ Bảy' },
]

export function SchoolImageModal({
  open,
  onClose,
  initialWeekStart,
  onRequestApplyMoreWeeks,
}: SchoolImageModalProps) {
  const {
    classes,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
    schoolSchedule,
    schoolPeriods,
    schoolWeekConfigs,
    setSchoolScheduleForWeek,
    settings,
  } = useAppStore()

  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [teacherName, setTeacherName] = useState<string>('Cô Nguyễn Thị Lan')
  const [weekStart, setWeekStart] = useState<string>(() =>
    getMondayOfDateStr(initialWeekStart || '2026-11-02')
  )
  const [declaredPeriodCount, setDeclaredPeriodCount] = useState<number>(12)
  const [afternoonLongBreak, setAfternoonLongBreak] = useState<boolean>(false)
  const [afternoonBreakMinutes, setAfternoonBreakMinutes] = useState<number>(20)
  const [items, setItems] = useState<ParsedSchoolScheduleItem[]>([])
  const [previewMode, setPreviewMode] = useState<'grid' | 'list'>('grid')
  const [selectedCell, setSelectedCell] = useState<{
    weekday: number
    periodCode: string
  } | null>(null)

  const [showConfirmOverwrite, setShowConfirmOverwrite] = useState(false)
  const [postSaveApplyPromptWeek, setPostSaveApplyPromptWeek] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (open && initialWeekStart) {
      setWeekStart(getMondayOfDateStr(initialWeekStart))
    }
  }, [open, initialWeekStart])

  // Effective periods based on whether afternoon long break is toggled on in this preview
  const effectivePeriods = useMemo(() => {
    return getEffectivePeriodsForDate(
      schoolPeriods,
      weekStart,
      {
        week_start: weekStart,
        afternoon_long_break: afternoonLongBreak,
        afternoon_break_minutes: afternoonBreakMinutes,
      },
      undefined,
      settings
    )
  }, [schoolPeriods, weekStart, afternoonLongBreak, afternoonBreakMinutes, settings])

  const resolvePeriodInfo = (periodCode: string) => {
    const p = effectivePeriods.find(
      (sp) => sp.period_code.toUpperCase() === periodCode.toUpperCase()
    )
    const session: 'morning' | 'afternoon' = periodCode.toUpperCase().startsWith('C')
      ? 'afternoon'
      : 'morning'
    const num = parseInt(periodCode.slice(1), 10) || 1
    return {
      period_code: periodCode.toUpperCase(),
      session,
      period_number: num,
      period: `Tiết ${num}`,
      start_time:
        session === 'afternoon' && items.some((x) => x.period_code === periodCode && x.cell_type === 'duty')
          ? '13:30'
          : p?.start_time || (session === 'morning' ? '07:00' : '13:30'),
      end_time:
        session === 'afternoon' && items.some((x) => x.period_code === periodCode && x.cell_type === 'duty')
          ? settings.duty_end_time || '16:30'
          : p?.end_time || (session === 'morning' ? '07:45' : '14:15'),
    }
  }

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
      const parsedResult = await parseSchoolTimetableResult({
        imageDataBase64: imagePreview || undefined,
        apiKey: settings.gemini_api_key,
        defaultWeekStart: '2026-11-02',
      })
      setTeacherName(parsedResult.teacher_name || 'Cô Nguyễn Thị Lan')
      setWeekStart(getMondayOfDateStr(parsedResult.week_start || '2026-11-02'))
      setDeclaredPeriodCount(parsedResult.declared_period_count || 12)

      const normalized = parsedResult.cells.map((it) => {
        const pCode = it.period_code || `${it.session === 'afternoon' ? 'C' : 'S'}1`
        const info = resolvePeriodInfo(pCode)
        return {
          ...it,
          ...info,
        }
      })
      setItems(normalized)
      const classCount = normalized.filter((c) => c.cell_type === 'class').length
      toast.success(
        `Đã đọc TKB tuần từ ${formatFullDdMmYyyy(parsedResult.week_start)}: ${classCount} tiết dạy${
          normalized.some((c) => c.cell_type === 'duty') ? ' + có lịch Trực chiều' : ''
        }`
      )
    } catch (err: any) {
      toast.error('Lỗi khi đọc ảnh: ' + (err?.message || 'Không rõ'))
    } finally {
      setLoading(false)
    }
  }

  const updateItem = (id: string, patch: Partial<ParsedSchoolScheduleItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...patch, confidence: 1.0 }
        if (patch.period_code) {
          const info = resolvePeriodInfo(patch.period_code)
          Object.assign(next, info)
        }
        return next
      })
    )
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  const upsertGridCell = (
    weekday: number,
    periodCode: string,
    cellType: SchoolCellType | 'empty',
    classNameVal: string,
    subjectVal: string,
    roomVal: string
  ) => {
    setItems((prev) => {
      const isAfternoon = periodCode.toUpperCase().startsWith('C')
      // Group B2: If setting afternoon "Trực", remove other afternoon cells on that weekday
      const filtered = prev.filter((it) => {
        if (cellType === 'duty' && isAfternoon) {
          return !(it.weekday === weekday && it.period_code.toUpperCase().startsWith('C'))
        }
        return !(it.weekday === weekday && it.period_code === periodCode)
      })
      if (cellType === 'empty') return filtered
      const targetCode = cellType === 'duty' && isAfternoon ? 'C1' : periodCode
      const info = resolvePeriodInfo(targetCode)
      return [
        ...filtered,
        {
          id: generateId(),
          weekday,
          ...info,
          cell_type: cellType,
          class_name: cellType === 'duty' ? 'Trực' : classNameVal.trim() || '10A1',
          subject: cellType === 'duty' ? 'Trực chiều' : subjectVal.trim() || 'Toán',
          room: roomVal.trim(),
          note:
            cellType === 'duty'
              ? `Trực cả buổi chiều (13:30–${settings.duty_end_time || '16:30'})`
              : undefined,
          confidence: 1.0,
        },
      ]
    })
  }

  const addNewRow = () => {
    const info = resolvePeriodInfo('S1')
    const newItem: ParsedSchoolScheduleItem = {
      id: generateId(),
      weekday: 1,
      ...info,
      cell_type: 'class',
      class_name: '10A1',
      subject: 'Toán',
      room: '201',
      confidence: 1.0,
    }
    setItems((prev) => [...prev, newItem])
  }

  // Group B4 Cross-check: count of cell_type === 'class' ("Trực" excluded) vs declaredPeriodCount
  const actualClassPeriodCount = useMemo(
    () => items.filter((it) => it.cell_type === 'class').length,
    [items]
  )
  const dutyDaysCount = useMemo(() => {
    const set = new Set(items.filter((it) => it.cell_type === 'duty').map((it) => it.weekday))
    return set.size
  }, [items])
  const isPeriodCountMismatch =
    items.length > 0 &&
    declaredPeriodCount > 0 &&
    actualClassPeriodCount !== declaredPeriodCount

  const handleSaveClick = () => {
    if (items.length === 0) {
      toast.error('Không có tiết học nào để lưu')
      return
    }
    const normalizedMonday = getMondayOfDateStr(weekStart)
    const hasExistingInWeek = schoolSchedule.some((s) => s.week_start === normalizedMonday)
    if (hasExistingInWeek) {
      setShowConfirmOverwrite(true)
    } else {
      executeSave()
    }
  }

  const executeSave = () => {
    const normalizedMonday = getMondayOfDateStr(weekStart)
    const schedulePayload = items.map((it) => {
      const info = resolvePeriodInfo(it.period_code || 'S1')
      return {
        week_start: normalizedMonday,
        weekday: it.weekday,
        period_code: info.period_code,
        session: info.session,
        cell_type: it.cell_type || 'class',
        period: info.period_code,
        start_time:
          it.cell_type === 'duty' && info.session === 'afternoon'
            ? '13:30'
            : info.start_time,
        end_time:
          it.cell_type === 'duty' && info.session === 'afternoon'
            ? settings.duty_end_time || '16:30'
            : info.end_time,
        class_name: it.class_name,
        subject: it.subject,
        room: it.room,
        note: it.note || '',
        valid_from: normalizedMonday,
        valid_to: null,
        afternoon_long_break: afternoonLongBreak,
        afternoon_break_minutes: afternoonBreakMinutes,
      }
    })

    setSchoolScheduleForWeek(normalizedMonday, schedulePayload, {
      week_start: normalizedMonday,
      afternoon_long_break: afternoonLongBreak,
      afternoon_break_minutes: afternoonBreakMinutes,
      declared_period_count: declaredPeriodCount,
      teacher_name: teacherName,
    })

    // Check conflicts with tutoring schedule in that week (Group B4)
    const updatedStoreSchedule = [
      ...schoolSchedule.filter((s) => s.week_start !== normalizedMonday),
      ...(schedulePayload as any[]),
    ]
    const updatedConfigs = {
      ...schoolWeekConfigs,
      [normalizedMonday]: {
        week_start: normalizedMonday,
        afternoon_long_break: afternoonLongBreak,
        afternoon_break_minutes: afternoonBreakMinutes,
      },
    }

    const weekConflicts: string[] = []
    for (let i = 0; i < 7; i++) {
      const dStr = addDaysToDateStr(normalizedMonday, i)
      const daySess = computeSessionsForDate(
        dStr,
        classes,
        scheduleRules,
        sessionExceptions,
        extraSessions,
        updatedStoreSchedule,
        holidays,
        schoolPeriods,
        settings,
        undefined,
        updatedConfigs
      )
      daySess
        .filter((s) => s.has_conflict && (s.type === 'tutoring_fixed' || s.type === 'tutoring_extra'))
        .forEach((s) => {
          weekConflicts.push(
            `${formatShortDdMm(dStr)}: Lớp ${s.class_name} (${s.start_time}–${s.end_time})`
          )
        })
    }

    if (weekConflicts.length > 0) {
      toast(
        `Đã lưu TKB tuần ${formatShortDdMm(normalizedMonday)}! Phát hiện ${weekConflicts.length} buổi dạy thêm trùng lịch: ${weekConflicts.join(', ')}`,
        { icon: '⚠️', duration: 6000 }
      )
    } else {
      toast.success(
        `Đã lưu thời khóa biểu trường cho tuần từ ${formatFullDdMmYyyy(normalizedMonday)} (${actualClassPeriodCount} tiết dạy)!`
      )
    }

    setPostSaveApplyPromptWeek(normalizedMonday)
  }

  const morningCount = settings.morning_periods_count || 5
  const afternoonCount = settings.afternoon_periods_count || 4

  const morningPeriods = effectivePeriods
    .filter((p) => p.session === 'morning')
    .slice(0, morningCount)
    .sort((a, b) => a.period_code.localeCompare(b.period_code))
  const afternoonPeriods = effectivePeriods
    .filter((p) => p.session === 'afternoon')
    .slice(0, afternoonCount)
    .sort((a, b) => a.period_code.localeCompare(b.period_code))

  const uncertainCount = items.filter((it) => (it.confidence ?? 1) < 0.8).length
  const weekEndStr = addDaysToDateStr(getMondayOfDateStr(weekStart), 6)

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Nhập Thời khóa biểu trường từ ảnh (AI Vision · Theo từng tuần)"
        size="split"
      >
        <div className="grid grid-cols-1 tablet:grid-cols-12 gap-5 items-start">
          {/* LEFT PANE (5/12): Image Upload, Week Selector & Afternoon Long Break Toggle */}
          <div className="tablet:col-span-5 flex flex-col gap-3.5">
            <div className="flex flex-col gap-2">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              {imagePreview ? (
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900/5 dark:bg-slate-800 p-3 text-center">
                  <img
                    src={imagePreview}
                    alt="Ảnh thời khóa biểu gốc"
                    className="max-h-60 mx-auto object-contain rounded-xl shadow-sm"
                  />
                  <div className="flex justify-center gap-2 mt-2.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-secondary text-xs py-1.5 px-3"
                    >
                      Chọn ảnh khác
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all"
                >
                  <Upload size={32} className="mx-auto text-blue-500 mb-2" />
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Bấm để tải lên ảnh Thời khóa biểu trường
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Hoặc bấm nút bên dưới để nạp ảnh mẫu (Tuần 02/11/2026 · 12 tiết · có Trực)
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={handleScan}
              disabled={loading}
              className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Sparkles size={17} />
              )}
              {loading
                ? 'Đang phân tích bảng tiết bằng AI...'
                : imagePreview
                ? 'Đọc ảnh Thời khóa biểu ngay'
                : 'Nhập ảnh mẫu (Tuần 02/11/2026 · 12 tiết · có Trực)'}
            </button>

            {/* Week & Declared Period Count Config (Group B3 & B4) */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/70 dark:border-slate-800 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  Tuần áp dụng (Thứ 2 đầu tuần)
                </span>
                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                  {formatShortDdMm(getMondayOfDateStr(weekStart))} – {formatFullDdMmYyyy(weekEndStr)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-medium text-slate-500 mb-1 block">
                    Ngày Thứ 2 đầu tuần *
                  </label>
                  <input
                    type="date"
                    className="input py-1.5 text-xs"
                    value={weekStart}
                    onChange={(e) => setWeekStart(getMondayOfDateStr(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500 mb-1 block">
                    Số tiết trường ghi trên ảnh
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={40}
                    className="input py-1.5 text-xs font-bold"
                    value={declaredPeriodCount}
                    onChange={(e) => setDeclaredPeriodCount(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
              </div>

              {/* Prompt: "Tuần này chiều có ra chơi dài không?" (Group B1 & B4) */}
              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    Tuần này chiều có ra chơi dài không?
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {afternoonLongBreak
                      ? `Có (${afternoonBreakMinutes}p sau C2: 15:05–15:25 → C4 tan 17:00)`
                      : 'Không (Mặc định: C3 15:10–15:55, C4 tan 16:45)'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAfternoonLongBreak((v) => !v)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0',
                    afternoonLongBreak
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                  )}
                >
                  {afternoonLongBreak ? 'Có (20p)' : 'Không'}
                </button>
              </div>
            </div>

            {/* Period Count Cross-check Banner (Group B4) */}
            {items.length > 0 && (
              <div
                className={cn(
                  'p-3 rounded-xl border text-xs flex items-start gap-2',
                  isPeriodCountMismatch
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                    : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                )}
              >
                {isPeriodCountMismatch ? (
                  <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                ) : (
                  <CheckCircle size={16} className="shrink-0 mt-0.5 text-emerald-600" />
                )}
                <div>
                  {isPeriodCountMismatch ? (
                    <span className="font-bold">
                      AI đọc được {actualClassPeriodCount} tiết, trường ghi {declaredPeriodCount} tiết, hãy kiểm tra lại!
                    </span>
                  ) : (
                    <span className="font-bold">
                      Khớp chính xác: {actualClassPeriodCount} tiết dạy (bằng số tiết trường ghi: {declaredPeriodCount} tiết).
                    </span>
                  )}
                  {dutyDaysCount > 0 && (
                    <div className="text-[11px] opacity-85 mt-0.5">
                      • Có {dutyDaysCount} buổi chiều "Trực" (13:30–{settings.duty_end_time || '16:30'}) — không cộng vào số tiết dạy.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT PANE (7/12): Editable School Period Grid / List */}
          <div className="tablet:col-span-7 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  Số tiết dạy: {actualClassPeriodCount} tiết
                </span>
                {dutyDaysCount > 0 && (
                  <span className="badge bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200 text-xs">
                    +{dutyDaysCount} buổi Trực (13:30–{settings.duty_end_time || '16:30'})
                  </span>
                )}
                {uncertainCount > 0 && (
                  <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-xs">
                    {uncertainCount} ô độ tin cậy thấp
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPreviewMode('grid')}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1',
                    previewMode === 'grid'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  )}
                >
                  <Grid size={13} /> Bảng tiết (T2–T7)
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('list')}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1',
                    previewMode === 'list'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  )}
                >
                  <List size={13} /> Danh sách ({items.length})
                </button>
              </div>
            </div>

            {previewMode === 'grid' ? (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl max-h-[430px]">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
                      <th className="p-2 text-center w-24 border-r border-slate-200 dark:border-slate-700">
                        Tiết / Giờ
                      </th>
                      {WEEKDAYS_T2_T7.map((d) => (
                        <th
                          key={d.weekday}
                          className="p-2 text-center border-r border-slate-200 dark:border-slate-700 last:border-r-0 min-w-[74px]"
                        >
                          {d.short}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: '🌅 BUỔI SÁNG (Ra chơi dài 20p sau S2: 08:35–08:55)', rows: morningPeriods, isAfternoon: false },
                      {
                        label: afternoonLongBreak
                          ? `☀️ BUỔI CHIỀU (Có ra chơi dài ${afternoonBreakMinutes}p sau C2: 15:05–15:25)`
                          : '☀️ BUỔI CHIỀU (Không có ra chơi dài · C4 tan 16:45)',
                        rows: afternoonPeriods,
                        isAfternoon: true,
                      },
                    ].map((section) => (
                      <React.Fragment key={section.label}>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 font-extrabold text-[10px] text-slate-500 border-b border-slate-200 dark:border-slate-700">
                          <td colSpan={7} className="px-2.5 py-1">
                            {section.label}
                          </td>
                        </tr>
                        {section.rows.map((p, rowIdx) => (
                          <React.Fragment key={p.period_code}>
                            <tr className="border-b border-slate-100 dark:border-slate-800">
                              <td className="p-1.5 text-center border-r border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40">
                                <div className="font-extrabold text-blue-700 dark:text-blue-300 font-mono">
                                  {p.period_code}
                                </div>
                                <div className="text-[9px] text-slate-400">
                                  {p.start_time}–{p.end_time}
                                </div>
                              </td>
                              {WEEKDAYS_T2_T7.map((d) => {
                                // Group B2: Check if this weekday afternoon has "Trực"
                                const dayAfternoonDuty =
                                  section.isAfternoon &&
                                  items.find(
                                    (it) =>
                                      it.weekday === d.weekday &&
                                      it.period_code.toUpperCase().startsWith('C') &&
                                      it.cell_type === 'duty'
                                  )

                                if (dayAfternoonDuty && rowIdx > 0) {
                                  // Hidden because rowSpan covers the entire afternoon
                                  return null
                                }

                                const cell =
                                  dayAfternoonDuty ||
                                  items.find(
                                    (it) =>
                                      it.weekday === d.weekday &&
                                      it.period_code === p.period_code
                                  )
                                const isUncertain = cell && (cell.confidence ?? 1) < 0.8
                                const isDuty = cell?.cell_type === 'duty'
                                const isSelected =
                                  selectedCell?.weekday === d.weekday &&
                                  selectedCell?.periodCode === p.period_code

                                return (
                                  <td
                                    key={d.weekday}
                                    rowSpan={dayAfternoonDuty && rowIdx === 0 ? section.rows.length : 1}
                                    onClick={() =>
                                      setSelectedCell({
                                        weekday: d.weekday,
                                        periodCode: p.period_code,
                                      })
                                    }
                                    className={cn(
                                      'p-1.5 text-center border-r border-slate-100 dark:border-slate-800 last:border-r-0 cursor-pointer transition-all align-middle h-12',
                                      isSelected && 'ring-2 ring-inset ring-blue-600',
                                      isUncertain
                                        ? 'bg-amber-100/80 dark:bg-amber-950/50 border-amber-400'
                                        : isDuty
                                        ? 'bg-slate-200/85 dark:bg-slate-700/75'
                                        : cell
                                        ? 'bg-blue-50/70 dark:bg-blue-950/35'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                    )}
                                  >
                                    {cell ? (
                                      <div className="leading-tight">
                                        <div
                                          className={cn(
                                            'font-bold truncate',
                                            isDuty
                                              ? 'text-slate-800 dark:text-slate-100'
                                              : 'text-blue-800 dark:text-blue-200'
                                          )}
                                        >
                                          {isDuty ? '🛡️ TRỰC CHIỀU' : cell.class_name}
                                        </div>
                                        <div className="text-[10px] text-slate-500 dark:text-slate-300 truncate">
                                          {isDuty
                                            ? `13:30–${settings.duty_end_time || '16:30'}`
                                            : cell.room || cell.subject}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-slate-300 dark:text-slate-600 text-[10px]">
                                        +
                                      </span>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>

                            {/* Long break band row after S2 or C2 */}
                            {p.period_code === 'S2' && (
                              <tr className="bg-amber-50/50 dark:bg-amber-950/20 border-b border-slate-100 dark:border-slate-800">
                                <td
                                  colSpan={7}
                                  className="py-1 px-2 text-center text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                                >
                                  ☕ Ra chơi dài buổi sáng (08:35 – 08:55 · 20 phút)
                                </td>
                              </tr>
                            )}
                            {p.period_code === 'C2' && afternoonLongBreak && (
                              <tr className="bg-amber-50/50 dark:bg-amber-950/20 border-b border-slate-100 dark:border-slate-800">
                                <td
                                  colSpan={7}
                                  className="py-1 px-2 text-center text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                                >
                                  ☕ Ra chơi dài buổi chiều (15:05 – 15:25 · {afternoonBreakMinutes} phút)
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* List Editor View */
              <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={addNewRow}
                    className="btn-secondary py-1 px-2.5 text-xs"
                  >
                    <Plus size={13} /> Thêm tiết mới
                  </button>
                </div>
                {items.map((item) => {
                  const isUncertain = (item.confidence ?? 1) < 0.8
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'p-2.5 rounded-xl border text-xs flex flex-col gap-2',
                        isUncertain
                          ? 'border-amber-400 bg-amber-50/80 dark:bg-amber-950/30'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850'
                      )}
                    >
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <select
                          className="col-span-3 input py-1 text-xs font-semibold"
                          value={item.weekday}
                          onChange={(e) =>
                            updateItem(item.id, { weekday: parseInt(e.target.value, 10) })
                          }
                        >
                          {VI_WEEKDAYS_FULL.slice(0, 6).map((label, idx) => (
                            <option key={idx + 1} value={idx + 1}>
                              {label}
                            </option>
                          ))}
                        </select>

                        <select
                          className="col-span-2 input py-1 text-xs font-mono font-bold"
                          value={item.period_code || 'S1'}
                          onChange={(e) =>
                            updateItem(item.id, { period_code: e.target.value })
                          }
                        >
                          {effectivePeriods.map((sp) => (
                            <option key={sp.period_code} value={sp.period_code}>
                              {sp.period_code}
                            </option>
                          ))}
                        </select>

                        <select
                          className="col-span-3 input py-1 text-xs"
                          value={item.cell_type || 'class'}
                          onChange={(e) => {
                            const ct = e.target.value as SchoolCellType
                            updateItem(item.id, {
                              cell_type: ct,
                              class_name: ct === 'duty' ? 'Trực' : item.class_name,
                            })
                          }}
                        >
                          <option value="class">Lớp dạy</option>
                          <option value="duty">Trực chiều (13:30–16:30)</option>
                          <option value="other">Khác (SH/Họp)</option>
                        </select>

                        <input
                          className="col-span-3 input py-1 text-xs font-bold"
                          placeholder="Lớp (10A1)"
                          value={item.class_name}
                          onChange={(e) => updateItem(item.id, { class_name: e.target.value })}
                        />

                        <button
                          onClick={() => removeItem(item.id)}
                          className="col-span-1 btn-icon text-red-500 p-1 justify-self-end"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Quick Inline Cell Editor when clicking a cell in Grid mode */}
            {selectedCell && previewMode === 'grid' && (() => {
              const existing = items.find(
                (it) =>
                  it.weekday === selectedCell.weekday &&
                  (it.period_code === selectedCell.periodCode ||
                    (selectedCell.periodCode.startsWith('C') && it.cell_type === 'duty'))
              )
              return (
                <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="font-bold text-blue-900 dark:text-blue-200">
                    Đang sửa: Thứ {selectedCell.weekday + 1} · Tiết {selectedCell.periodCode}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="input py-1 px-2 text-xs w-24 font-bold"
                      placeholder="Lớp (10A1)"
                      value={existing?.class_name || ''}
                      onChange={(e) =>
                        upsertGridCell(
                          selectedCell.weekday,
                          selectedCell.periodCode,
                          'class',
                          e.target.value,
                          existing?.subject || 'Toán',
                          existing?.room || ''
                        )
                      }
                    />
                    <input
                      className="input py-1 px-2 text-xs w-24"
                      placeholder="Phòng (201)"
                      value={existing?.room || ''}
                      onChange={(e) =>
                        upsertGridCell(
                          selectedCell.weekday,
                          selectedCell.periodCode,
                          existing?.cell_type || 'class',
                          existing?.class_name || '10A1',
                          existing?.subject || 'Toán',
                          e.target.value
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        upsertGridCell(
                          selectedCell.weekday,
                          selectedCell.periodCode,
                          'duty',
                          'Trực',
                          'Trực chiều',
                          existing?.room || 'P.HĐ'
                        )
                      }
                      className="btn-secondary py-1 px-2.5 text-xs"
                    >
                      Đặt là "Trực"
                    </button>
                    {existing && (
                      <button
                        type="button"
                        onClick={() =>
                          upsertGridCell(
                            selectedCell.weekday,
                             existing.period_code,
                            'empty',
                            '',
                            '',
                            ''
                          )
                        }
                        className="btn-danger py-1 px-2.5 text-xs"
                      >
                        Xóa ô
                      </button>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Save Footer */}
            <div className="flex gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800 mt-auto">
              <button onClick={onClose} className="btn-secondary flex-1">
                Hủy
              </button>
              <button
                onClick={handleSaveClick}
                disabled={items.length === 0}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5"
              >
                <CheckCircle size={16} /> Lưu tuần {formatShortDdMm(getMondayOfDateStr(weekStart))} ({actualClassPeriodCount} tiết dạy)
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={showConfirmOverwrite}
        onClose={() => setShowConfirmOverwrite(false)}
        onConfirm={executeSave}
        title="Ghi đè thời khóa biểu tuần này?"
        message={`Tuần bắt đầu từ ${formatFullDdMmYyyy(getMondayOfDateStr(weekStart))} đã có thời khóa biểu trường. Bạn có chắc chắn muốn ghi đè bằng bảng tiết mới này?`}
        confirmLabel="Xác nhận ghi đè"
      />

      {/* Post-save prompt: "Áp dụng thêm cho các tuần sau không?" (Group B3 & B4) */}
      <ConfirmDialog
        open={Boolean(postSaveApplyPromptWeek)}
        onClose={() => {
          setPostSaveApplyPromptWeek(null)
          onClose()
        }}
        onConfirm={() => {
          const w = postSaveApplyPromptWeek
          setPostSaveApplyPromptWeek(null)
          onClose()
          if (w && onRequestApplyMoreWeeks) {
            onRequestApplyMoreWeeks(w)
          }
        }}
        title="Áp dụng thêm cho các tuần sau không?"
        message={`Đã lưu thời khóa biểu cho tuần ${postSaveApplyPromptWeek ? formatFullDdMmYyyy(postSaveApplyPromptWeek) : ''}. Bạn có muốn sao chép thời khóa biểu này sang các tuần tiếp theo không? (Mặc định không tự lặp nếu bạn bấm Hủy)`}
        confirmLabel="Áp dụng thêm tuần"
        confirmVariant="primary"
      />
    </>
  )
}

// ============================================================================
// Group B3: Hộp thoại "Áp dụng thêm tuần" (Copy school timetable to future weeks)
// ============================================================================
export function ApplySchoolWeeksModal({
  open,
  onClose,
  sourceWeekStart,
}: {
  open: boolean
  onClose: () => void
  sourceWeekStart: string
}) {
  const { schoolSchedule, copySchoolScheduleToWeeks } = useAppStore()
  const srcMonday = getMondayOfDateStr(sourceWeekStart)

  const [weeksCount, setWeeksCount] = useState<number>(4)
  const [conflictMode, setConflictMode] = useState<'skip' | 'overwrite'>('skip')

  const targetWeeks = useMemo(() => {
    const list: { monday: string; sunday: string; hasExistingData: boolean }[] = []
    for (let i = 1; i <= weeksCount; i++) {
      const m = addDaysToDateStr(srcMonday, i * 7)
      const s = addDaysToDateStr(m, 6)
      const hasExistingData = schoolSchedule.some((item) => item.week_start === m)
      list.push({ monday: m, sunday: s, hasExistingData })
    }
    return list
  }, [srcMonday, weeksCount, schoolSchedule])

  const existingCount = targetWeeks.filter((w) => w.hasExistingData).length

  const handleApply = () => {
    const res = copySchoolScheduleToWeeks({
      sourceWeekStart: srcMonday,
      targetWeekStarts: targetWeeks.map((w) => w.monday),
      mode: conflictMode,
    })
    toast.success(
      `Đã áp dụng thời khóa biểu cho ${res.copiedWeeks.length} tuần${
        res.skippedWeeks.length > 0 ? ` (bỏ qua ${res.skippedWeeks.length} tuần đã có lịch)` : ''
      }!`
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Áp dụng thời khóa biểu trường sang các tuần tiếp theo`}
      subtitle={`Nguồn: Tuần từ ${formatFullDdMmYyyy(srcMonday)}`}
      size="md"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Chọn số tuần tiếp theo muốn áp dụng
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 4, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setWeeksCount(n)}
                className={cn(
                  'py-2 px-3 rounded-xl text-xs font-bold border transition-all',
                  weeksCount === n
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                )}
              >
                +{n} tuần
              </button>
            ))}
          </div>
        </div>

        {/* List of target weeks to be created (Group B3) */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1.5 max-h-48 overflow-y-auto">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
            Danh sách các tuần sẽ được tạo bản ghi riêng:
          </div>
          {targetWeeks.map((w, idx) => (
            <div
              key={w.monday}
              className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
            >
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                Tuần {idx + 1}: {formatFullDdMmYyyy(w.monday)} – {formatFullDdMmYyyy(w.sunday)}
              </span>
              {w.hasExistingData ? (
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[10px] font-bold">
                  Đã có TKB
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-semibold">
                  Trống (Sẽ tạo mới)
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Overwrite or Skip selector when target weeks already have data */}
        {existingCount > 0 && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2">
            <div className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Có {existingCount} tuần đã có dữ liệu thời khóa biểu. Bạn muốn xử lý thế nào?
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConflictMode('skip')}
                className={cn(
                  'p-2 rounded-lg text-xs font-bold border text-left',
                  conflictMode === 'skip'
                    ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200'
                    : 'border-slate-200 bg-white dark:bg-slate-900'
                )}
              >
                Bỏ qua tuần đã có dữ liệu (An toàn)
              </button>
              <button
                type="button"
                onClick={() => setConflictMode('overwrite')}
                className={cn(
                  'p-2 rounded-lg text-xs font-bold border text-left',
                  conflictMode === 'overwrite'
                    ? 'border-rose-600 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
                    : 'border-slate-200 bg-white dark:bg-slate-900'
                )}
              >
                Ghi đè tất cả các tuần đã chọn
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2.5 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">
            Hủy
          </button>
          <button onClick={handleApply} className="btn-primary flex-1">
            <Copy size={15} /> Xác nhận áp dụng ({weeksCount} tuần)
          </button>
        </div>
      </div>
    </Modal>
  )
}
