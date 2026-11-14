import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  MapPin,
  Clock,
  Users,
  ChevronRight,
  Pencil,
  Trash2,
  BookOpen,
  Search,
  ClipboardCheck,
  Sparkles,
  CalendarPlus,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { TopBar } from '../components/ui/TopBar'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ColorPicker } from '../components/ui/ColorPicker'
import { EmptyState } from '../components/ui/EmptyState'
import { AddExtraSessionModal } from '../components/schedule/SessionActionModals'
import { formatMoney, getWeekdayName, formatDate } from '../lib/dateUtils'
import { randomClassColor } from '../lib/utils'
import type { Class, ScheduleRule, ExtraSession } from '../types'
import toast from 'react-hot-toast'

// Form for adding/editing a class
function ClassForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: Class
  rules?: ScheduleRule[]
  onSave: (data: any) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name || '')
  const [location, setLocation] = useState(initial?.location || '')
  const [price, setPrice] = useState(initial?.price?.toString() || '')
  const [color, setColor] = useState(initial?.color || randomClassColor())
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Vui lòng nhập tên lớp')
      return
    }
    onSave({
      name: name.trim(),
      location: location.trim(),
      price: parseInt(price) || 0,
      color,
    })
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      <div>
        <label className="label">Tên lớp *</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Vd: Toán 9 - Nhóm 1, Luyện thi 12A..."
          autoFocus
        />
      </div>
      <div>
        <label className="label">Địa điểm học</label>
        <input
          className="input"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Vd: Nhà riêng, Trung tâm Bồi dưỡng..."
        />
      </div>
      <div>
        <label className="label">Học phí / buổi (VNĐ)</label>
        <input
          className="input"
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Vd: 150000"
        />
      </div>
      <div>
        <label className="label">Màu nhận diện lớp</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="flex gap-2.5 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">
          Hủy
        </button>
        <button type="submit" className="btn-primary flex-1">
          {initial ? 'Lưu thay đổi' : 'Thêm lớp mới'}
        </button>
      </div>
    </form>
  )
}

export function ClassesPage() {
  const navigate = useNavigate()
  const {
    classes,
    students,
    scheduleRules,
    extraSessions,
    addClass,
    updateClass,
    deleteClass,
    deleteExtraSession,
  } = useAppStore()
  const [showAdd, setShowAdd] = useState(false)
  const [editClass, setEditClass] = useState<Class | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showExtraModal, setShowExtraModal] = useState(false)
  const [extraPresetClassId, setExtraPresetClassId] = useState<string | undefined>(undefined)
  const [editingExtraSession, setEditingExtraSession] = useState<ExtraSession | null>(null)
  const [deleteExtraId, setDeleteExtraId] = useState<string | null>(null)

  const handleAdd = (data: Omit<Class, 'id' | 'created_at' | 'user_id'>) => {
    addClass(data)
  }
  const handleEdit = (data: any) => {
    if (editClass) updateClass(editClass.id, data)
  }

  const classToDelete = classes.find((c) => c.id === deleteId)

  const filteredClasses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return classes
    return classes.filter((cls) => {
      if (cls.name.toLowerCase().includes(q)) return true
      if (cls.location?.toLowerCase().includes(q)) return true
      const hasMatchingStudent = students.some(
        (s) => s.class_id === cls.id && s.name.toLowerCase().includes(q)
      )
      return hasMatchingStudent
    })
  }, [classes, students, searchQuery])

  const totalActiveStudents = useMemo(
    () => students.filter((s) => s.status !== 'left').length,
    [students]
  )

  return (
    <div className="min-h-screen pb-24 desktop:pb-10">
      <TopBar
        title="Danh sách lớp dạy thêm"
        subtitle={`${classes.length} lớp đang hoạt động · ${totalActiveStudents} học sinh`}
        rightContent={
          <div className="flex items-center gap-2">
            {classes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setEditingExtraSession(null)
                  setExtraPresetClassId(classes[0]?.id)
                  setShowExtraModal(true)
                }}
                className="btn-secondary text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/70 bg-purple-50/70 dark:bg-purple-950/30 hover:bg-purple-100/70"
              >
                <CalendarPlus size={16} />
                <span>Lịch học phát sinh</span>
              </button>
            )}
            <button onClick={() => setShowAdd(true)} className="btn-primary">
              <Plus size={17} /> <span>Thêm lớp</span>
            </button>
          </div>
        }
      />

      <div className="p-4 tablet:p-6 max-w-[1600px] mx-auto flex flex-col gap-5">
        {/* Filter & summary bar */}
        {classes.length > 0 && (
          <div className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Lọc theo tên lớp, địa điểm hoặc tên học sinh..."
                className="input pl-10 py-2 text-sm"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 font-medium">
                Tổng cộng: <strong className="text-slate-800 dark:text-slate-100">{classes.length}</strong> lớp
              </span>
              <span className="px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 font-medium">
                Học sinh: <strong className="text-blue-600 dark:text-blue-400">{totalActiveStudents}</strong> em
              </span>
              <span className="hidden sm:inline-flex px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 font-medium">
                Ca cố định: <strong className="text-orange-600 dark:text-orange-400">{scheduleRules.length}</strong> buổi/tuần
              </span>
            </div>
          </div>
        )}

        {classes.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={44} />}
            title="Chưa có lớp dạy thêm nào"
            description="Tạo lớp học đầu tiên để quản lý danh sách học sinh, lịch cố định hằng tuần, điểm danh và tự động tính học phí."
            action={
              <button onClick={() => setShowAdd(true)} className="btn-primary">
                <Plus size={16} /> Tạo lớp học đầu tiên
              </button>
            }
          />
        ) : filteredClasses.length === 0 ? (
          <EmptyState
            icon={<Search size={40} />}
            title="Không tìm thấy lớp phù hợp"
            description={`Không có lớp hoặc học sinh nào khớp với từ khóa "${searchQuery}".`}
            action={
              <button onClick={() => setSearchQuery('')} className="btn-secondary">
                Xóa bộ lọc
              </button>
            }
          />
        ) : (
          /* Desktop 3-4 column grid (Section 3.3), Mobile 1 column (Section 4.1) */
          <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filteredClasses.map((cls) => {
              const activeClassStudents = students.filter(
                (s) => s.class_id === cls.id && s.status !== 'left'
              )
              const trialCount = activeClassStudents.filter((s) => s.status === 'trial').length
              const rules = scheduleRules
                .filter((r) => r.class_id === cls.id)
                .sort((a, b) => a.weekday - b.weekday)
              const clsExtras = extraSessions
                .filter((e) => e.class_id === cls.id)
                .sort((a, b) => b.date.localeCompare(a.date) || b.start_time.localeCompare(a.start_time))

              return (
                <div
                  key={cls.id}
                  onClick={() => navigate(`/classes/${cls.id}`)}
                  className="card card-interactive group flex flex-col justify-between overflow-hidden"
                >
                  {/* Top color bar */}
                  <div className="h-1.5 w-full" style={{ backgroundColor: cls.color }} />

                  <div className="p-4 tablet:p-5 flex-1 flex flex-col">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 ring-4 ring-slate-100 dark:ring-slate-800"
                          style={{ backgroundColor: cls.color }}
                        />
                        <h3
                          className="font-bold text-base text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
                          title={cls.name}
                        >
                          {cls.name}
                        </h3>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditClass(cls)
                          }}
                          className="btn-icon p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          title="Sửa thông tin lớp"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteId(cls.id)
                          }}
                          className="btn-icon p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                          title="Xóa lớp"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Metadata badges */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        <Users size={13} className="text-blue-500" />
                        {activeClassStudents.length} học sinh
                        {trialCount > 0 && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400">
                            ({trialCount} thử)
                          </span>
                        )}
                      </span>

                      {cls.price > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200/60 dark:border-orange-800/50">
                          {formatMoney(cls.price)}/buổi
                        </span>
                      )}
                    </div>

                    {cls.location && (
                      <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                        <MapPin size={13} className="shrink-0 text-slate-400" />
                        <span className="truncate" title={cls.location}>
                          {cls.location}
                        </span>
                      </div>
                    )}

                    {/* Schedule chips */}
                    <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex-1 space-y-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                          Lịch học cố định
                        </div>
                        {rules.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">Chưa đặt lịch cố định</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {rules.map((r) => (
                              <span
                                key={r.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-orange-50/90 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 border border-orange-200/60 dark:border-orange-800/40"
                              >
                                <Clock size={11} />
                                {getWeekdayName(r.weekday)} · {r.start_time}–{r.end_time}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Extra Sessions (Lịch học phát sinh) */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="pt-2.5 border-t border-dashed border-slate-200/80 dark:border-slate-800"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1">
                            <Sparkles size={11} />
                            Lịch học phát sinh ({clsExtras.length})
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingExtraSession(null)
                              setExtraPresetClassId(cls.id)
                              setShowExtraModal(true)
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-950/70 border border-purple-200/70 dark:border-purple-800/60 transition-colors"
                          >
                            <Plus size={11} /> Thêm buổi
                          </button>
                        </div>

                        {clsExtras.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">Chưa có buổi phát sinh</p>
                        ) : (
                          <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-0.5">
                            {clsExtras.slice(0, 4).map((ex) => {
                              const effectivePrice =
                                ex.custom_price != null ? ex.custom_price : cls.price
                              return (
                                <div
                                  key={ex.id}
                                  className="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg bg-purple-50/70 dark:bg-purple-950/25 border border-purple-200/60 dark:border-purple-800/40 text-xs"
                                >
                                  <div
                                    onClick={() =>
                                      navigate(
                                        `/classes/${cls.id}?tab=attendance&session=${encodeURIComponent(`${ex.date}|${ex.start_time}`)}`
                                      )
                                    }
                                    className="min-w-0 flex-1 cursor-pointer"
                                    title="Bấm để điểm danh buổi phát sinh này"
                                  >
                                    <div className="font-semibold text-purple-900 dark:text-purple-200 truncate">
                                      {formatDate(ex.date)} · {ex.start_time}–{ex.end_time}
                                    </div>
                                    <div className="text-[11px] text-purple-700/90 dark:text-purple-300/80 truncate">
                                      {formatMoney(effectivePrice)}/buổi
                                      {ex.custom_price != null ? ' (giá riêng)' : ' (mặc định)'}
                                      {ex.note ? ` · ${ex.note}` : ''}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingExtraSession(ex)
                                        setExtraPresetClassId(cls.id)
                                        setShowExtraModal(true)
                                      }}
                                      className="p-1 rounded hover:bg-purple-100 dark:hover:bg-purple-900/50 text-slate-500 hover:text-purple-700 dark:text-slate-400 dark:hover:text-purple-200"
                                      title="Sửa buổi phát sinh"
                                    >
                                      <Pencil size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteExtraId(ex.id)}
                                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/40 text-slate-400 hover:text-red-600"
                                      title="Xóa buổi phát sinh"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                            {clsExtras.length > 4 && (
                              <button
                                type="button"
                                onClick={() => navigate(`/classes/${cls.id}?tab=schedule`)}
                                className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold text-left hover:underline"
                              >
                                Xem tất cả {clsExtras.length} buổi phát sinh →
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Quick Actions */}
                  <div className="px-4 py-2.5 bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/classes/${cls.id}?tab=attendance`)
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline py-1"
                    >
                      <ClipboardCheck size={14} />
                      Điểm danh nhanh
                    </button>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 group-hover:translate-x-0.5 transition-transform">
                      Chi tiết <ChevronRight size={14} />
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Thêm lớp dạy thêm mới">
        <ClassForm onSave={handleAdd} onClose={() => setShowAdd(false)} />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editClass} onClose={() => setEditClass(null)} title="Sửa thông tin lớp">
        {editClass && (
          <ClassForm
            initial={editClass}
            onSave={handleEdit}
            onClose={() => setEditClass(null)}
          />
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteClass(deleteId)}
        title="Xóa lớp học"
        message={`Bạn có chắc muốn xóa lớp "${classToDelete?.name}"? Toàn bộ học sinh và dữ liệu điểm danh của lớp này sẽ bị xóa.`}
        confirmLabel="Xóa lớp"
      />

      {/* Add / Edit Extra Session Modal */}
      <AddExtraSessionModal
        open={showExtraModal}
        onClose={() => {
          setShowExtraModal(false)
          setEditingExtraSession(null)
        }}
        presetClassId={extraPresetClassId}
        editSession={editingExtraSession}
      />

      {/* Delete Extra Session Confirm */}
      <ConfirmDialog
        open={!!deleteExtraId}
        onClose={() => setDeleteExtraId(null)}
        onConfirm={() => {
          if (deleteExtraId) {
            deleteExtraSession(deleteExtraId)
            toast.success('Đã xóa buổi học phát sinh')
          }
          setDeleteExtraId(null)
        }}
        title="Xóa buổi học phát sinh"
        message="Bạn có chắc muốn xóa buổi học phát sinh này? Dữ liệu điểm danh của buổi phát sinh này cũng sẽ được gỡ bỏ."
        confirmLabel="Xóa buổi phát sinh"
      />
    </div>
  )
}
