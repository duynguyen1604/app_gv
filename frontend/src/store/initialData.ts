import type {
  Class,
  Student,
  ScheduleRule,
  SchoolSchedule,
  SchoolPeriod,
  Holiday,
  StudentEnrollment,
  StudentStatusHistory,
} from '../types'
import { addDaysToDateStr, DEFAULT_SCHOOL_PERIODS, getMondayOfDateStr } from '../lib/schoolPeriods'

export const INITIAL_SCHOOL_PERIODS: SchoolPeriod[] = DEFAULT_SCHOOL_PERIODS

export const DATA_SEED_VERSION = '2026-van-schedule-v1'

const CURRENT_MONDAY = getMondayOfDateStr(new Date().toISOString().slice(0, 10))
const NOW_ISO = new Date().toISOString()

export const INITIAL_CLASSES: Class[] = [
  {
    id: 'cls-1',
    name: 'Văn 12 onl (Thùy)',
    location: 'Online',
    price: 150000,
    color: '#3B82F6', // Blue
    created_at: NOW_ISO,
    user_id: 'local',
  },
  {
    id: 'cls-2',
    name: 'Văn 9 off 2hs',
    location: 'Trực tiếp (Offline)',
    price: 150000,
    color: '#EC4899', // Pink
    created_at: NOW_ISO,
    user_id: 'local',
  },
  {
    id: 'cls-3',
    name: 'Văn 7V1',
    location: 'Phòng học Văn 7V1',
    price: 150000,
    color: '#8B5CF6', // Purple
    created_at: NOW_ISO,
    user_id: 'local',
  },
  {
    id: 'cls-4',
    name: 'Văn 9 onl',
    location: 'Online',
    price: 150000,
    color: '#F59E0B', // Amber
    created_at: NOW_ISO,
    user_id: 'local',
  },
  {
    id: 'cls-5',
    name: 'Văn 7 Bảo',
    location: 'Kèm Văn 7 (Bảo)',
    price: 150000,
    color: '#10B981', // Emerald Green
    created_at: NOW_ISO,
    user_id: 'local',
  },
  {
    id: 'cls-6',
    name: 'Văn 9V1',
    location: 'Phòng học Văn 9V1',
    price: 150000,
    color: '#F43F5E', // Rose
    created_at: NOW_ISO,
    user_id: 'local',
  },
  {
    id: 'cls-7',
    name: 'Văn 8, V6',
    location: 'Phòng học Văn 8, V6',
    price: 150000,
    color: '#F97316', // Orange
    created_at: NOW_ISO,
    user_id: 'local',
  },
  {
    id: 'cls-8',
    name: 'Văn 12V1 Trang',
    location: 'Kèm Văn 12V1 (Trang)',
    price: 150000,
    color: '#06B6D4', // Cyan
    created_at: NOW_ISO,
    user_id: 'local',
  },
  {
    id: 'cls-9',
    name: 'TV 5 Bảo Anh',
    location: 'Kèm Tiếng Việt 5 (Bảo Anh)',
    price: 150000,
    color: '#6366F1', // Indigo
    created_at: NOW_ISO,
    user_id: 'local',
  },
  {
    id: 'cls-10',
    name: 'Văn 6V1; V7; TV2',
    location: 'Ca ghép Văn 6V1; V7; TV2',
    price: 150000,
    color: '#EAB308', // Yellow
    created_at: NOW_ISO,
    user_id: 'local',
  },
  {
    id: 'cls-11',
    name: 'Văn 12; V9',
    location: 'Ca ghép Văn 12; V9',
    price: 150000,
    color: '#0EA5E9', // Sky Blue
    created_at: NOW_ISO,
    user_id: 'local',
  },
  {
    id: 'cls-12',
    name: 'TV5 Hiển',
    location: 'Kèm Tiếng Việt 5 (Hiển)',
    price: 150000,
    color: '#14B8A6', // Teal
    created_at: NOW_ISO,
    user_id: 'local',
  },
  {
    id: 'cls-13',
    name: 'Văn 7V2',
    location: 'Phòng học Văn 7V2',
    price: 150000,
    color: '#A855F7', // Violet
    created_at: NOW_ISO,
    user_id: 'local',
  },
  {
    id: 'cls-14',
    name: 'Văn 8',
    location: 'Phòng học Văn 8',
    price: 150000,
    color: '#EA580C', // Deep Orange
    created_at: NOW_ISO,
    user_id: 'local',
  },
]

export const INITIAL_STUDENTS: Student[] = [
  {
    id: 'st-1',
    class_id: 'cls-1',
    name: 'Thùy',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'Văn 12 onl (T2 19h-20h30, T7 15h30-17h)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-2',
    class_id: 'cls-2',
    name: 'Học sinh 1 (Văn 9 off)',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'Lớp Văn 9 off 2hs (T3 16h-18h)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-3',
    class_id: 'cls-2',
    name: 'Học sinh 2 (Văn 9 off)',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'Lớp Văn 9 off 2hs (T3 16h-18h)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-4',
    class_id: 'cls-3',
    name: 'Học sinh Văn 7V1',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'Ca 2 Tối T3 (19h-20h30)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-5',
    class_id: 'cls-4',
    name: 'Học sinh Văn 9 onl',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'T4 (19h-20h30) & T7 (13h30-15h)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-6',
    class_id: 'cls-5',
    name: 'Bảo',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'Văn 7 Bảo - T5 Ca 1 (13h30-15h30)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-7',
    class_id: 'cls-6',
    name: 'Học sinh Văn 9V1',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'T5 Ca 2 (16h-18h)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-8',
    class_id: 'cls-7',
    name: 'Nhóm Văn 8',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'T5 Ca 3 Tối (18h30-20h)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-9',
    class_id: 'cls-7',
    name: 'Nhóm Văn 6',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'T5 Ca 3 Tối (18h30-20h)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-10',
    class_id: 'cls-8',
    name: 'Trang',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'Văn 12V1 Trang - T5 Ca 4 Tối (20h-21h30)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-11',
    class_id: 'cls-9',
    name: 'Bảo Anh',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'TV 5 Bảo Anh - T6 Tối (18h30-20h)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-12',
    class_id: 'cls-10',
    name: 'Nhóm Văn 6V1',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'T7 Sáng Ca 1 (9h-10h30)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-13',
    class_id: 'cls-10',
    name: 'Nhóm V7',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'T7 Sáng Ca 1 (9h-10h30)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-14',
    class_id: 'cls-10',
    name: 'Nhóm TV2',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'T7 Sáng Ca 1 (9h-10h30)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-15',
    class_id: 'cls-11',
    name: 'Nhóm Văn 12',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'T7 Tối Ca 4 (19h-21h)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-16',
    class_id: 'cls-11',
    name: 'Nhóm V9',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'T7 Tối Ca 4 (19h-21h)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-17',
    class_id: 'cls-12',
    name: 'Hiển',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'TV5 Hiển - CN Sáng Ca 1 (8h-10h)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-18',
    class_id: 'cls-13',
    name: 'Học sinh Văn 7V2',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'CN Chiều Ca 2 (13h-14h30)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
  {
    id: 'st-19',
    class_id: 'cls-14',
    name: 'Học sinh Văn 8',
    parent_name: null,
    parent_phone: null,
    custom_price: null,
    status: 'active',
    note: 'CN Chiều Ca 3 (15h-16h30)',
    start_date: '2026-09-01',
    created_at: NOW_ISO,
  },
]

export const INITIAL_STUDENT_ENROLLMENTS: StudentEnrollment[] = INITIAL_STUDENTS.map((s) => ({
  id: `enr-init-${s.id}`,
  student_id: s.id,
  class_id: s.class_id,
  kind: 'primary',
  schedule_rule_ids: null,
  price_override: s.custom_price,
  from_date: s.start_date || '2026-09-01',
  to_date: null,
  note: null,
  created_at: s.created_at,
  user_id: 'local',
}))

export const INITIAL_STUDENT_STATUS_HISTORY: StudentStatusHistory[] = INITIAL_STUDENTS.map((s) => ({
  id: `ssh-init-${s.id}`,
  student_id: s.id,
  enrollment_id: `enr-init-${s.id}`,
  status: s.status,
  effective_from: s.start_date || '2026-09-01',
  note: 'Trạng thái ban đầu',
  created_at: s.created_at,
  user_id: 'local',
}))

export const INITIAL_SCHEDULE_RULES: ScheduleRule[] = [
  // T2: Tối (19h - 20h30) Văn 12 onl (Thùy)
  {
    id: 'rule-1',
    class_id: 'cls-1',
    weekday: 1, // Thứ 2
    start_time: '19:00',
    end_time: '20:30',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // T7: Chiều Ca 3 (15h30 - 17h) Văn 12 onl (Thùy)
  {
    id: 'rule-2',
    class_id: 'cls-1',
    weekday: 6, // Thứ 7
    start_time: '15:30',
    end_time: '17:00',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // T3: Chiều Ca 1 (16h - 18h) Văn 9 off 2hs
  {
    id: 'rule-3',
    class_id: 'cls-2',
    weekday: 2, // Thứ 3
    start_time: '16:00',
    end_time: '18:00',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // T3: Ca 2. Tối (19h - 20h30) Văn 7V1
  {
    id: 'rule-4',
    class_id: 'cls-3',
    weekday: 2, // Thứ 3
    start_time: '19:00',
    end_time: '20:30',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // T4: Tối (19h - 20h30) Văn 9 onl
  {
    id: 'rule-5',
    class_id: 'cls-4',
    weekday: 3, // Thứ 4
    start_time: '19:00',
    end_time: '20:30',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // T7: Chiều Ca 2 (13h30 - 15h) Văn 9 onl
  {
    id: 'rule-6',
    class_id: 'cls-4',
    weekday: 6, // Thứ 7
    start_time: '13:30',
    end_time: '15:00',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // T5: Ca 1 (13h30 - 15h30) Văn 7 Bảo
  {
    id: 'rule-7',
    class_id: 'cls-5',
    weekday: 4, // Thứ 5
    start_time: '13:30',
    end_time: '15:30',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // T5: Ca 2 (16h - 18h) Văn 9V1
  {
    id: 'rule-8',
    class_id: 'cls-6',
    weekday: 4, // Thứ 5
    start_time: '16:00',
    end_time: '18:00',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // T5: Ca 3. Tối (18h30 - 20h) Văn 8, V6
  {
    id: 'rule-9',
    class_id: 'cls-7',
    weekday: 4, // Thứ 5
    start_time: '18:30',
    end_time: '20:00',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // T5: Ca 4. Tối (20h - 21h30) Văn 12V1 Trang
  {
    id: 'rule-10',
    class_id: 'cls-8',
    weekday: 4, // Thứ 5
    start_time: '20:00',
    end_time: '21:30',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // T6: Tối (18h30 - 20h) TV 5 Bảo Anh
  {
    id: 'rule-11',
    class_id: 'cls-9',
    weekday: 5, // Thứ 6
    start_time: '18:30',
    end_time: '20:00',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // T7: Sáng Ca 1 (9h - 10h30) Văn 6V1; V7; TV2
  {
    id: 'rule-12',
    class_id: 'cls-10',
    weekday: 6, // Thứ 7
    start_time: '09:00',
    end_time: '10:30',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // T7: Tối Ca 4 (19h - 21h) Văn 12; V9
  {
    id: 'rule-13',
    class_id: 'cls-11',
    weekday: 6, // Thứ 7
    start_time: '19:00',
    end_time: '21:00',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // CN: Sáng Ca 1 (8h - 10h) TV5 Hiển
  {
    id: 'rule-14',
    class_id: 'cls-12',
    weekday: 7, // Chủ nhật
    start_time: '08:00',
    end_time: '10:00',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // CN: Chiều Ca 2 (13h - 14h30) Văn 7V2
  {
    id: 'rule-15',
    class_id: 'cls-13',
    weekday: 7, // Chủ nhật
    start_time: '13:00',
    end_time: '14:30',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // CN: Chiều Ca 3 (15h - 16h30) Văn 8
  {
    id: 'rule-16',
    class_id: 'cls-14',
    weekday: 7, // Chủ nhật
    start_time: '15:00',
    end_time: '16:30',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
]

const MORNING_PERIOD_DEF = [
  { code: 'S1', start: '07:00', end: '07:45' },
  { code: 'S2', start: '07:55', end: '08:40' },
  { code: 'S3', start: '09:10', end: '09:55' },
  { code: 'S4', start: '10:05', end: '10:50' },
  { code: 'S5', start: '11:00', end: '11:45' },
]

const AFTERNOON_PERIOD_DEF = [
  { code: 'C1', start: '14:00', end: '14:45' },
  { code: 'C2', start: '14:50', end: '15:35' },
  { code: 'C3', start: '15:45', end: '16:30' },
]

function buildSchoolScheduleForWeek(weekStart: string, prefix: string): SchoolSchedule[] {
  const items: SchoolSchedule[] = []
  let idx = 1

  // Sáng (7h - 11h45): T2, T3, T4, T5, T6 đều Dạy Trường
  for (const weekday of [1, 2, 3, 4, 5]) {
    for (const p of MORNING_PERIOD_DEF) {
      items.push({
        id: `${prefix}-${idx++}`,
        week_start: weekStart,
        weekday,
        period_code: p.code,
        session: 'morning',
        cell_type: 'class',
        class_name: 'Dạy Trường',
        subject: 'Ngữ văn',
        room: '',
        note: 'Sáng (7h - 11h45)',
        valid_from: weekStart,
        valid_to: null,
        user_id: 'local',
        period: p.code,
        start_time: p.start,
        end_time: p.end,
      })
    }
  }

  // Chiều (14h - 16h30): T2, T4, T6 Dạy Trường
  for (const weekday of [1, 3, 5]) {
    for (const p of AFTERNOON_PERIOD_DEF) {
      items.push({
        id: `${prefix}-${idx++}`,
        week_start: weekStart,
        weekday,
        period_code: p.code,
        session: 'afternoon',
        cell_type: 'class',
        class_name: 'Dạy Trường',
        subject: 'Ngữ văn',
        room: '',
        note: 'Chiều (14h - 16h30)',
        valid_from: weekStart,
        valid_to: null,
        user_id: 'local',
        period: p.code,
        start_time: p.start,
        end_time: p.end,
      })
    }
  }

  return items
}

// Khởi tạo lịch Dạy Trường cho tuần hiện tại và các tuần lân cận (-4 tuần đến +12 tuần)
export const INITIAL_SCHOOL_SCHEDULE: SchoolSchedule[] = Array.from(
  { length: 17 },
  (_, i) => i - 4
).flatMap((weekOffset) => {
  const weekMonday = addDaysToDateStr(CURRENT_MONDAY, weekOffset * 7)
  return buildSchoolScheduleForWeek(weekMonday, `sch-w${weekOffset >= 0 ? `p${weekOffset}` : `m${Math.abs(weekOffset)}`}`)
})

export const INITIAL_HOLIDAYS: Holiday[] = []
