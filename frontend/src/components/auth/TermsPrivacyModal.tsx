import { X, ShieldCheck, Lock, Trash2, FileSpreadsheet, UserCheck } from 'lucide-react'

export function TermsPrivacyModal({
  open,
  onClose,
  onAccept,
}: {
  open: boolean
  onClose: () => void
  onAccept?: () => void
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-privacy-title"
    >
      <div className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200 dark:border-[#2D2F34] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[#2D2F34]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-[#1A73E8] dark:text-[#8AB4F8] flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2
                id="terms-privacy-title"
                className="text-base font-bold text-gray-900 dark:text-white"
              >
                Điều khoản sử dụng &amp; Chính sách bảo mật
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Cam kết bảo vệ quyền riêng tư giáo viên và dữ liệu học sinh
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#282A2E] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          <div className="p-3.5 rounded-xl bg-blue-50/80 dark:bg-[#1A73E8]/15 border border-blue-200/70 dark:border-[#1A73E8]/30 flex gap-3">
            <Lock size={18} className="text-[#1A73E8] dark:text-[#8AB4F8] shrink-0 mt-0.5" />
            <div className="text-xs text-blue-950 dark:text-blue-100">
              <strong className="font-bold block mb-0.5">
                1. Dữ liệu học sinh chỉ thuộc về duy nhất chủ tài khoản
              </strong>
              Toàn bộ thông tin lớp học, họ tên học sinh, số điện thoại phụ huynh, lịch sử điểm danh và học phí được cô lập hoàn toàn theo từng tài khoản giáo viên (Row Level Security).{' '}
              <strong>
                Ngay cả Quản trị viên hệ thống (Admin) cũng KHÔNG có quyền xem dữ liệu lớp học, học sinh, điểm danh hay học phí của thầy/cô.
              </strong>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
              <UserCheck size={16} className="text-[#1A73E8]" />
              2. Dữ liệu hệ thống lưu trữ
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-xs text-gray-600 dark:text-gray-300">
              <li>
                <strong>Thông tin tài khoản:</strong> Họ tên, địa chỉ email, trường/đơn vị công tác và số điện thoại (nếu cung cấp) để xác thực đăng nhập và gửi thông báo lịch dạy.
              </li>
              <li>
                <strong>Dữ liệu nghiệp vụ giảng dạy:</strong> Thời khóa biểu trường, lịch dạy thêm, danh sách học sinh, điểm danh và sổ thu học phí do chính thầy/cô nhập vào.
              </li>
              <li>
                <strong>Kết nối bên thứ ba (tùy chọn):</strong> Mã kết nối Google Calendar (nếu thầy/cô bật đồng bộ lịch) được mã hóa chuẩn AES-256-GCM ở phía máy chủ, không bao giờ lộ ra trình duyệt.
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
              <FileSpreadsheet size={16} className="text-emerald-600" />
              3. Quyền làm chủ và xuất dữ liệu
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Thầy/cô toàn quyền tải xuống toàn bộ dữ liệu của mình bất cứ lúc nào dưới định dạng bảng tính Excel (<code>.xlsx</code>) hoặc tệp sao lưu (<code>.json</code>) trong mục <strong>Cài đặt &gt; Tài khoản của tôi</strong>.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
              <Trash2 size={16} className="text-red-500" />
              4. Quyền xóa vĩnh viễn dữ liệu
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Khi thầy/cô thực hiện chức năng <strong>Xóa tài khoản</strong>, hệ thống sẽ xóa vĩnh viễn toàn bộ hồ sơ, lớp học, danh sách học sinh, điểm danh, giao dịch học phí, đồng thời hủy ngay lập tức các lịch gửi email hằng ngày và đồng bộ Google Calendar.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-gray-50 dark:bg-[#24262B] border-t border-gray-100 dark:border-[#2D2F34] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-[#32353C] transition-colors"
          >
            Đóng
          </button>
          {onAccept && (
            <button
              type="button"
              onClick={() => {
                onAccept()
                onClose()
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#1A73E8] hover:bg-[#1557B0] text-white shadow-xs transition-colors"
            >
              Tôi đã hiểu và Đồng ý
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

