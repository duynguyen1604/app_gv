export async function callGeminiJson({
  apiKey,
  prompt,
  image,
}: {
  apiKey: string
  prompt: string
  image?: { mimeType: string; data: string }
}): Promise<unknown> {
  const parts: Array<Record<string, unknown>> = [{ text: prompt }]
  if (image) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } })
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Gemini API Error: ${response.status} ${response.statusText} ${detail}`)
  }

  const data = await response.json()
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
  return JSON.parse(rawText)
}

export function buildZaloPrompt({
  text,
  today,
  weekStart,
  classes,
}: {
  text: string
  today: string
  weekStart: string
  classes: unknown
}): string {
  return `Bạn là trợ lý AI thông minh cho giáo viên Việt Nam.
Hãy đọc nội dung tin nhắn Zalo/SMS sau và trích xuất thông tin lịch dạy thành JSON.
Ngày hôm nay: ${today}
Đầu tuần đang xem: ${weekStart}
Danh sách lớp: ${JSON.stringify(classes)}

Quy tắc:
- "T2..T7, CN" là thứ của tuần đang xem trừ khi tin nói "tuần sau" hoặc có ngày cụ thể.
- "mai", "tối nay", "hôm nay", "mốt" tính theo ngày hôm nay.
- "7h tối" = 19:00, "9h sáng" = 09:00.
- Chỉ có "sáng/chiều/tối" mà không có giờ cụ thể thì để start_time null và ghi vào ambiguity.
- action: "add" | "move" | "cancel".
- Trả về CHỈ một mảng JSON:
[
  {
    "action": "add" | "move" | "cancel",
    "date": "YYYY-MM-DD",
    "start_time": "HH:mm" | null,
    "end_time": "HH:mm" | null,
    "class_match": "id lớp hoặc null",
    "class_text": "chữ gốc trong tin",
    "move_from_date": "YYYY-MM-DD" | null,
    "confidence": 0.0 - 1.0,
    "ambiguity": "điều chưa rõ hoặc null",
    "source_text": "đoạn tin gốc"
  }
]
Tin nhắn:
${text}`
}

export function buildSchoolImagePrompt(): string {
  return `Bạn là trợ lý AI chuyên đọc bảng Thời khóa biểu trường học Việt Nam (cấp THCS/THPT).
Cấu trúc bảng tiêu chuẩn:
- Dòng tiêu đề trên cùng thường ghi: Tên giáo viên, "Áp dụng từ ngày dd/mm/yyyy" (hoặc tuần bắt đầu), và "Số tiết: X".
- Cột: Thứ 2 (1) đến Thứ 7 (6) hoặc Chủ nhật (7).
- Hàng buổi sáng: Tiết 1..5 -> period_code = "S1".."S5" (session = "morning").
- Hàng buổi chiều: Tiết 1..4 (hoặc 1..5) -> period_code = "C1".."C4" (session = "afternoon").
- Nếu một buổi chiều ghi "Trực" (dù ghi ở 1 ô hay gộp cả buổi chiều): trả về 1 phần tử có cell_type = "duty", session = "afternoon", period_code = "C1", class_name = "Trực", start_time = "13:30", end_time = "16:30".

Trả về CHỈ một đối tượng JSON theo đúng cấu trúc:
{
  "teacher_name": "Họ tên giáo viên (nếu có) hoặc null",
  "week_start": "YYYY-MM-DD (ngày Thứ 2 của tuần áp dụng nếu đọc được) hoặc null",
  "declared_period_count": số_tiết_ghi_trên_tiêu_đề_hoặc_null,
  "cells": [
    {
      "weekday": 1..7,
      "session": "morning" | "afternoon",
      "period": 1..5,
      "period_code": "S1".."S5" | "C1".."C5",
      "cell_type": "class" | "duty" | "other",
      "class_name": "10A6, 12A9, Trực...",
      "subject": "Toán...",
      "room": "P.201...",
      "confidence": 0.0 - 1.0
    }
  ]
}
Chỉ trả về JSON hợp lệ.`
}
