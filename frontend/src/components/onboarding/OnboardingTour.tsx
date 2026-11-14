import { useEffect, useState, useCallback, useLayoutEffect, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Users,
  Calendar,
  CheckCircle2,
  Wallet,
  Settings,
  HelpCircle,
  BookOpen,
  User,
  Compass,
  MousePointerClick,
} from 'lucide-react'
import { useAuthStore, type OnboardingScope } from '../../store/useAuthStore'
import { cn } from '../../lib/utils'

interface OnboardingStep {
  id: string
  route?: string
  title: string
  description: string
  tip?: string
  targetSelector: string
  icon: typeof Sparkles
}

const PAGE_GUIDE_META: Array<{
  scope: Exclude<OnboardingScope, 'full'>
  title: string
  subtitle: string
  route: string
  icon: typeof Calendar
  colorClass: string
}> = [
  {
    scope: 'schedule',
    title: 'Trang Lịch dạy',
    subtitle: 'Nút Hôm nay, chuyển tuần, tạo buổi phát sinh, dán Zalo & ảnh TKB',
    route: '/',
    icon: Calendar,
    colorClass: 'bg-blue-50 text-[#1A73E8] dark:bg-blue-950/60 dark:text-[#8AB4F8]',
  },
  {
    scope: 'classes',
    title: 'Trang Danh sách Lớp học',
    subtitle: 'Nút + Thêm lớp, Lịch học phát sinh có giá riêng & mở lớp điểm danh',
    route: '/classes',
    icon: BookOpen,
    colorClass: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
  },
  {
    scope: 'class_detail',
    title: 'Trang Chi tiết Lớp & Điểm danh',
    subtitle: 'Thêm học sinh, + Lịch phát sinh, nút Tất cả có mặt & chấm từng em',
    route: '/classes',
    icon: CheckCircle2,
    colorClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
  },
  {
    scope: 'fees',
    title: 'Trang Học phí & Công nợ',
    subtitle: 'Chọn tháng, lọc theo lớp, thu tiền, nhắn Zalo & Xuất Excel 5 sheet',
    route: '/fees',
    icon: Wallet,
    colorClass: 'bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-300',
  },
  {
    scope: 'settings',
    title: 'Trang Cài đặt hệ thống',
    subtitle: 'Chỉnh giờ tiết trường, thông báo Gmail, Sáng/Tối & sao lưu JSON',
    route: '/settings',
    icon: Settings,
    colorClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  {
    scope: 'profile',
    title: 'Trang Hồ sơ cá nhân',
    subtitle: 'Cập nhật thông tin giáo viên, đổi mật khẩu & quản lý bảo mật',
    route: '/profile',
    icon: User,
    colorClass: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300',
  },
]

const STEPS_BY_SCOPE: Record<OnboardingScope, OnboardingStep[]> = {
  schedule: [
    {
      id: 'sched-today',
      route: '/',
      title: 'Nút "Hôm nay" — Quay về ngày hiện tại',
      description:
        'Bấm nút "Hôm nay" bất cứ lúc nào để đưa lịch dạy về đúng ngày và tuần hiện tại.',
      tip: 'Trên máy tính, có thể bấm nhanh phím T.',
      targetSelector: '[data-tour="schedule-today"]',
      icon: Calendar,
    },
    {
      id: 'sched-arrows',
      route: '/',
      title: 'Nút "<" và ">" — Xem tuần trước / tuần sau',
      description:
        'Bấm hai nút mũi tên cạnh chữ Hôm nay để chuyển sang tuần kế tiếp hoặc quay lại tuần trước. Bấm vào tên tháng bên cạnh để mở lịch mini chọn nhanh ngày.',
      targetSelector: '[data-tour="schedule-nav-arrows"]',
      icon: Calendar,
    },
    {
      id: 'sched-views',
      route: '/',
      title: 'Chuyển chế độ xem (Ngày / Tuần / Tháng / Bảng)',
      description:
        'Trên máy tính, bấm các tab này để đổi kiểu hiển thị lịch. Trên điện thoại, giao diện tự tối ưu theo từng ngày giống Google Calendar.',
      targetSelector: '[data-tour="schedule-view-tabs"], [data-tour="schedule-today"]',
      icon: Compass,
    },
    {
      id: 'sched-create',
      route: '/',
      title: 'Nút "Thêm" / Dấu cộng (+) — Tạo buổi & Nhập AI',
      description:
        'Bấm nút này để chọn: "Thêm buổi phát sinh", "Dán tin nhắn Zalo / SMS" (AI tự đọc lịch hẹn/dời buổi) hoặc "Nhập lịch trường từ ảnh".',
      tip: 'Trên điện thoại, nút dấu cộng (+) nằm ở góc dưới bên phải màn hình.',
      targetSelector: '[data-tour="schedule-create-btn"]',
      icon: MousePointerClick,
    },
    {
      id: 'sched-display',
      route: '/',
      title: 'Nút Cài đặt hiển thị & Xuất ảnh / In lịch',
      description:
        'Bấm biểu tượng thanh trượt này để chỉnh khung giờ hiển thị, xuất ảnh lịch tuần (.PNG), sao chép buổi dời/hủy sang tuần sau hoặc in lịch dạy.',
      targetSelector: '[data-tour="schedule-display-btn"]',
      icon: Settings,
    },
  ],

  classes: [
    {
      id: 'cls-add',
      route: '/classes',
      title: 'Nút "+ Thêm lớp" — Tạo lớp dạy thêm mới',
      description:
        'Bấm nút "+ Thêm lớp" ở góc trên để tạo lớp mới, nhập tên lớp, địa điểm dạy và mức học phí mặc định mỗi buổi.',
      targetSelector: '[data-tour="classes-add-btn"]',
      icon: BookOpen,
    },
    {
      id: 'cls-extra',
      route: '/classes',
      title: 'Nút "Lịch học phát sinh" — Dạy tăng cường / dạy bù',
      description:
        'Bấm nút màu tím "Lịch học phát sinh" để thêm buổi ngoài lịch cố định. Có ô "Học phí buổi này": nhập số tiền nếu muốn thu giá riêng, hoặc để trống để giữ giá mặc định của lớp.',
      tip: 'Có thể bấm sửa hoặc xóa từng buổi phát sinh ngay trên thẻ lớp.',
      targetSelector: '[data-tour="classes-extra-btn"], [data-tour="classes-add-btn"]',
      icon: Sparkles,
    },
    {
      id: 'cls-open',
      route: '/classes',
      title: 'Mở một lớp để thêm học sinh & điểm danh',
      description:
        'Bấm vào tên bất kỳ lớp nào trong danh sách để vào trang Chi tiết lớp: tại đó có nút thêm học sinh, dán danh sách hàng loạt và điểm danh từng buổi.',
      targetSelector: '[data-tour="nav-classes"]',
      icon: Users,
    },
  ],

  class_detail: [
    {
      id: 'cd-add-student',
      title: 'Nút "+ Thêm học sinh" — Nhập danh sách lớp',
      description:
        'Bấm "+ Thêm học sinh" (hoặc mở tab Học sinh) để thêm từng em hoặc dán nhanh cả danh sách họ tên, SĐT phụ huynh từ Excel/Zalo.',
      targetSelector: '[data-tour="classdetail-addstudent-btn"], [data-tour="nav-classes"]',
      icon: Users,
    },
    {
      id: 'cd-extra',
      title: 'Nút "+ Lịch phát sinh" trong lớp',
      description:
        'Bấm "+ Lịch phát sinh" để tạo thêm buổi dạy bù hoặc tăng cường cho riêng lớp này, kèm tùy chọn nhập "Học phí buổi này" nếu khác giá mặc định.',
      targetSelector: '[data-tour="classdetail-extra-btn"], [data-tour="nav-classes"]',
      icon: Sparkles,
    },
    {
      id: 'cd-all-present',
      title: 'Nút "Tất cả có mặt" — Điểm danh 1 chạm',
      description:
        'Chọn buổi học cần điểm danh rồi bấm "Tất cả có mặt" để đánh dấu nhanh cả lớp, sau đó chỉ cần chạm đổi trạng thái "Vắng" hoặc "Có phép" cho vài em nghỉ.',
      tip: 'Đừng quên gõ nội dung bài dạy vào ô Ghi chú buổi học bên dưới.',
      targetSelector: '[data-tour="classdetail-allpresent-btn"], [data-tour="nav-classes"]',
      icon: CheckCircle2,
    },
  ],

  fees: [
    {
      id: 'fees-mode',
      route: '/fees',
      title: 'Thanh chế độ: Theo tháng / Công nợ / Biểu đồ',
      description:
        'Chọn "Theo tháng" để xem bảng học phí tháng đang chọn, "Công nợ" để xem danh sách học sinh còn nợ lâu ngày, hoặc "Biểu đồ thu nhập" để so sánh giữa các lớp.',
      targetSelector: '[data-tour="fees-mode-tabs"]',
      icon: Wallet,
    },
    {
      id: 'fees-month',
      route: '/fees',
      title: 'Ô Chọn tháng cần tính học phí',
      description:
        'Bấm vào ô chọn tháng để xem lại học phí các tháng trước hoặc tháng hiện tại. Học phí được tính tự động theo số buổi "Có mặt" thực tế.',
      targetSelector: '[data-tour="fees-month-select"]',
      icon: Calendar,
    },
    {
      id: 'fees-class',
      route: '/fees',
      title: 'Bộ lọc "Tất cả lớp" — Lọc học phí theo từng lớp',
      description:
        'Chọn một lớp cụ thể để danh sách học sinh và các số tổng (Phải thu, Đã thu, Còn thiếu) chỉ tính riêng cho lớp đó, dùng kết hợp với bộ lọc tháng.',
      targetSelector: '[data-tour="fees-class-filter"]',
      icon: BookOpen,
    },
    {
      id: 'fees-export',
      route: '/fees',
      title: 'Nút "Xuất Excel (5 sheet)" & Nút Thu tiền / Zalo',
      description:
        'Bấm nút xanh lá "Xuất Excel" để tải bảng tính đầy đủ. Ở bảng bên dưới, bấm "Thu tiền" cạnh tên học sinh để ghi nhận phụ huynh đóng tiền, hoặc bấm biểu tượng tin nhắn để chép mẫu nhắc Zalo.',
      targetSelector: '[data-tour="fees-export-excel"]',
      icon: Wallet,
    },
  ],

  settings: [
    {
      id: 'set-cats',
      route: '/settings',
      title: 'Các nhóm Cài đặt hệ thống',
      description:
        'Chọn từng mục để cài đặt: "Bảng giờ tiết trường" (S1–C5), "Thông báo Gmail" nhắc lịch dạy mỗi sáng, "Google Calendar & AI", "Giao diện Sáng/Tối" và "Sao lưu JSON".',
      targetSelector: '[data-tour="settings-categories"]',
      icon: Settings,
    },
    {
      id: 'set-help',
      route: '/settings',
      title: 'Nút "Hướng dẫn (?)" — Mở lại bất cứ lúc nào',
      description:
        'Bấm nút "Hướng dẫn" ở đầu trang, trên thanh menu hoặc trong thẻ tài khoản để xem hướng dẫn chi tiết của riêng từng trang bất cứ khi nào cần.',
      targetSelector: '[data-tour="btn-onboarding-help"]',
      icon: HelpCircle,
    },
  ],

  profile: [
    {
      id: 'prof-main',
      route: '/profile',
      title: 'Quản lý Hồ sơ & Bảo mật tài khoản',
      description:
        'Tại đây thầy/cô có thể cập nhật họ tên, trường học, số điện thoại, đổi mật khẩu đăng nhập hoặc bấm đăng xuất khỏi các thiết bị khác.',
      targetSelector: '[data-tour="nav-profile"], [data-tour="app-brand"]',
      icon: User,
    },
  ],

  full: [
    {
      id: 'full-welcome',
      route: '/',
      title: 'Chào mừng thầy/cô đến với Lịch Dạy!',
      description:
        'Hướng dẫn này sẽ đi lần lượt qua từng trang và chỉ rõ từng nút bấm chính: Lịch dạy, Lớp & Điểm danh, Học phí và Cài đặt.',
      tip: 'Có thể bấm "Bỏ qua" bất cứ lúc nào hoặc bấm nút "Hướng dẫn (?)" sau để xem riêng từng trang.',
      targetSelector: '[data-tour="app-brand"]',
      icon: Sparkles,
    },
    {
      id: 'full-sched-today',
      route: '/',
      title: 'Trang Lịch dạy: Nút "Hôm nay" & Chuyển tuần',
      description:
        'Bấm "Hôm nay" để quay về ngày hiện tại, hoặc bấm hai nút mũi tên "<" ">" để xem lịch tuần trước và tuần sau.',
      targetSelector: '[data-tour="schedule-today"]',
      icon: Calendar,
    },
    {
      id: 'full-sched-create',
      route: '/',
      title: 'Trang Lịch dạy: Nút "Thêm" / Dấu cộng (+)',
      description:
        'Bấm nút này để tạo Buổi phát sinh, Dán tin nhắn Zalo (AI tự hiểu lịch hẹn/dời) hoặc Quét ảnh Thời khóa biểu trường.',
      targetSelector: '[data-tour="schedule-create-btn"]',
      icon: MousePointerClick,
    },
    {
      id: 'full-classes-add',
      route: '/classes',
      title: 'Trang Lớp học: Nút "+ Thêm lớp" & "Lịch học phát sinh"',
      description:
        'Bấm "+ Thêm lớp" để tạo lớp mới. Khi có buổi dạy bù/tăng cường ngoài lịch cố định, bấm "Lịch học phát sinh" (có thể nhập "Học phí buổi này" riêng hoặc để trống dùng giá mặc định).',
      targetSelector: '[data-tour="classes-add-btn"]',
      icon: BookOpen,
    },
    {
      id: 'full-classes-attendance',
      route: '/classes',
      title: 'Cách vào Điểm danh từng buổi',
      description:
        'Bấm trực tiếp vào một lớp bất kỳ để thêm học sinh (nhập tay hoặc dán danh sách) và chấm điểm danh "Có mặt / Vắng / Có phép" chỉ với 1 chạm.',
      targetSelector: '[data-tour="nav-classes"]',
      icon: CheckCircle2,
    },
    {
      id: 'full-fees-filter',
      route: '/fees',
      title: 'Trang Học phí: Chọn Tháng & Bộ lọc theo Lớp',
      description:
        'Chọn tháng và lọc theo từng lớp (hoặc "Tất cả lớp"). Hệ thống tự động cộng đúng số buổi có mặt (kể cả buổi phát sinh có giá riêng) để ra số Phải thu, Đã thu và Còn thiếu.',
      targetSelector: '[data-tour="fees-class-filter"]',
      icon: Wallet,
    },
    {
      id: 'full-fees-export',
      route: '/fees',
      title: 'Trang Học phí: Thu tiền, Nhắn Zalo & Xuất Excel',
      description:
        'Bấm "Thu tiền" ở từng học sinh khi phụ huynh đóng học phí, bấm biểu tượng tin nhắn để chép lời nhắc Zalo hoặc bấm "Xuất Excel (5 sheet)" ở góc trên.',
      targetSelector: '[data-tour="fees-export-excel"]',
      icon: Wallet,
    },
    {
      id: 'full-settings',
      route: '/settings',
      title: 'Trang Cài đặt & Nút "Hướng dẫn (?)" theo từng trang',
      description:
        'Vào Cài đặt để chỉnh giờ tiết trường, thông báo Gmail và sao lưu dữ liệu. Bất cứ lúc nào muốn xem lại hướng dẫn chi tiết của riêng một trang, hãy bấm nút "Hướng dẫn (?)" ở góc trên!',
      targetSelector: '[data-tour="btn-onboarding-help"]',
      icon: Settings,
    },
  ],
}

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

function findVisibleTargetElement(selectorList: string): HTMLElement | null {
  const selectors = selectorList
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector))
    for (const el of nodes) {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      if (
        rect.width > 4 &&
        rect.height > 4 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth
      ) {
        return el
      }
    }
  }
  return null
}

function detectCurrentPageScope(pathname: string): Exclude<OnboardingScope, 'full'> {
  if (pathname.startsWith('/classes/') && pathname !== '/classes/') return 'class_detail'
  if (pathname.startsWith('/classes')) return 'classes'
  if (pathname.startsWith('/fees')) return 'fees'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/profile')) return 'profile'
  return 'schedule'
}

export function OnboardingTour() {
  const location = useLocation()
  const navigate = useNavigate()

  const onboardingOpen = useAuthStore((s) => s.onboardingOpen)
  const onboardingScope = useAuthStore((s) => s.onboardingScope)
  const onboardingMenuOpen = useAuthStore((s) => s.onboardingMenuOpen)
  const openOnboardingTour = useAuthStore((s) => s.openOnboardingTour)
  const closeOnboardingMenu = useAuthStore((s) => s.closeOnboardingMenu)
  const closeOnboardingTour = useAuthStore((s) => s.closeOnboardingTour)

  const steps = useMemo(
    () => STEPS_BY_SCOPE[onboardingScope] || STEPS_BY_SCOPE.full,
    [onboardingScope]
  )

  const [stepIndex, setStepIndex] = useState(0)
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null)

  // Reset to step 1 whenever the tour opens or scope changes
  useEffect(() => {
    if (onboardingOpen) {
      setStepIndex(0)
    }
  }, [onboardingOpen, onboardingScope])

  const currentStep = steps[stepIndex] || steps[0]
  const totalSteps = steps.length
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === totalSteps - 1

  // Navigate to the step's route automatically when stepping across pages
  useEffect(() => {
    if (!onboardingOpen || !currentStep?.route) return
    const targetRoute = currentStep.route
    const isScheduleAlias =
      targetRoute === '/' &&
      (location.pathname === '/' || location.pathname === '/schedule')
    if (!isScheduleAlias && location.pathname !== targetRoute) {
      navigate(targetRoute)
    }
  }, [onboardingOpen, currentStep?.route, location.pathname, navigate])

  const handleCloseOrSkip = useCallback(() => {
    void closeOnboardingTour()
  }, [closeOnboardingTour])

  const handleNext = useCallback(() => {
    if (stepIndex < totalSteps - 1) {
      setStepIndex((prev) => prev + 1)
    } else {
      void closeOnboardingTour()
    }
  }, [stepIndex, totalSteps, closeOnboardingTour])

  const handlePrev = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex((prev) => prev - 1)
    }
  }, [stepIndex])

  // Measure target element & viewport (re-measures after route transitions)
  const updateTargetMeasurement = useCallback(() => {
    if (!onboardingOpen) return
    const vw = window.innerWidth
    const vh = window.innerHeight

    const el = findVisibleTargetElement(currentStep.targetSelector)
    if (!el) {
      setSpotlightRect(null)
      return
    }

    const r = el.getBoundingClientRect()
    const pad = 6
    setSpotlightRect({
      top: Math.max(4, r.top - pad),
      left: Math.max(4, r.left - pad),
      width: Math.min(vw - 8, r.width + pad * 2),
      height: Math.min(vh - 8, r.height + pad * 2),
    })
  }, [onboardingOpen, currentStep.targetSelector])

  useLayoutEffect(() => {
    if (!onboardingOpen) return
    updateTargetMeasurement()
    const timer = window.setTimeout(() => {
      updateTargetMeasurement()
    }, 120)
    return () => window.clearTimeout(timer)
  }, [onboardingOpen, stepIndex, location.pathname, updateTargetMeasurement])

  useEffect(() => {
    if (!onboardingOpen) return

    const onResizeOrScroll = () => {
      updateTargetMeasurement()
    }

    window.addEventListener('resize', onResizeOrScroll, { passive: true })
    window.addEventListener('scroll', onResizeOrScroll, { passive: true, capture: true })
    return () => {
      window.removeEventListener('resize', onResizeOrScroll)
      window.removeEventListener('scroll', onResizeOrScroll, true)
    }
  }, [onboardingOpen, updateTargetMeasurement])

  // Keyboard navigation: Esc closes tour or menu, ArrowRight/ArrowLeft navigate steps
  useEffect(() => {
    if (!onboardingOpen && !onboardingMenuOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (onboardingMenuOpen) {
          closeOnboardingMenu()
        } else {
          handleCloseOrSkip()
        }
      } else if (onboardingOpen && e.key === 'ArrowRight') {
        e.preventDefault()
        handleNext()
      } else if (onboardingOpen && e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrev()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    onboardingOpen,
    onboardingMenuOpen,
    closeOnboardingMenu,
    handleCloseOrSkip,
    handleNext,
    handlePrev,
  ])

  const currentScope = detectCurrentPageScope(location.pathname)
  const currentMeta =
    PAGE_GUIDE_META.find((m) => m.scope === currentScope) || PAGE_GUIDE_META[0]

  // 1. Page Guide Picker Menu (when user clicks "Hướng dẫn (?)")
  if (onboardingMenuOpen) {
    return (
      <div
        className="fixed inset-0 z-[125] flex items-center justify-center p-3 sm:p-4 bg-slate-900/55 backdrop-blur-xs no-print"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-menu-title"
        onClick={closeOnboardingMenu}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200 dark:border-[#2D2F34] shadow-2xl overflow-hidden text-gray-900 dark:text-gray-100"
        >
          <div className="px-5 py-4 border-b border-gray-100 dark:border-[#2D2F34] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-[#1A73E8]/15 text-[#1A73E8] dark:text-[#8AB4F8] flex items-center justify-center shrink-0">
                <HelpCircle size={20} />
              </div>
              <div className="min-w-0">
                <h2
                  id="onboarding-menu-title"
                  className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate"
                >
                  Hướng dẫn sử dụng từng trang
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  Chọn trang muốn xem chỉ dẫn từng nút bấm chi tiết
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeOnboardingMenu}
              aria-label="Đóng"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#282A2E]"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Primary button for current page */}
            <button
              type="button"
              onClick={() => openOnboardingTour(currentScope)}
              className="w-full text-left p-3.5 rounded-2xl bg-gradient-to-r from-[#1A73E8] to-[#2563EB] hover:from-[#1557B0] hover:to-[#1D4ED8] text-white shadow-sm flex items-center justify-between gap-3 transition-colors motion-reduce:transition-none"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <MousePointerClick size={20} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-blue-100 uppercase tracking-wider">
                    Trang đang mở
                  </div>
                  <div className="text-sm font-bold truncate">
                    Hướng dẫn chi tiết: {currentMeta.title}
                  </div>
                </div>
              </div>
              <ChevronRight size={18} className="shrink-0" />
            </button>

            {/* List of individual page guides */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 px-1">
                Hoặc chọn hướng dẫn của trang khác
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PAGE_GUIDE_META.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.scope}
                      type="button"
                      onClick={() => {
                        if (item.scope !== 'class_detail' && location.pathname !== item.route) {
                          navigate(item.route)
                        }
                        openOnboardingTour(item.scope)
                      }}
                      className="text-left p-3 rounded-xl border border-gray-200/80 dark:border-[#2D2F34] hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/40 dark:hover:bg-[#282A2E] transition-colors flex items-start gap-2.5 motion-reduce:transition-none"
                    >
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                          item.colorClass
                        )}
                      >
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-gray-900 dark:text-white truncate">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                          {item.subtitle}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Full guided tour button */}
            <div className="pt-2 border-t border-gray-100 dark:border-[#2D2F34] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  if (location.pathname !== '/') navigate('/')
                  openOnboardingTour('full')
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gray-100 hover:bg-gray-200 dark:bg-[#282A2E] dark:hover:bg-[#313338] text-gray-800 dark:text-gray-100 flex items-center justify-center gap-2 transition-colors motion-reduce:transition-none"
              >
                <Compass size={15} className="text-[#1A73E8] dark:text-[#8AB4F8]" />
                <span>Xem toàn bộ hướng dẫn từ đầu (tự đi qua từng trang)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!onboardingOpen) return null

  const StepIcon = currentStep.icon

  return (
    <div
      className="fixed inset-0 z-[120] no-print select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-step-title"
    >
      {/* Dimmed Backdrop with SVG Spotlight Cutout */}
      <svg
        className="fixed inset-0 w-full h-full cursor-pointer"
        onClick={handleCloseOrSkip}
        aria-label="Đóng hướng dẫn"
      >
        <defs>
          <mask id="onboarding-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotlightRect && (
              <rect
                x={spotlightRect.left}
                y={spotlightRect.top}
                width={spotlightRect.width}
                height={spotlightRect.height}
                rx="14"
                ry="14"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.62)"
          mask="url(#onboarding-spotlight-mask)"
        />
      </svg>

      {/* Spotlight Focus Ring around target button/element */}
      {spotlightRect && (
        <div
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
          }}
          className="fixed pointer-events-none rounded-[14px] ring-2 ring-[#1A73E8] dark:ring-[#8AB4F8] shadow-[0_0_0_4px_rgba(26,115,232,0.24)] motion-reduce:transition-none transition-all duration-150"
        />
      )}

      {/* Centered Popup Step Card */}
      <div className="fixed inset-0 z-[121] flex items-center justify-center p-4 pointer-events-none">
        <div
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto w-full max-w-[420px] rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200 dark:border-[#2D2F34] shadow-2xl p-4 sm:p-5 text-gray-900 dark:text-gray-100 motion-reduce:transition-none"
        >
        {/* Top Header: Progress badge + Skip + Close X */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-[#1A73E8]/15 text-[#1A73E8] dark:text-[#8AB4F8] text-xs font-bold">
            <HelpCircle size={13} className="shrink-0" />
            <span>
              Bước {stepIndex + 1}/{totalSteps}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCloseOrSkip}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#282A2E] transition-colors motion-reduce:transition-none"
            >
              Bỏ qua
            </button>
            <button
              type="button"
              onClick={handleCloseOrSkip}
              aria-label="Đóng hướng dẫn"
              title="Đóng (Esc)"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#282A2E] transition-colors motion-reduce:transition-none"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Step Title & Icon */}
        <div className="flex items-start gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-blue-600/10 dark:bg-blue-500/15 text-[#1A73E8] dark:text-[#8AB4F8] flex items-center justify-center shrink-0 mt-0.5">
            <StepIcon size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <h3
              id="onboarding-step-title"
              className="text-sm sm:text-base font-bold text-gray-900 dark:text-white leading-snug"
            >
              {currentStep.title}
            </h3>
          </div>
        </div>

        {/* Step Description */}
        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2.5">
          {currentStep.description}
        </p>

        {/* Optional concise tip */}
        {currentStep.tip && (
          <div className="rounded-xl bg-gray-50 dark:bg-[#282A2E] border border-gray-200/70 dark:border-[#37393F] px-3 py-2 text-[11px] sm:text-xs text-gray-600 dark:text-gray-300 mb-3.5">
            💡 {currentStep.tip}
          </div>
        )}

        {/* Step Progress Dots & Controls */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-[#2D2F34]">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {steps.map((st, idx) => (
              <span
                key={st.id}
                className={cn(
                  'h-1.5 rounded-full transition-all motion-reduce:transition-none',
                  idx === stepIndex
                    ? 'w-5 bg-[#1A73E8] dark:bg-[#8AB4F8]'
                    : idx < stepIndex
                      ? 'w-1.5 bg-blue-300 dark:bg-blue-700'
                      : 'w-1.5 bg-gray-200 dark:bg-gray-700'
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                type="button"
                onClick={handlePrev}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-[#282A2E] dark:hover:bg-[#313338] transition-colors motion-reduce:transition-none"
              >
                <ChevronLeft size={14} />
                <span>Quay lại</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-[#1A73E8] hover:bg-[#1557B0] shadow-xs transition-colors motion-reduce:transition-none"
            >
              <span>{isLastStep ? 'Bắt đầu dùng' : 'Tiếp tục'}</span>
              {!isLastStep && <ChevronRight size={14} />}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
