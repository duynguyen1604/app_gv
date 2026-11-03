import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Trash2, Pencil, Phone, MessageSquare, ChevronDown, ChevronUp, BookOpen, Users, Clock, CalendarDays, CheckCheck, ClipboardList } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { TopBar } from '../components/ui/TopBar'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { formatMoney, formatDate, formatFullDate, dateToStr, getDaysInMonth, formatDateShort, getWeekdayName, dateToWeekday, formatTime } from '../lib/dateUtils'
import { studentStatusLabel, studentStatusColor, cn, formatPhoneTel } from '../lib/utils'
import type { Student, AttendanceStatus, ScheduleRule } from '../types'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'

// Student form modal
function StudentForm({ 
  initial, classId, onSave, onClose 
}: { initial?: Student, classId: string, onSave: (data: any) => void, onClose: () => void }) {
  const [name, setName] = useState(initial?.name || '')
  const [parentName, setParentName] = useState(initial?.parent_name || '')
  const [parentPhone, setParentPhone] = useState(initial?.parent_phone || '')
  const [customPrice, setCustomPrice] = useState(initial?.custom_price?.toString() || '')
  const [status, setStatus] = useState(initial?.status || 'active')
  const [note, setNote] = useState(initial?.note || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      class_id: classId,
      name: name.trim(),
      parent_name: parentName.trim() || null,
      parent_phone: parentPhone.trim() || null,
      custom_price: customPrice ? parseInt(customPrice) : null,
      status,
      note: note.trim() || null,
    })
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="label">Tên học sinh *</label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Họ và tên" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Tên phụ huynh</label>
          <input className="input" value={parentName} onChange={e => setParentName(e.target.value)} placeholder="Tên phụ huynh" />
        </div>
        <div>
          <label className="label">Số điện thoại</label>
          <input className="input" type="tel" value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="0912..." />
        </div>
      </div>
      <div>
        <label className="label">Giá riêng/buổi (để trống = giá của lớp)</label>
        <input className="input" type="number" value={customPrice} onChange={e => setCustomPrice(e.target.value)} placeholder="VNĐ" />
      </div>
      <div>
        <label className="label">Trạng thái</label>
        <select className="input" value={status} onChange={e => setStatus(e.target.value as any)}>
          <option value="active">Đang học</option>
          <option value="trial">Học thử</option>
          <option value="left">Đã nghỉ</option>
        </select>
      </div>
      <div>
        <label className="label">Ghi chú</label>
        <textarea className="input" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú thêm..." />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Hủy</button>
        <button type="submit" className="btn-primary flex-1">{initial ? 'Lưu' : 'Thêm học sinh'}</button>
      </div>
    </form>
  )
}

// Bulk add students form
function BulkAddForm({ classId, onClose }: { classId: string, onClose: () => void }) {
  const { addStudentsBulk } = useAppStore()
  const [text, setText] = useState('')
  
  const handleSubmit = () => {
    const names = text.split('\n').filter(n => n.trim())
    if (names.length > 0) {
      addStudentsBulk(classId, names)
      onClose()
    }
  }

  const count = text.split('\n').filter(n => n.trim()).length

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">Dán danh sách tên, mỗi tên một dòng:</p>
      <textarea
        className="input font-mono"
        rows={8}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={"Nguyễn Văn A\nTrần Thị B\nLê Văn C"}
      />
      {count > 0 && <p className="text-sm text-blue-600 dark:text-blue-400">Sẽ thêm {count} học sinh</p>}
      <div className="flex gap-2">
        <button onClick={onClose} className="btn-secondary flex-1">Hủy</button>
        <button onClick={handleSubmit} disabled={count === 0} className="btn-primary flex-1">
          Thêm {count > 0 ? count : ''} học sinh
        </button>
      </div>
    </div>
  )
}

// Schedule rule form
function ScheduleRuleForm({ 
  classId, initial, onSave, onClose 
}: { classId: string, initial?: ScheduleRule, onSave: (data: any) => void, onClose: () => void }) {
  const [weekday, setWeekday] = useState(initial?.weekday?.toString() || '2')
  const [startTime, setStartTime] = useState(initial?.start_time || '08:00')
  const [endTime, setEndTime] = useState(initial?.end_time || '10:00')
  const [validFrom, setValidFrom] = useState(initial?.valid_from || format(new Date(), 'yyyy-MM-dd'))
  const [validTo, setValidTo] = useState(initial?.valid_to || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      class_id: classId,
      weekday: parseInt(weekday),
      start_time: startTime,
      end_time: endTime,
      valid_from: validFrom,
      valid_to: validTo || null,
    })
    onClose()
  }

  const weekdays = [
    {val:'2',label:'Thứ 2'},{val:'3',label:'Thứ 3'},{val:'4',label:'Thứ 4'},
    {val:'5',label:'Thứ 5'},{val:'6',label:'Thứ 6'},{val:'7',label:'Thứ 7'},
    {val:'1',label:'Chủ nhật'}
  ]

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="label">Thứ trong tuần</label>
        <select className="input" value={weekday} onChange={e => setWeekday(e.target.value)}>
          {weekdays.map(d => <option key={d.val} value={d.val}>{d.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Giờ bắt đầu</label>
          <input className="input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
        </div>
        <div>
          <label className="label">Giờ kết thúc</label>
          <input className="input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Từ ngày</label>
          <input className="input" type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Đến ngày (để trống = không giới hạn)</label>
          <input className="input" type="date" value={validTo} onChange={e => setValidTo(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Hủy</button>
        <button type="submit" className="btn-primary flex-1">{initial ? 'Lưu' : 'Thêm lịch'}</button>
      </div>
    </form>
  )
}

// Attendance tab
function AttendanceTab({ classId }: { classId: string }) {
  const { students, scheduleRules, extraSessions, sessionExceptions, attendance, setAttendance, removeAttendance, sessionNotes, setSessionNote } = useAppStore()
  
  const activeStudents = students.filter(s => s.class_id === classId && s.status !== 'left')
  
  // Get all sessions for this class (last 30 days + future)
  const today = new Date()
  const sessions = useMemo(() => {
    const result: { date: string, start_time: string, end_time: string, label: string }[] = []
    const fromDate = new Date(today)
    fromDate.setDate(fromDate.getDate() - 30)
    
    // From schedule rules
    for (let d = new Date(fromDate); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = format(d, 'yyyy-MM-dd')
      const weekday = d.getDay() === 0 ? 7 : d.getDay() // 1=Mon
      const applicable = scheduleRules.filter(r => 
        r.class_id === classId && 
        r.weekday === weekday &&
        r.valid_from <= dateStr &&
        (!r.valid_to || r.valid_to >= dateStr)
      )
      for (const rule of applicable) {
        // Check if cancelled or moved away
        const exception = sessionExceptions.find(e => e.rule_id === rule.id && e.original_date === dateStr)
        if (exception?.action === 'cancelled') continue
        if (exception?.action === 'moved') continue
        result.push({
          date: dateStr,
          start_time: rule.start_time,
          end_time: rule.end_time,
          label: `${getWeekdayName(weekday)}, ${formatDateShort(dateStr)}`
        })
      }
    }
    
    // From extra sessions
    extraSessions.filter(e => e.class_id === classId && e.date >= format(fromDate, 'yyyy-MM-dd') && e.date <= format(today, 'yyyy-MM-dd')).forEach(e => {
      result.push({
        date: e.date,
        start_time: e.start_time,
        end_time: e.end_time,
        label: `Phát sinh: ${formatDateShort(e.date)}`
      })
    })
    
    // From moved exceptions (new location)
    sessionExceptions.filter(e => {
      const rule = scheduleRules.find(r => r.id === e.rule_id && r.class_id === classId)
      return rule && e.action === 'moved' && e.new_date && e.new_date >= format(fromDate, 'yyyy-MM-dd') && e.new_date <= format(today, 'yyyy-MM-dd')
    }).forEach(e => {
      if (e.new_date && e.new_start && e.new_end) {
        result.push({
          date: e.new_date,
          start_time: e.new_start,
          end_time: e.new_end,
          label: `Dời: ${formatDateShort(e.new_date)}`
        })
      }
    })
    
    return result.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date)
      return b.start_time.localeCompare(a.start_time)
    })
  }, [classId, scheduleRules, extraSessions, sessionExceptions])

  type SessionItem = { date: string, start_time: string, end_time: string, label: string }
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(() => sessions[0] || null)
  const [noteContent, setNoteContent] = useState('')
  const [showNote, setShowNote] = useState(false)

  const sessionKey = selectedSession ? `${selectedSession.date}-T-${selectedSession.start_time}` : ''

  const currentAttendance = useMemo(() => {
    if (!selectedSession) return {}
    const att: Record<string, AttendanceStatus | undefined> = {}
    attendance.filter(a => a.class_id === classId && a.date === selectedSession.date && a.start_time === selectedSession.start_time)
      .forEach(a => { att[a.student_id] = a.status })
    return att
  }, [attendance, classId, selectedSession])

  const handleAttend = (studentId: string, status: AttendanceStatus) => {
    if (!selectedSession) return
    const current = currentAttendance[studentId]
    if (current === status) {
      removeAttendance(classId, selectedSession.date, selectedSession.start_time, studentId)
    } else {
      setAttendance(classId, selectedSession.date, selectedSession.start_time, studentId, status)
    }
  }

  const handleAllPresent = () => {
    if (!selectedSession) return
    activeStudents.forEach(s => {
      setAttendance(classId, selectedSession.date, selectedSession.start_time, s.id, 'present')
    })
  }

  const presentCount = Object.values(currentAttendance).filter(s => s === 'present').length
  const absentCount = Object.values(currentAttendance).filter(s => s === 'absent' || s === 'excused').length

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList size={48} />}
        title="Chưa có buổi nào"
        description="Thêm lịch học hoặc buổi phát sinh để điểm danh"
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Session selector */}
      <div>
        <label className="label">Chọn buổi</label>
        <select
          className="input"
          value={sessionKey}
          onChange={e => {
            const val = e.target.value
            const sepIdx = val.indexOf('-T-')
            const date = val.substring(0, sepIdx)
            const start_time = val.substring(sepIdx + 3)
            const sess = sessions.find(s => s.date === date && s.start_time === start_time)
            setSelectedSession(sess || null)
          }}
        >
          {sessions.map(s => (
            <option key={`${s.date}-T-${s.start_time}`} value={`${s.date}-T-${s.start_time}`}>
              {s.label} ({s.start_time}–{s.end_time})
            </option>
          ))}
        </select>
      </div>

      {selectedSession && (
        <>
          {/* Stats: 2 statuses (Có mặt & Vắng) */}
          <div className="flex gap-2">
            <div className="flex-1 bg-green-50 dark:bg-green-900/20 rounded-lg p-2.5 text-center">
              <div className="text-xl font-bold text-green-700 dark:text-green-400">{presentCount}</div>
              <div className="text-xs font-medium text-green-600 dark:text-green-500">Có mặt</div>
            </div>
            <div className="flex-1 bg-red-50 dark:bg-red-900/20 rounded-lg p-2.5 text-center">
              <div className="text-xl font-bold text-red-700 dark:text-red-400">{absentCount}</div>
              <div className="text-xs font-medium text-red-600 dark:text-red-500">Vắng</div>
            </div>
          </div>

          {/* All present button */}
          <button onClick={handleAllPresent} className="btn-secondary w-full">
            <CheckCheck size={16} /> Tất cả có mặt
          </button>

          {/* Student list */}
          <div className="flex flex-col gap-2">
            {activeStudents.map(student => {
              const status = currentAttendance[student.id]
              return (
                <div key={student.id} className="card p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-sm text-gray-900 dark:text-white flex-1">{student.name}</span>
                    {status && (
                      <span className={cn(
                        'badge text-xs font-semibold',
                        status === 'present'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      )}>
                        {status === 'present' ? '✓ Có mặt' : '✗ Vắng'}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAttend(student.id, 'present')}
                      className={cn('attend-btn attend-present', status === 'present' && 'active')}
                    >
                      ✓ Có mặt
                    </button>
                    <button
                      onClick={() => handleAttend(student.id, 'absent')}
                      className={cn('attend-btn attend-absent', (status === 'absent' || status === 'excused') && 'active')}
                    >
                      ✗ Vắng
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Session note */}
          <div className="card p-4">
            <button
              onClick={() => setShowNote(!showNote)}
              className="flex items-center justify-between w-full"
            >
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">📝 Nội dung buổi học</span>
              {showNote ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showNote && (
              <div className="mt-3">
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Hôm nay dạy gì, giao bài gì..."
                  defaultValue={sessionNotes.find(n => n.class_id === classId && n.date === selectedSession.date && n.start_time === selectedSession.start_time)?.content || ''}
                  onBlur={e => setSessionNote(classId, selectedSession.date, selectedSession.start_time, e.target.value)}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function ClassDetailPage() {
  const { classId } = useParams<{ classId: string }>()
  const navigate = useNavigate()
  const { classes, students, scheduleRules, addStudent, updateStudent, deleteStudent, addScheduleRule, updateScheduleRule, deleteScheduleRule } = useAppStore()
  
  const cls = classes.find(c => c.id === classId)
  const [activeTab, setActiveTab] = useState<'students' | 'schedule' | 'attendance'>('students')
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [showBulkAdd, setShowBulkAdd] = useState(false)
  const [editStudent, setEditStudent] = useState<Student | null>(null)
  const [deleteStudentId, setDeleteStudentId] = useState<string | null>(null)
  const [showAddRule, setShowAddRule] = useState(false)
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null)

  if (!cls || !classId) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>Không tìm thấy lớp này.</p>
        <button onClick={() => navigate('/classes')} className="btn-primary mt-4">Quay lại</button>
      </div>
    )
  }

  const classStudents = students.filter(s => s.class_id === classId)
  const activeStudents = classStudents.filter(s => s.status !== 'left')
  const leftStudents = classStudents.filter(s => s.status === 'left')
  const rules = scheduleRules.filter(r => r.class_id === classId)

  const TABS = [
    { key: 'students', label: 'Học sinh', count: activeStudents.length },
    { key: 'schedule', label: 'Lịch học', count: rules.length },
    { key: 'attendance', label: 'Điểm danh', count: null },
  ]

  return (
    <div className="min-h-screen pb-24">
      <TopBar
        title={cls.name}
        subtitle={[cls.location, cls.price > 0 ? formatMoney(cls.price) + '/buổi' : ''].filter(Boolean).join(' · ')}
        back
        rightContent={
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cls.color }} />
        }
      />

      {/* Tabs */}
      <div className="sticky top-[57px] z-20 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="flex">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={cn(
                'flex-1 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-500'
              )}
            >
              {tab.label}{tab.count !== null ? ` (${tab.count})` : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {/* Students tab */}
        {activeTab === 'students' && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <button onClick={() => setShowAddStudent(true)} className="btn-primary flex-1">
                <Plus size={16} /> Thêm học sinh
              </button>
              <button onClick={() => setShowBulkAdd(true)} className="btn-secondary">
                Dán danh sách
              </button>
            </div>

            {classStudents.length === 0 ? (
              <EmptyState
                icon={<Users size={48} />}
                title="Chưa có học sinh nào"
                description="Thêm học sinh vào lớp này"
              />
            ) : (
              <>
                {activeStudents.map(student => (
                  <div key={student.id} className="card p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                          {student.name.charAt(student.name.lastIndexOf(' ') + 1) || student.name[0]}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-gray-900 dark:text-white">{student.name}</span>
                          <span className={cn('badge', studentStatusColor(student.status))}>
                            {studentStatusLabel(student.status)}
                          </span>
                          {student.custom_price && (
                            <span className="badge bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                              {formatMoney(student.custom_price)}/buổi
                            </span>
                          )}
                        </div>
                        {student.parent_name && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            PH: {student.parent_name}
                          </p>
                        )}
                        {student.parent_phone && (
                          <div className="flex gap-2 mt-1.5">
                            <a href={formatPhoneTel(student.parent_phone)} className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                              <Phone size={11} /> {student.parent_phone}
                            </a>
                          </div>
                        )}
                        {student.note && (
                          <p className="text-xs text-gray-400 dark:text-gray-600 mt-1 italic">{student.note}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setEditStudent(student)} className="btn-icon text-gray-400"><Pencil size={14} /></button>
                        <button onClick={() => setDeleteStudentId(student.id)} className="btn-icon text-red-400"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </div>
                ))}

                {leftStudents.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-400 mb-2 px-1">Đã nghỉ ({leftStudents.length})</p>
                    {leftStudents.map(student => (
                      <div key={student.id} className="card p-3 opacity-50 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">{student.name}</span>
                          <button onClick={() => setEditStudent(student)} className="btn-icon text-gray-400"><Pencil size={14} /></button>
                          <button onClick={() => setDeleteStudentId(student.id)} className="btn-icon text-red-400"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Schedule tab */}
        {activeTab === 'schedule' && (
          <div className="flex flex-col gap-3">
            <button onClick={() => setShowAddRule(true)} className="btn-primary">
              <Plus size={16} /> Thêm lịch học cố định
            </button>
            {rules.length === 0 ? (
              <EmptyState
                icon={<Clock size={48} />}
                title="Chưa có lịch cố định"
                description="Thêm lịch học hằng tuần cho lớp này"
              />
            ) : (
              rules.map(rule => (
                <div key={rule.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm text-gray-900 dark:text-white">
                        {getWeekdayName(rule.weekday, true)} · {rule.start_time}–{rule.end_time}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Từ {formatDate(rule.valid_from)}{rule.valid_to ? ' đến ' + formatDate(rule.valid_to) : ' (không giới hạn)'}
                      </div>
                    </div>
                    <button onClick={() => setDeleteRuleId(rule.id)} className="btn-icon text-red-400">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Attendance tab */}
        {activeTab === 'attendance' && (
          <AttendanceTab classId={classId} />
        )}
      </div>

      {/* Modals */}
      <Modal open={showAddStudent} onClose={() => setShowAddStudent(false)} title="Thêm học sinh">
        <StudentForm classId={classId} onSave={addStudent} onClose={() => setShowAddStudent(false)} />
      </Modal>

      <Modal open={showBulkAdd} onClose={() => setShowBulkAdd(false)} title="Dán danh sách học sinh">
        <BulkAddForm classId={classId} onClose={() => setShowBulkAdd(false)} />
      </Modal>

      <Modal open={!!editStudent} onClose={() => setEditStudent(null)} title="Sửa thông tin học sinh">
        {editStudent && (
          <StudentForm
            classId={classId}
            initial={editStudent}
            onSave={data => updateStudent(editStudent.id, data)}
            onClose={() => setEditStudent(null)}
          />
        )}
      </Modal>

      <Modal open={showAddRule} onClose={() => setShowAddRule(false)} title="Thêm lịch học cố định">
        <ScheduleRuleForm
          classId={classId}
          onSave={addScheduleRule}
          onClose={() => setShowAddRule(false)}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleteStudentId}
        onClose={() => setDeleteStudentId(null)}
        onConfirm={() => deleteStudentId && deleteStudent(deleteStudentId)}
        title="Xóa học sinh"
        message="Bạn có chắc muốn xóa học sinh này? Dữ liệu điểm danh sẽ bị xóa."
        confirmLabel="Xóa"
      />

      <ConfirmDialog
        open={!!deleteRuleId}
        onClose={() => setDeleteRuleId(null)}
        onConfirm={() => deleteRuleId && deleteScheduleRule(deleteRuleId)}
        title="Xóa lịch học"
        message="Xóa lịch học cố định này? Các exception đã tạo vẫn được giữ lại."
        confirmLabel="Xóa lịch"
      />
    </div>
  )
}
