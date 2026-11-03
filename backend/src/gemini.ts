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
  return `Bạn là trợ lý AI đọc ảnh thời khóa biểu của trường học Việt Nam.
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
- confidence: độ tin cậy từ 0.0 đến 1.0

Chỉ trả về JSON thuần hợp lệ.`
}
