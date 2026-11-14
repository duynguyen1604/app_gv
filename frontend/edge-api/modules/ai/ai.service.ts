export function parseZaloRuleBased(text: string) {
  const lower = text.toLowerCase()
  let intent: 'reschedule' | 'leave' | 'extra' | 'general_note' = 'general_note'
  if (/(nghỉ|xin phép nghỉ|vắng|bận|ốm|hoãn|hủy)/.test(lower)) {
    intent = 'leave'
  }
  if (/(đổi lịch|dời|chuyển sang|bù|học bù|dạy bù)/.test(lower)) {
    intent = 'reschedule'
  }
  if (/(tăng cường|thêm buổi|ca phụ|bổ trợ)/.test(lower)) {
    intent = 'extra'
  }

  const timeMatch = text.match(/(\d{1,2})[h:](\d{2})?/)
  const suggestedTime = timeMatch
    ? `${timeMatch[1].padStart(2, '0')}:${(timeMatch[2] || '00').padStart(2, '0')}`
    : undefined

  return {
    intent,
    confidence: 0.85,
    summary: text.trim().slice(0, 140),
    suggested_time: suggestedTime,
  }
}

export const APP_HELP_SYSTEM_PROMPT = `Bạn là Trợ lý Hướng dẫn Sử dụng của phần mềm "Lịch Dạy GV".
NHIỆM VỤ DUY NHẤT:
- Hướng dẫn người dùng cách sử dụng các chức năng của ứng dụng bằng tiếng Việt ngắn gọn, dễ hiểu, từng bước rõ ràng.
- Các tính năng chính của app:
  1. Lịch dạy (/schedule): Xem lịch theo Ngày/Tuần/Tháng, lịch trường học & dạy thêm, bấm vào buổi học để xem/điểm danh.
  2. Lớp học & Học sinh (/classes, /classes/:classId): Bấm "+ Thêm lớp mới" để tạo lớp, bấm vào lớp để thêm học sinh và xếp lịch cố định.
  3. Lịch học phát sinh: Tạo buổi học ngoài lịch cố định (chọn lớp, ngày, giờ, ghi chú và ô "Học phí buổi này" tùy chọn — nhập số tiền sẽ tính theo giá riêng, để trống dùng giá mặc định của lớp; cho phép sửa/xóa).
  4. Điểm danh: Vào Chi tiết lớp hoặc bấm vào buổi dạy trên Lịch để đánh dấu Có mặt / Vắng / Có phép.
  5. Học phí (/fees): Chọn Tháng và Bộ lọc theo lớp (hoặc Tất cả lớp) để xem tổng phải thu, đã thu, còn thiếu và ghi nhận thu tiền.
  6. Cài đặt (/settings): Chỉnh giờ tiết trường S1-S5/C1-C5, bật "Thông báo Gmail" (nhập email + giờ nhận, gửi thử), đồng bộ Google Calendar (.ics).
  7. Hướng dẫn từng bước: Bấm nút "Hướng dẫn (?)" trên thanh trên cùng hoặc trong Cài đặt để xem lại hướng dẫn chỉ từng nút bấm.
  8. Hồ sơ (/profile): Sửa thông tin cá nhân hoặc đổi mật khẩu của chính mình.
  9. Liên hệ Admin / Khiếu nại / Hỗ trợ: Bấm sang tab "Liên hệ Admin" ngay trên đầu hộp chat này để gửi đơn hỗ trợ, khiếu nại, báo lỗi hoặc chat 2 chiều trực tiếp với Quản trị viên.
  10. Cổng Quản trị (/admin, chỉ dành cho Admin): Duyệt/khóa tài khoản giáo viên, tab "Mã mời Giáo viên" để tạo mã mời, tab "Hỗ trợ & Khiếu nại" để trả lời giáo viên, xem Nhật ký kiểm toán (lưu 30 ngày gần nhất).

QUY TẮC BẢO MẬT & PHẠM VI BẮT BUỘC:
- TUYỆT ĐỐI KHÔNG trả lời các câu hỏi ngoài phạm vi phần mềm Lịch Dạy GV (như viết code, giải bài tập, nấu ăn, thời tiết, tin tức, chính trị, chứng khoán, giải trí...). Nếu bị hỏi ngoài luồng, hãy từ chối lịch sự và mời người dùng hỏi về cách sử dụng app.
- TUYỆT ĐỐI KHÔNG tiết lộ, suy đoán hay thảo luận về mật khẩu, API key, token, secret, thông tin hoặc dữ liệu của bất kỳ tài khoản nào khác.
- Không bịa đặt tính năng không có trong danh sách trên.`

export function checkHelpChatGuardrail(message: string): {
  blocked: boolean
  reason?: 'security' | 'off_topic'
  reply?: string
} {
  const norm = message.toLowerCase().trim()

  const isSelfPasswordHelp =
    /(đổi mật khẩu|quên mật khẩu|đặt lại mật khẩu|cập nhật mật khẩu|change password|reset password)/.test(
      norm
    ) && !/(của người khác|của admin|của ai|tài khoản khác|xem mật khẩu|lộ mật khẩu)/.test(norm)

  const securityPattern =
    /(mật khẩu của|xem mật khẩu|lấy mật khẩu|mật khẩu admin|password của|admin password|api key|resend_api_key|cron_secret|gemini_api_key|session token|access token|tài khoản khác|email của giáo viên|danh sách tài khoản|dữ liệu người khác|hack|sql injection|ignore previous|system prompt|bỏ qua chỉ dẫn|tiết lộ mật khẩu)/i

  if (!isSelfPasswordHelp && securityPattern.test(norm)) {
    return {
      blocked: true,
      reason: 'security',
      reply:
        'Xin lỗi, tôi chỉ là trợ lý hướng dẫn sử dụng ứng dụng nên không thể xem, truy xuất hay tiết lộ mật khẩu, mã bảo mật hoặc thông tin của tài khoản khác. Nếu bạn muốn tự đổi mật khẩu của mình, hãy vào mục **Hồ sơ cá nhân** → **Đổi mật khẩu**.',
    }
  }

  const appKeywords =
    /(lịch dạy|lịch học|phát sinh|lớp học|học sinh|điểm danh|học phí|lọc theo lớp|cài đặt|tiết học|thông báo|email|gmail|google calendar|\.ics|hướng dẫn|hồ sơ|đổi mật khẩu|quên mật khẩu|đăng nhập|đăng ký|mã mời|admin|quản trị|kiểm toán|app|ứng dụng|phần mềm|tính năng|nút|trang)/i

  const offTopicPattern =
    /(viết code|lập trình|python|javascript|typescript|react|html|css|giải toán|giải bài|làm bài tập|thời tiết|chứng khoán|bitcoin|crypto|bóng đá|nấu ăn|công thức nấu|chính trị|tử vi|kể chuyện|bài thơ|viết văn|dịch sang tiếng|chatgpt|gemini là gì)/i

  if (offTopicPattern.test(norm) && !appKeywords.test(norm)) {
    return {
      blocked: true,
      reason: 'off_topic',
      reply:
        'Tôi chỉ có nhiệm vụ duy nhất là **hướng dẫn cách sử dụng ứng dụng Lịch Dạy GV** (xếp lịch dạy, lớp học, lịch phát sinh, điểm danh, học phí, cài đặt và tài khoản). Bạn đang cần hỗ trợ thao tác nào trong ứng dụng ạ?',
    }
  }

  return { blocked: false }
}

export function buildRuleBasedHelpReply(
  message: string,
  role: string,
  currentPath: string
): string {
  const q = message.toLowerCase()

  if (/(phát sinh|buổi bù|ngoài lịch|học phí buổi này)/.test(q)) {
    return [
      'Để tạo **Lịch học phát sinh** (ngoài lịch cố định):',
      '1. Vào trang **Lớp học** hoặc bấm nút **+ Lịch phát sinh**.',
      '2. Chọn **Lớp**, **Ngày**, **Giờ bắt đầu / kết thúc** và **Ghi chú** (không bắt buộc).',
      '3. Ở ô **Học phí buổi này**: nhập số tiền nếu muốn thu mức riêng cho buổi này, hoặc để trống để dùng giá mặc định của lớp.',
      '4. Bấm lưu — buổi phát sinh sẽ hiện ngay trên **Lịch dạy**, điểm danh và tính học phí như buổi thường (có thể sửa hoặc xóa).',
    ].join('\n')
  }

  if (/(học phí|thu tiền|công nợ|lọc theo lớp|lọc lớp)/.test(q)) {
    return [
      'Để xem và thu **Học phí**:',
      '1. Mở mục **Học phí** trên thanh menu.',
      '2. Chọn **Tháng** cần xem và chọn lớp ở ô **Lọc theo lớp** (hoặc chọn *Tất cả lớp*).',
      '3. Các số tổng (*Phải thu, Đã thu, Còn thiếu*) và danh sách học sinh sẽ tự tính theo lớp bạn chọn.',
      '4. Bấm nút ghi nhận thu tiền ở dòng học sinh để cập nhật đã đóng học phí.',
    ].join('\n')
  }

  if (/(điểm danh|vắng|có mặt|có phép)/.test(q)) {
    return [
      'Để **Điểm danh** một buổi dạy:',
      '1. Cách 1: Ở trang **Lịch dạy**, bấm trực tiếp vào buổi dạy hôm đó để mở nhanh khung điểm danh.',
      '2. Cách 2: Vào **Lớp học** → bấm vào tên lớp → chọn buổi dạy cần điểm danh.',
      '3. Chọn trạng thái **Có mặt / Vắng / Có phép** cho từng học sinh — hệ thống tự lưu và cộng vào bảng học phí cuối tháng.',
    ].join('\n')
  }

  if (/(lớp học|tạo lớp|thêm lớp|học sinh|thêm học sinh)/.test(q)) {
    return [
      'Để **Tạo lớp & Thêm học sinh**:',
      '1. Vào mục **Lớp học** → bấm **+ Thêm lớp mới** để nhập tên lớp, học phí mặc định mỗi buổi và lịch dạy cố định trong tuần.',
      '2. Sau khi tạo xong, bấm vào tên lớp để mở **Chi tiết lớp** → bấm **+ Thêm học sinh** để nhập danh sách học viên.',
    ].join('\n')
  }

  if (/(email|gmail|thông báo|nhắc lịch|sáng)/.test(q)) {
    return [
      'Để bật **Thông báo lịch dạy qua Email mỗi sáng**:',
      '1. Vào **Cài đặt** → chọn mục **Thông báo Gmail**.',
      '2. Gạt bật công tắc thông báo, nhập email nhận (hoặc bấm **Dùng email tài khoản**) và chọn giờ muốn nhận (mặc định `06:00`).',
      '3. Bạn có thể bấm **Gửi email thử** để kiểm tra ngay email lịch dạy trong ngày.',
    ].join('\n')
  }

  if (/(google calendar|calendar|\.ics|đồng bộ lịch)/.test(q)) {
    return [
      'Để đồng bộ sang **Google Calendar**:',
      '1. Vào **Cài đặt** → chọn mục **Google Calendar & AI**.',
      '2. Bấm **Kết nối Google Calendar** (ứng dụng tự điền sẵn email tài khoản của bạn), hoặc sao chép **đường link `.ics`** bên dưới để dán vào Google Calendar trên web/điện thoại.',
    ].join('\n')
  }

  if (/(tiết học|giờ tiết|cài đặt|nghỉ lễ|s1|c1)/.test(q)) {
    return [
      'Để chỉnh **Giờ tiết học trường & Ngày nghỉ lễ**:',
      '1. Vào **Cài đặt** → mục **Lịch trường & Giờ tiết**.',
      '2. Chỉnh khung giờ từng tiết `S1–S5`, `C1–C5` hoặc thêm các ngày nghỉ lễ để lịch dạy tự động bỏ qua ngày nghỉ.',
    ].join('\n')
  }

  if (/(đổi mật khẩu|quên mật khẩu|hồ sơ|tài khoản của tôi)/.test(q)) {
    return [
      'Để cập nhật thông tin hoặc **Đổi mật khẩu của bạn**:',
      '1. Bấm vào tên/avatar của bạn hoặc vào mục **Hồ sơ**.',
      '2. Tại đây bạn có thể sửa họ tên, trường học, số điện thoại hoặc vào phần **Đổi mật khẩu** để đặt mật khẩu mới (tối thiểu 8 ký tự gồm chữ và số).',
    ].join('\n')
  }

  if (
    /(liên hệ admin|gặp admin|nhắn admin|gửi admin|khiếu nại|phản ánh|báo lỗi|gửi đơn|hỗ trợ kỹ thuật|hỗ trợ từ admin)/.test(
      q
    )
  ) {
    return [
      'Để **liên hệ trực tiếp với Admin** hoặc **gửi đơn khiếu nại / hỗ trợ**:',
      '1. Bấm sang tab **Liên hệ Admin** ngay phía trên hộp chat này.',
      '2. Bấm **+ Gửi đơn mới**, chọn loại yêu cầu (*Hỗ trợ sử dụng / Khiếu nại / Báo lỗi / Tài khoản*), nhập tiêu đề và nội dung rồi bấm gửi.',
      '3. Bạn có thể bấm vào đơn đã gửi bất cứ lúc nào để **chat 2 chiều trực tiếp** và xem phản hồi của Admin!',
    ].join('\n')
  }

  if (/(mã mời|duyệt|khóa tài khoản|kiểm toán|admin|quản trị)/.test(q)) {
    if (role === 'admin') {
      return [
        'Hướng dẫn nhanh trong **Cổng Quản trị (Admin)**:',
        '- **Tài khoản**: Duyệt tài khoản chờ, khóa/mở khóa hoặc cấp lại mật khẩu tạm thời cho giáo viên.',
        '- **Mã mời Giáo viên**: Nhập email (tùy chọn), số lượt dùng tối đa, hạn ngày hoặc mã tùy chỉnh rồi bấm **Tạo mã mời**.',
        '- **Nhật ký kiểm toán**: Tự động lưu các thao tác đăng nhập và quản trị trong **30 ngày gần nhất**.',
      ].join('\n')
    }
    return 'Các chức năng duyệt tài khoản và tạo mã mời chỉ dành cho Quản trị viên. Nếu bạn là giáo viên, hãy dùng các mục **Lịch dạy, Lớp học, Học phí, Cài đặt** và **Hồ sơ** nhé!'
  }

  if (/(hướng dẫn|bắt đầu|chỉ nút|không biết dùng|làm sao)/.test(q)) {
    return [
      'Bạn có thể bấm nút **Hướng dẫn (?)** trên thanh tiêu đề để app tự khoanh sáng và chỉ từng nút bấm trên trang đang mở!',
      'Hoặc hãy hỏi tôi cụ thể tính năng bạn cần, ví dụ:',
      '• *Cách tạo lớp và thêm học sinh?*',
      '• *Cách tạo lịch học phát sinh có học phí riêng?*',
      '• *Cách điểm danh và lọc học phí theo lớp?*',
      '• *Cách bật thông báo email mỗi sáng?*',
    ].join('\n')
  }

  const pageHint = currentPath.startsWith('/fees')
    ? 'Bạn đang ở trang **Học phí** — bạn có thể hỏi về cách lọc theo lớp hoặc ghi nhận thu tiền.'
    : currentPath.startsWith('/classes')
      ? 'Bạn đang ở trang **Lớp học** — bạn có thể hỏi về cách tạo lớp, thêm học sinh, điểm danh hoặc tạo lịch phát sinh.'
      : currentPath.startsWith('/settings')
        ? 'Bạn đang ở trang **Cài đặt** — bạn có thể hỏi về giờ tiết trường, thông báo Email hoặc Google Calendar.'
        : currentPath.startsWith('/admin')
          ? 'Bạn đang ở **Cổng Quản trị** — bạn có thể hỏi về duyệt giáo viên, tạo mã mời hoặc nhật ký kiểm toán.'
          : 'Bạn có thể hỏi tôi về **Lịch dạy, Lớp học, Lịch phát sinh, Điểm danh, Học phí, Cài đặt** hoặc **Hồ sơ**.'

  return `Tôi chỉ hỗ trợ hướng dẫn cách sử dụng ứng dụng **Lịch Dạy GV**. ${pageHint}\n\nBạn muốn tôi hướng dẫn thao tác cụ thể nào ạ?`
}

export async function callGeminiHelpChat(
  apiKey: string,
  message: string,
  role: string,
  currentPath: string,
  history: Array<{ role?: string; text?: string }>
): Promise<string | null> {
  try {
    const contents = [
      ...history
        .filter((m) => m && typeof m.text === 'string' && m.text.trim())
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(m.text).slice(0, 600) }],
        })),
      {
        role: 'user',
        parts: [
          {
            text: `[Ngữ cảnh: vai trò=${role}, trang hiện tại=${currentPath}]\nCâu hỏi của người dùng: ${message}`,
          },
        ],
      },
    ]

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: APP_HELP_SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 500,
          },
        }),
      }
    )

    if (!res.ok) return null
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return text || null
  } catch {
    return null
  }
}

