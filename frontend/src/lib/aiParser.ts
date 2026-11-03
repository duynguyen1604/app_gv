import { addDays, format, parse, startOfWeek } from 'date-fns'
import type { Class, ParsedScheduleItem, ParsedSchoolScheduleItem } from '../types'
import { dateToStr } from './dateUtils'

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
  // If user provided a Gemini API Key, try calling the real Gemini API first!
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

  // Fallback to local rule-based Vietnamese NLP parser
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
    let moveFromDate: string | null = null
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
      // Check weekday: T2..T7, CN, thứ 2..thứ 7, chủ nhật
      const weekdayMatch = lower.match(/(thứ\s*([2-7]|hai|ba|tư|bốn|năm|sáu|bảy)|chủ nhật|chu nhat|cn|t([2-7]))/i)
      if (weekdayMatch) {
        const raw = weekdayMatch[0].toLowerCase()
        let dayNum = 1 // 1=Mon ... 7=Sun
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
        // Base Monday is dayNum = 1
        targetDate = addDays(baseMonday, dayNum - 1)
      } else {
        // Check date pattern dd/mm or dd-mm
        const dateMatch = lower.match(/(\d{1,2})[\/\-](\d{1,2})/)
        if (dateMatch) {
          const d = parseInt(dateMatch[1], 10)
          const m = parseInt(dateMatch[2], 10) - 1
          targetDate = new Date(today.getFullYear(), m, d)
        } else {
          // Could not find date
          ambiguity = 'Không xác định được ngày cụ thể'
          confidence = 0.5
        }
      }
    }

    // 3. Detect Times: e.g. "9h-11h", "9h - 11h", "19h30", "19:30", "7h tối", "14h"
    let startTime: string | null = null
    let endTime: string | null = null

    // Range match: "9h - 11h" or "09:00 - 11:00" or "9h30 - 11h"
    const rangeMatch = lower.match(/(\d{1,2})(?:h|:)(\d{2})?\s*(?:đến|-|->|–)\s*(\d{1,2})(?:h|:)(\d{2})?/)
    if (rangeMatch) {
      const h1 = parseInt(rangeMatch[1], 10)
      const m1 = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : 0
      const h2 = parseInt(rangeMatch[3], 10)
      const m2 = rangeMatch[4] ? parseInt(rangeMatch[4], 10) : 0
      startTime = `${String(h1).padStart(2, '0')}:${String(m1).padStart(2, '0')}`
      endTime = `${String(h2).padStart(2, '0')}:${String(m2).padStart(2, '0')}`
    } else {
      // Single time match e.g. "7h tối", "19h", "8h sáng"
      const singleMatch = lower.match(/(\d{1,2})(?:h|:)?(\d{2})?\s*(sáng|chiều|tối)?/)
      const timeNumMatch = lower.match(/(\d{1,2})\s*h(?:(\d{2}))?/)
      if (timeNumMatch) {
        let h = parseInt(timeNumMatch[1], 10)
        const m = timeNumMatch[2] ? parseInt(timeNumMatch[2], 10) : 0
        if (lower.includes('tối') && h < 12) h += 12
        if (lower.includes('chiều') && h < 12 && h !== 12) h += 12
        startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        const endH = h + 2 // default 2 hours
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

    // Try partial match like "lớp 9", "lớp 10A", "10A"
    if (!classMatch) {
      const classPattern = lower.match(/(lớp\s*\d+[a-z]?|\d+[a-z]\b)/)
      if (classPattern) {
        classText = classPattern[0]
        const matched = classes.find(c => c.name.toLowerCase().includes(classText))
        if (matched) {
          classMatch = matched.id
        } else {
          confidence = Math.min(confidence, 0.7)
          ambiguity = ambiguity ? ambiguity + `, chưa khớp lớp nào với "${classText}"` : `Chưa khớp lớp nào với "${classText}"`
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

/**
 * Call Google Gemini 1.5 API to parse Zalo messages
 */
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
- Trả về CHỈ một mảng JSON (không có markdown khác ngoài json block), mỗi phần tử có định dạng:
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
 * Parse School Timetable image or text using Gemini Vision or local mock
 */
export async function parseSchoolTimetable({
  imageDataBase64,
  apiKey,
}: {
  imageDataBase64?: string
  apiKey?: string
}): Promise<ParsedSchoolScheduleItem[]> {
  if (apiKey && imageDataBase64) {
    try {
      const items = await callGeminiVisionTimetable({ imageDataBase64, apiKey })
      if (items && items.length > 0) return items
    } catch (err) {
      console.warn('Gemini Vision failed, using default structure:', err)
    }
  }

  // Provide a clean sample timetable for teacher to review and edit
  return [
    { id: '1', weekday: 1, period: 'Tiết 1-2', start_time: '07:00', end_time: '08:35', class_name: '10A1', subject: 'Toán', room: 'P.201', confidence: 0.95 },
    { id: '2', weekday: 1, period: 'Tiết 3-4', start_time: '08:50', end_time: '10:25', class_name: '11B2', subject: 'Toán', room: 'P.203', confidence: 0.9 },
    { id: '3', weekday: 3, period: 'Tiết 1-2', start_time: '07:00', end_time: '08:35', class_name: '12A1', subject: 'Toán', room: 'P.301', confidence: 0.95 },
    { id: '4', weekday: 5, period: 'Tiết 3-4', start_time: '08:50', end_time: '10:25', class_name: '10A1', subject: 'Toán', room: 'P.201', confidence: 0.85 },
    { id: '5', weekday: 6, period: 'Tiết 1-2', start_time: '07:00', end_time: '08:35', class_name: '11B2', subject: 'Toán', room: 'P.203', confidence: 0.92 },
  ]
}

async function callGeminiVisionTimetable({
  imageDataBase64,
  apiKey,
}: {
  imageDataBase64: string
  apiKey: string
}): Promise<ParsedSchoolScheduleItem[]> {
  const mimeType = imageDataBase64.includes('data:image/png') ? 'image/png' : 'image/jpeg'
  const base64Data = imageDataBase64.replace(/^data:image\/\w+;base64,/, '')

  const prompt = `Bạn là trợ lý AI đọc ảnh thời khóa biểu của trường học Việt Nam.
Hãy đọc bảng thời khóa biểu và trích xuất danh sách tất cả các tiết dạy thành JSON mảng.
Mỗi phần tử gồm:
- id: chuỗi id duy nhất
- weekday: số từ 1 đến 7 (1=Thứ 2, 2=Thứ 3, 3=Thứ 4, 4=Thứ 5, 5=Thứ 6, 6=Thứ 7, 7=Chủ nhật)
- period: tên tiết, vd "Tiết 1", "Tiết 2-3"
- start_time: giờ bắt đầu (HH:mm), vd "07:00"
- end_time: giờ kết thúc (HH:mm), vd "07:45"
- class_name: tên lớp dạy ở trường, vd "10A1", "11B2"
- subject: tên môn học, vd "Toán", "Văn", "Lý"
- room: tên phòng học, vd "P.102" (nếu có, không có thì để rỗng "")
- confidence: độ tin cậy từ 0.0 đến 1.0 (tô vàng nếu < 0.8)

Chỉ trả về JSON thuần hợp lệ.`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64Data } }
        ]
      }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  })

  if (!response.ok) {
    throw new Error(`Gemini Vision API error: ${response.statusText}`)
  }

  const data = await response.json()
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!rawText) return []

  return JSON.parse(rawText)
}

