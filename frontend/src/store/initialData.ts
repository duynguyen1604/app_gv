import type { Class, Student, ScheduleRule, SchoolSchedule, Holiday } from '../types'

export const INITIAL_CLASSES: Class[] = [
  {
    id: 'cls-1',
    name: 'Toán 9 Nâng cao',
    location: 'Nhà riêng (P. Cầu Giấy)',
    price: 150000,
    color: '#F97316', // Orange
    created_at: new Date().toISOString(),
    user_id: 'local',
  },
  {
    id: 'cls-2',
    name: 'Toán 12 Luyện thi ĐH',
    location: 'Trung tâm Ánh Dương (Đống Đa)',
    price: 200000,
    color: '#8B5CF6', // Purple
    created_at: new Date().toISOString(),
    user_id: 'local',
  },
]

export const INITIAL_STUDENTS: Student[] = [
  {
    id: 'st-1',
    class_id: 'cls-1',
    name: 'Nguyễn Minh Anh',
    parent_name: 'Chị Lan',
    parent_phone: '0912345678',
    custom_price: null,
    status: 'active',
    note: 'Học tốt hình học',
    created_at: new Date().toISOString(),
  },
  {
    id: 'st-2',
    class_id: 'cls-1',
    name: 'Trần Đức Bo',
    parent_name: 'Anh Hùng',
    parent_phone: '0987654321',
    custom_price: null,
    status: 'active',
    note: 'Cần kèm thêm đại số',
    created_at: new Date().toISOString(),
  },
  {
    id: 'st-3',
    class_id: 'cls-1',
    name: 'Lê Hoàng Yến',
    parent_name: 'Cô Mai',
    parent_phone: '0903112233',
    custom_price: 120000, // giảm giá riêng
    status: 'active',
    note: 'Học sinh quen',
    created_at: new Date().toISOString(),
  },
  {
    id: 'st-4',
    class_id: 'cls-1',
    name: 'Phạm Gia Huy',
    parent_name: 'Bác Thành',
    parent_phone: '0977889900',
    custom_price: null,
    status: 'trial', // Học thử (không tính tiền)
    note: 'Buổi đầu tiên thử sức',
    created_at: new Date().toISOString(),
  },
  {
    id: 'st-5',
    class_id: 'cls-2',
    name: 'Đặng Tuấn Kiệt',
    parent_name: 'Chị Nga',
    parent_phone: '0933445566',
    custom_price: null,
    status: 'active',
    note: 'Mục tiêu 9+ môn Toán',
    created_at: new Date().toISOString(),
  },
  {
    id: 'st-6',
    class_id: 'cls-2',
    name: 'Vũ Thùy Linh',
    parent_name: 'Bác Nam',
    parent_phone: '0911223344',
    custom_price: null,
    status: 'active',
    note: null,
    created_at: new Date().toISOString(),
  },
]

export const INITIAL_SCHEDULE_RULES: ScheduleRule[] = [
  // Lớp Toán 9: Thứ 3 và Thứ 7
  {
    id: 'rule-1',
    class_id: 'cls-1',
    weekday: 2, // Thứ 3
    start_time: '18:00',
    end_time: '19:30',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  {
    id: 'rule-2',
    class_id: 'cls-1',
    weekday: 6, // Thứ 7
    start_time: '08:30',
    end_time: '10:00',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  // Lớp Toán 12: Thứ 5 và Chủ nhật
  {
    id: 'rule-3',
    class_id: 'cls-2',
    weekday: 4, // Thứ 5
    start_time: '19:30',
    end_time: '21:30',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  {
    id: 'rule-4',
    class_id: 'cls-2',
    weekday: 7, // Chủ nhật
    start_time: '14:30',
    end_time: '16:30',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
]

export const INITIAL_SCHOOL_SCHEDULE: SchoolSchedule[] = [
  {
    id: 'sch-1',
    weekday: 1, // Thứ 2
    period: 'Tiết 1-2',
    start_time: '07:00',
    end_time: '08:35',
    class_name: '10A1',
    subject: 'Toán',
    room: '201',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  {
    id: 'sch-2',
    weekday: 1, // Thứ 2
    period: 'Tiết 3-4',
    start_time: '08:50',
    end_time: '10:25',
    class_name: '11B2',
    subject: 'Toán',
    room: '203',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  {
    id: 'sch-3',
    weekday: 3, // Thứ 4
    period: 'Tiết 2-3',
    start_time: '07:50',
    end_time: '09:25',
    class_name: '10A1',
    subject: 'Toán',
    room: '201',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  {
    id: 'sch-4',
    weekday: 5, // Thứ 6
    period: 'Tiết 1-2',
    start_time: '07:00',
    end_time: '08:35',
    class_name: '12A1',
    subject: 'Toán',
    room: '302',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
]

export const INITIAL_HOLIDAYS: Holiday[] = [
  {
    id: 'h-1',
    date: '2026-11-20',
    note: 'Ngày Nhà giáo Việt Nam 20/11',
    user_id: 'local',
  },
]

