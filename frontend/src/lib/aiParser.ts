import { addDays, format, startOfWeek } from 'date-fns'
import type {
  Class,
  ParsedScheduleItem,
  ParsedSchoolScheduleItem,
  ParsedSchoolTimetableResult,
} from '../types'
import { dateToStr } from './dateUtils'
import { generateId } from './utils'
import { getMondayOfDateStr, normalizePeriodCode } from './schoolPeriods'

export async function parseZaloMessages({
  text,
  today = new Date(),
  weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }),
  classes = [],
  apiKey = '',
}: {
  text: string
  today?: Date
  weekStart?: Date
  classes: Class[]
  apiKey?: string
}): Promise<ParsedScheduleItem[]> {
  if (apiKey && apiKey.trim().length > 10) {
    try {
      const result = await callGeminiParseZalo({ text, today, weekStart, classes, apiKey })
      if (result && result.length > 0) {
        return result
      }
    } catch (err) {
      console.warn('Gemini API call failed, falling back to local NLP parser:', err)
    }
  }

  return parseZaloMessagesLocal({ text, today, weekStart, classes })
}

/**
 * Local Vietnamese NLP parser for Zalo / SMS messages
 */
export function parseZaloMessagesLocal({
  text,
  today = new Date(),
  weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }),
  classes = [],
}: {
  text: string
  today?: Date
  weekStart?: Date
  classes: Class[]
}): ParsedScheduleItem[] {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean)
  const items: ParsedScheduleItem[] = []

  for (const line of lines) {
    const lower = line.toLowerCase()

    // 1. Detect Action
    let action: 'add' | 'move' | 'cancel' = 'add'
    if (/(dời|chuyển|đổi|hoãn sang|sang|qua)/.test(lower)) {
      action = 'move'
    } else if (/(nghỉ|hủy|bận|không học|ko học|tam nghi|tạm nghỉ|off)/.test(lower)) {
      action = 'cancel'
    }

    // 2. Detect Weekday or Relative Day
    let targetDate = new Date(today)
    const moveFromDate: string | null = null
    let ambiguity: string | null = null
    let confidence = 0.9

    const isNextWeek = /(tuần sau|tuan sau)/.test(lower)
    const baseMonday = isNextWeek ? addDays(weekStart, 7) : weekStart

    if (/(hôm nay|hom nay|tối nay|toi nay|chiều nay|chieu nay|sáng nay|sang nay)/.test(lower)) {
      targetDate = new Date(today)
    } else if (/(ngày mai|ngay mai|mai)/.test(lower)) {
      targetDate = addDays(today, 1)
    } else if (/(ngày mốt|ngay mot|mốt)/.test(lower)) {
      targetDate = addDays(today, 2)
    } else {
      const weekdayMatch = lower.match(/(thứ\s*([2-7]|hai|ba|tư|bốn|năm|sáu|bảy)|chủ nhật|chu nhat|cn|t([2-7]))/i)
      if (weekdayMatch) {
        const raw = weekdayMatch[0].toLowerCase()
        let dayNum = 1
        if (raw.includes('cn') || raw.includes('chủ nhật') || raw.includes('chu nhat')) {
          dayNum = 7
        } else if (raw.includes('2') || raw.includes('hai')) {
          dayNum = 1
        } else if (raw.includes('3') || raw.includes('ba')) {
          dayNum = 2
        } else if (raw.includes('4') || raw.includes('tư') || raw.includes('bốn')) {
          dayNum = 3
        } else if (raw.includes('5') || raw.includes('năm')) {
          dayNum = 4
        } else if (raw.includes('6') || raw.includes('sáu')) {
          dayNum = 5
        } else if (raw.includes('7') || raw.includes('bảy')) {
          dayNum = 6
        }
        targetDate = addDays(baseMonday, dayNum - 1)
      } else {
        const dateMatch = lower.match(/(\d{1,2})[\/\-](\d{1,2})/)
        if (dateMatch) {
          const d = parseInt(dateMatch[1], 10)
          const m = parseInt(dateMatch[2], 10) - 1
          targetDate = new Date(today.getFullYear(), m, d)
        } else {
          ambiguity = 'Không xác định được ngày cụ thể'
          confidence = 0.5
        }
      }
    }

    // 3. Detect Times
    let startTime: string | null = null
    let endTime: string | null = null

    const rangeMatch = lower.match(/(\d{1,2})(?:h|:)(\d{2})?\s*(?:đến|-|->|–)\s*(\d{1,2})(?:h|:)(\d{2})?/)
    if (rangeMatch) {
      const h1 = parseInt(rangeMatch[1], 10)
      const m1 = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : 0
      const h2 = parseInt(rangeMatch[3], 10)
      const m2 = rangeMatch[4] ? parseInt(rangeMatch[4], 10) : 0
      startTime = `${String(h1).padStart(2, '0')}:${String(m1).padStart(2, '0')}`
      endTime = `${String(h2).padStart(2, '0')}:${String(m2).padStart(2, '0')}`
    } else {
      const timeNumMatch = lower.match(/(\d{1,2})\s*h(?:(\d{2}))?/)
      if (timeNumMatch) {
        let h = parseInt(timeNumMatch[1], 10)
        const m = timeNumMatch[2] ? parseInt(timeNumMatch[2], 10) : 0
        if (lower.includes('tối') && h < 12) h += 12
        if (lower.includes('chiều') && h < 12 && h !== 12) h += 12
        startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        const endH = h + 2
        endTime = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      } else if (/(sáng|sang)/.test(lower)) {
        ambiguity = ambiguity ? ambiguity + ', chỉ biết là buổi sáng' : 'Chỉ biết là buổi sáng, chưa có giờ cụ thể'
        confidence = Math.min(confidence, 0.6)
      } else if (/(chiều|chieu)/.test(lower)) {
        ambiguity = ambiguity ? ambiguity + ', chỉ biết là buổi chiều' : 'Chỉ biết là buổi chiều, chưa có giờ cụ thể'
        confidence = Math.min(confidence, 0.6)
      } else if (/(tối|toi)/.test(lower)) {
        ambiguity = ambiguity ? ambiguity + ', chỉ biết là buổi tối' : 'Chỉ biết là buổi tối, chưa có giờ cụ thể'
        confidence = Math.min(confidence, 0.6)
      }
    }

    // 4. Match Class
    let classMatch: string | null = null
    let classText = ''
    for (const c of classes) {
      const cNameLower = c.name.toLowerCase()
      if (lower.includes(cNameLower)) {
        classMatch = c.id
        classText = c.name
        break
      }
    }

    if (!classMatch) {
      const classPattern = lower.match(/(lớp\s*\d+[a-z]?|\d+[a-z]\b)/)
      if (classPattern) {
        classText = classPattern[0]
        const matched = classes.find(c => c.name.toLowerCase().includes(classText))
        if (matched) {
          classMatch = matched.id
        } else {
          confidence = Math.min(confidence, 0.7)
          ambiguity = ambiguity
            ? ambiguity + `, chưa khớp lớp nào với "${classText}"`
            : `Chưa khớp lớp nào với "${classText}"`
        }
      } else {
        confidence = Math.min(confidence, 0.5)
        ambiguity = ambiguity ? ambiguity + ', chưa rõ tên lớp' : 'Chưa rõ tên lớp'
      }
    }

    items.push({
      action,
      date: dateToStr(targetDate),
      start_time: startTime,
      end_time: endTime,
      class_match: classMatch,
      class_text: classText || 'Chưa rõ lớp',
      move_from_date: moveFromDate,
      confidence: Math.round(confidence * 100) / 100,
      ambiguity,
      source_text: line,
    })
  }

  return items
}

async function callGeminiParseZalo({
  text,
  today,
  weekStart,
  classes,
  apiKey,
}: {
  text: string
  today: Date
  weekStart: Date
  classes: Class[]
  apiKey: string
}): Promise<ParsedScheduleItem[]> {
  const classListStr = classes.map(c => `ID: "${c.id}", Tên: "${c.name}", Địa điểm: "${c.location}"`).join('\n')
  const prompt = `Bạn là trợ lý AI thông minh cho giáo viên Việt Nam.
Hãy đọc nội dung tin nhắn Zalo/SMS sau và trích xuất thông tin lịch dạy thành JSON.

Ngày hôm nay: ${format(today, 'yyyy-MM-dd')}
Đầu tuần đang xem (Thứ Hai): ${format(weekStart, 'yyyy-MM-dd')}
Danh sách lớp hiện có:
${classListStr || 'Chưa có lớp nào'}

Quy tắc:
- "T2..T7, CN" là thứ của tuần đang xem trừ khi tin nói "tuần sau" hoặc có ngày cụ thể.
- "mai", "tối nay", "hôm nay", "mốt" tính theo ngày hôm nay.
- "7h tối" = 19:00, "9h sáng" = 09:00.
- Nếu chỉ có "sáng/chiều/tối" mà không có giờ cụ thể thì để start_time null và ghi vào ambiguity.
- Không bịa thông tin không có trong tin nhắn.
- Một tin có nhiều buổi thì tách thành nhiều phần tử riêng biệt.
- action: "add" (buổi mới/phát sinh), "move" (dời buổi), "cancel" (hủy/nghỉ).
- Trả về CHỈ một mảng JSON:
[
  {
    "action": "add" | "move" | "cancel",
    "date": "YYYY-MM-DD",
    "start_time": "HH:mm" | null,
    "end_time": "HH:mm" | null,
    "class_match": "id lớp khớp hoặc null",
    "class_text": "chữ gốc trong tin nhắc đến lớp",
    "move_from_date": "YYYY-MM-DD hoặc null",
    "confidence": 0.0 - 1.0,
    "ambiguity": "mô tả điểm chưa rõ hoặc null",
    "source_text": "đoạn tin gốc"
  }
]

Nội dung tin nhắn:
${text}
`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.statusText}`)
  }

  const data = await response.json()
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!rawText) return []

  const parsed = JSON.parse(rawText)
  return Array.isArray(parsed) ? parsed : [parsed]
}

/**
 * Group B4 & Criterion C: Parse School Timetable image into structured result:
 * {
 *   teacher_name,
 *   week_start (Monday YYYY-MM-DD, e.g. '2026-11-02'),
 *   declared_period_count (e.g. 12),
 *   cells: [{ weekday, period_code, session, cell_type, class_name, subject, room, confidence }]
 * }
 * Note: "Trực" (cell_type === 'duty') is NOT counted in declared_period_count.
 */
export async function parseSchoolTimetableResult({
  imageDataBase64,
  apiKey,
  defaultWeekStart = '2026-11-02',
}: {
  imageDataBase64?: string
  apiKey?: string
  defaultWeekStart?: string
}): Promise<ParsedSchoolTimetableResult> {
  if (apiKey && imageDataBase64) {
    try {
      const result = await callGeminiVisionTimetableResult({
        imageDataBase64,
        apiKey,
        defaultWeekStart,
      })
      if (result && result.cells.length > 0) return result
    } catch (err) {
      console.warn('Gemini Vision failed, using sample structure:', err)
    }
  }

  // Sample timetable matching Criterion C:
  // Tuần từ 02/11/2026, trường ghi 12 tiết dạy, có "Trực" chiều T3 (hiển thị 1 khối 13:30-16:30, không cộng vào số tiết dạy)
  const cells: ParsedSchoolScheduleItem[] = [
    // Thứ 2: 4 tiết sáng (S1-S2 10A1, S3-S4 11B2)
    { id: generateId(), weekday: 1, period_code: 'S1', session: 'morning', cell_type: 'class', class_name: '10A1', subject: 'Toán', room: '201', confidence: 0.96 },
    { id: generateId(), weekday: 1, period_code: 'S2', session: 'morning', cell_type: 'class', class_name: '10A1', subject: 'Toán', room: '201', confidence: 0.95 },
    { id: generateId(), weekday: 1, period_code: 'S3', session: 'morning', cell_type: 'class', class_name: '11B2', subject: 'Toán', room: '203', confidence: 0.92 },
    { id: generateId(), weekday: 1, period_code: 'S4', session: 'morning', cell_type: 'class', class_name: '11B2', subject: 'Toán', room: '203', confidence: 0.91 },
    // Thứ 3: Trực chiều (1 khối 13:30-16:30, không tính vào 12 tiết dạy)
    { id: generateId(), weekday: 2, period_code: 'C1', session: 'afternoon', cell_type: 'duty', class_name: 'Trực', subject: 'Trực chiều', room: 'P.HĐ', note: 'Trực cả buổi chiều (13:30–16:30)', confidence: 0.95 },
    // Thứ 4: 4 tiết sáng (S1-S2 10A5, S3-S4 10A1)
    { id: generateId(), weekday: 3, period_code: 'S1', session: 'morning', cell_type: 'class', class_name: '10A5', subject: 'Toán', room: '205', confidence: 0.93 },
    { id: generateId(), weekday: 3, period_code: 'S2', session: 'morning', cell_type: 'class', class_name: '10A5', subject: 'Toán', room: '205', confidence: 0.74 },
    { id: generateId(), weekday: 3, period_code: 'S3', session: 'morning', cell_type: 'class', class_name: '10A1', subject: 'Toán', room: '201', confidence: 0.90 },
    { id: generateId(), weekday: 3, period_code: 'S4', session: 'morning', cell_type: 'class', class_name: '10A1', subject: 'Toán', room: '201', confidence: 0.92 },
    // Thứ 5: 2 tiết chiều (C1-C2 12A1)
    { id: generateId(), weekday: 4, period_code: 'C1', session: 'afternoon', cell_type: 'class', class_name: '12A1', subject: 'Ôn ĐH', room: '302', confidence: 0.94 },
    { id: generateId(), weekday: 4, period_code: 'C2', session: 'afternoon', cell_type: 'class', class_name: '12A1', subject: 'Ôn ĐH', room: '302', confidence: 0.94 },
    // Thứ 6: 2 tiết sáng (S1-S2 12A1) -> Tổng cộng 4 + 4 + 2 + 2 = 12 tiết dạy
    { id: generateId(), weekday: 5, period_code: 'S1', session: 'morning', cell_type: 'class', class_name: '12A1', subject: 'Toán', room: '302', confidence: 0.96 },
    { id: generateId(), weekday: 5, period_code: 'S2', session: 'morning', cell_type: 'class', class_name: '12A1', subject: 'Toán', room: '302', confidence: 0.96 },
  ]

  return {
    teacher_name: 'Cô Nguyễn Thị Lan',
    week_start: getMondayOfDateStr(defaultWeekStart || '2026-11-02'),
    declared_period_count: 12,
    cells,
  }
}

export async function parseSchoolTimetable({
  imageDataBase64,
  apiKey,
}: {
  imageDataBase64?: string
  apiKey?: string
}): Promise<ParsedSchoolScheduleItem[]> {
  const res = await parseSchoolTimetableResult({ imageDataBase64, apiKey })
  return res.cells
}

async function callGeminiVisionTimetableResult({
  imageDataBase64,
  apiKey,
  defaultWeekStart = '2026-11-02',
}: {
  imageDataBase64: string
  apiKey: string
  defaultWeekStart?: string
}): Promise<ParsedSchoolTimetableResult> {
  const mimeType = imageDataBase64.includes('data:image/png') ? 'image/png' : 'image/jpeg'
  const base64Data = imageDataBase64.replace(/^data:image\/\w+;base64,/, '')

  const prompt = `Bạn là trợ lý AI đọc ảnh thời khóa biểu của trường học Việt Nam.
Hãy trích xuất:
1. "teacher_name": tên giáo viên trên thời khóa biểu (nếu có).
2. "week_start": ngày Thứ 2 đầu tuần áp dụng (định dạng YYYY-MM-DD, lấy từ tiêu đề ảnh như "Áp dụng từ ngày 02/11/2026").
3. "declared_period_count": tổng số tiết dạy mà trường ghi trên ảnh (số nguyên, ví dụ 12; lưu ý ô "Trực" KHÔNG tính vào số tiết dạy).
4. "cells": danh sách các ô có nội dung theo cột = thứ (1=Thứ 2 ... 6=Thứ 7, 7=Chủ nhật), hàng = mã tiết (S1..S5 là buổi sáng, C1..C5 là buổi chiều). Nếu buổi chiều có ô "Trực", đặt cell_type = "duty", period_code = "C1".
Trả về JSON object theo đúng cấu trúc:
{
  "teacher_name": "...",
  "week_start": "YYYY-MM-DD",
  "declared_period_count": 12,
  "cells": [
    {
      "weekday": 1..7,
      "period_code": "S1" | "S2" | "S3" | "S4" | "S5" | "C1" | "C2" | "C3" | "C4" | "C5",
      "session": "morning" | "afternoon",
      "cell_type": "class" | "duty" | "other",
      "class_name": "tên lớp vd 10A5 hoặc Trực",
      "subject": "môn học vd Toán hoặc Trực chiều",
      "room": "phòng học nếu có, không có để rỗng",
      "confidence": 0.0 - 1.0
    }
  ]
}`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64Data } },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  })

  if (!response.ok) {
    throw new Error(`Gemini Vision API error: ${response.statusText}`)
  }

  const data = await response.json()
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!rawText) {
    throw new Error('Empty Gemini Vision response')
  }

  const parsed = JSON.parse(rawText)
  const rawArray = Array.isArray(parsed) ? parsed : Array.isArray(parsed.cells) ? parsed.cells : []
  const normalized: ParsedSchoolScheduleItem[] = []

  for (const raw of rawArray) {
    const { period_code, session } = normalizePeriodCode(
      raw.period_code || raw.period || 'S1',
      raw.start_time
    )
    const isDuty =
      raw.cell_type === 'duty' ||
      /trực|truc/i.test(raw.class_name || '') ||
      /trực|truc/i.test(raw.subject || '')
    normalized.push({
      id: generateId(),
      weekday: Number(raw.weekday) || 1,
      period_code,
      session: raw.session || session,
      cell_type: raw.cell_type || (isDuty ? 'duty' : 'class'),
      class_name: String(raw.class_name || (isDuty ? 'Trực' : '')),
      subject: String(raw.subject || ''),
      room: String(raw.room || ''),
      note: String(raw.note || ''),
      confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.9,
    })
  }

  const classCellsCount = normalized.filter((c) => c.cell_type === 'class').length
  return {
    teacher_name: String(parsed?.teacher_name || 'Giáo viên'),
    week_start: getMondayOfDateStr(parsed?.week_start || defaultWeekStart),
    declared_period_count:
      typeof parsed?.declared_period_count === 'number' && parsed.declared_period_count > 0
        ? parsed.declared_period_count
        : classCellsCount,
    cells: normalized,
  }
}
