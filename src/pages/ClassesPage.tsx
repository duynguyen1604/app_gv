import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, MapPin, Clock, Users, ChevronRight, Pencil, Trash2, BookOpen } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { TopBar } from '../components/ui/TopBar'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ColorPicker } from '../components/ui/ColorPicker'
import { EmptyState } from '../components/ui/EmptyState'
import { formatMoney, getWeekdayName } from '../lib/dateUtils'
import { randomClassColor, cn } from '../lib/utils'
import type { Class, ScheduleRule } from '../types'

// Form for adding/editing a class
function ClassForm({ 
  initial, 
  rules, 
  onSave, 
  onClose 
}: { 
  initial?: Class, 
  rules?: ScheduleRule[],
  onSave: (data: any) => void, 
  onClose: () => void 
}) {
  const [name, setName] = useState(initial?.name || '')
  const [location, setLocation] = useState(initial?.location || '')
  const [price, setPrice] = useState(initial?.price?.toString() || '')
  const [color, setColor] = useState(initial?.color || randomClassColor())
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Vui lòng nhập tên lớp'); return }
    onSave({ name: name.trim(), location: location.trim(), price: parseInt(price) || 0, color })
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div>
        <label className="label">Tên lớp *</label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Vd: Lớp 10A, Toán 9..." />
      </div>
      <div>
        <label className="label">Địa điểm</label>
        <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Vd: Nhà riêng, Trung tâm ABC..." />
      </div>
      <div>
        <label className="label">Giá/buổi (VNĐ)</label>
        <input className="input" type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="Vd: 150000" />
      </div>
      <div>
        <label className="label">Màu sắc</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Hủy</button>
        <button type="submit" className="btn-primary flex-1">{initial ? 'Lưu thay đổi' : 'Thêm lớp'}</button>
      </div>
    </form>
  )
}

export function ClassesPage() {
  const navigate = useNavigate()
  const { classes, students, scheduleRules, addClass, updateClass, deleteClass } = useAppStore()
  const [showAdd, setShowAdd] = useState(false)
  const [editClass, setEditClass] = useState<Class | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleAdd = (data: Omit<Class, 'id' | 'created_at' | 'user_id'>) => {
    addClass(data)
  }
  const handleEdit = (data: any) => {
    if (editClass) updateClass(editClass.id, data)
  }

  const classToDelete = classes.find(c => c.id === deleteId)

  return (
    <div className="min-h-screen pb-24">
      <TopBar
        title="Danh sách lớp"
        rightContent={
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus size={16} /> Thêm lớp
          </button>
        }
      />

      <div className="p-4">
        {classes.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={56} />}
            title="Chưa có lớp nào"
            description="Thêm lớp dạy thêm đầu tiên của bạn"
            action={
              <button onClick={() => setShowAdd(true)} className="btn-primary">
                <Plus size={16} /> Thêm lớp
              </button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {classes.map(cls => {
              const studentCount = students.filter(s => s.class_id === cls.id && s.status !== 'left').length
              const rules = scheduleRules.filter(r => r.class_id === cls.id)
              return (
                <div
                  key={cls.id}
                  className="card p-4 active:bg-gray-50 dark:active:bg-gray-800/50 cursor-pointer"
                  onClick={() => navigate(`/classes/${cls.id}`)}
                >
                  <div className="flex items-start gap-3">
                    {/* Color dot */}
                    <div className="mt-0.5 w-3 h-3 rounded-full shrink-0 mt-2" style={{ backgroundColor: cls.color }} />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">{cls.name}</h3>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={e => { e.stopPropagation(); setEditClass(cls) }}
                            className="btn-icon text-gray-400"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteId(cls.id) }}
                            className="btn-icon text-red-400"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                        {cls.location && (
                          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <MapPin size={12} /> {cls.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Users size={12} /> {studentCount} học sinh
                        </span>
                        {cls.price > 0 && (
                          <span className="text-xs font-medium text-orange-600 dark:text-orange-400">
                            {formatMoney(cls.price)}/buổi
                          </span>
                        )}
                      </div>

                      {rules.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {rules.map(r => (
                            <span key={r.id} className="badge bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                              <Clock size={10} className="mr-0.5" />
                              {getWeekdayName(r.weekday)} {r.start_time}–{r.end_time}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <ChevronRight size={18} className="text-gray-300 dark:text-gray-600 shrink-0 mt-1" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Thêm lớp mới">
        <ClassForm onSave={handleAdd} onClose={() => setShowAdd(false)} />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editClass} onClose={() => setEditClass(null)} title="Sửa thông tin lớp">
        {editClass && (
          <ClassForm initial={editClass} onSave={handleEdit} onClose={() => setEditClass(null)} />
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteClass(deleteId)}
        title="Xóa lớp"
        message={`Bạn có chắc muốn xóa lớp "${classToDelete?.name}"? Toàn bộ học sinh và dữ liệu điểm danh sẽ bị xóa.`}
        confirmLabel="Xóa lớp"
      />
    </div>
  )
}
