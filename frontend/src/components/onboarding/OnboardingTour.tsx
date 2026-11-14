import { useEffect, useState, useCallback, useLayoutEffect, useRef } from 'react'
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
} from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { cn } from '../../lib/utils'

interface OnboardingStep {
  id: string
  title: string
  description: string
  tip?: string
  targetSelector: string
  icon: typeof Sparkles
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Chào mừng thầy/cô đến với Lịch Dạy!',
    description:
      'Ứng dụng giúp thầy/cô quản lý lịch dạy, điểm danh học sinh mỗi buổi và tính tiền học phí tự động ngay trên điện thoại hoặc máy tính.',
    tip: 'Chỉ mất chưa tới 1 phút để điểm qua 6 thao tác chính.',
    targetSelector: '[data-tour="app-brand"]',
    icon: Sparkles,
  },
  {
    id: 'classes_students',
    title: 'Cách thêm lớp học và học sinh',
    description:
      'Vào mục "Lớp & Điểm danh" để tạo lớp dạy thêm, đặt mức học phí mặc định mỗi buổi và thêm danh sách học sinh vào lớp.',
    tip: 'Thầy/cô có thể nhập từng em hoặc dán nhanh cả danh sách từ Excel/Zalo.',
    targetSelector: '[data-tour="nav-classes"]',
    icon: Users,
  },
  {
    id: 'schedule_extra',
    title: 'Cách xếp lịch dạy & lịch học phát sinh',
    description:
      'Mục "Lịch dạy" hiển thị thời khóa biểu cả tuần. Ngoài lịch cố định, thầy/cô có thể thêm "Lịch học phát sinh" trong từng lớp và đặt mức học phí riêng cho buổi đó.',
    tip: 'Ứng dụng tự động báo nếu buổi dạy thêm bị trùng với tiết dạy ở trường.',
    targetSelector: '[data-tour="nav-schedule"]',
    icon: Calendar,
  },
  {
    id: 'attendance',
    title: 'Cách điểm danh mỗi buổi học',
    description:
      'Chọn lớp học và bấm vào buổi dạy để chấm "Có mặt", "Vắng" hoặc "Có phép" chỉ với 1 chạm, kể cả các buổi học phát sinh.',
    tip: 'Thầy/cô cũng có thể ghi chú nội dung bài dạy ngay trong buổi điểm danh.',
    targetSelector: '[data-tour="nav-classes"]',
    icon: CheckCircle2,
  },
  {
    id: 'fees_filter',
    title: 'Xem học phí, lọc theo lớp & thu tiền',
    description:
      'Vào mục "Học phí" để xem tổng phải thu, đã thu và còn thiếu. Thầy/cô có thể lọc theo tháng, lọc riêng từng lớp và bấm ghi nhận khi phụ huynh đóng tiền.',
    tip: 'Có sẵn mẫu tin nhắn báo học phí lịch sự để sao chép gửi Zalo cho phụ huynh.',
    targetSelector: '[data-tour="nav-fees"]',
    icon: Wallet,
  },
  {
    id: 'settings_reopen',
    title: 'Cài đặt & nơi mở lại hướng dẫn này',
    description:
      'Mục "Cài đặt" dùng để chỉnh giờ tiết trường, thông báo Gmail và sao lưu dữ liệu. Bất cứ lúc nào muốn xem lại, thầy/cô hãy bấm nút "Hướng dẫn (?)" trên màn hình.',
    tip: 'Chúc thầy/cô có những giờ lên lớp thật hiệu quả và nhẹ nhàng!',
    targetSelector: '[data-tour="btn-onboarding-help"], [data-tour="nav-settings"]',
    icon: Settings,
  },
]

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

export function OnboardingTour() {
  const onboardingOpen = useAuthStore((s) => s.onboardingOpen)
  const closeOnboardingTour = useAuthStore((s) => s.closeOnboardingTour)

  const [stepIndex, setStepIndex] = useState(0)
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  }))
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState(260)

  // Reset to step 1 whenever the tour is opened
  useEffect(() => {
    if (onboardingOpen) {
      setStepIndex(0)
    }
  }, [onboardingOpen])

  const currentStep = ONBOARDING_STEPS[stepIndex] || ONBOARDING_STEPS[0]
  const totalSteps = ONBOARDING_STEPS.length
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === totalSteps - 1

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

  // Measure target element & viewport
  const updateTargetMeasurement = useCallback(() => {
    if (!onboardingOpen) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    setViewport({ width: vw, height: vh })

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
    if (cardRef.current) {
      setCardHeight(cardRef.current.offsetHeight || 260)
    }
  }, [onboardingOpen, stepIndex, updateTargetMeasurement])

  useEffect(() => {
    if (!onboardingOpen) return

    const onResizeOrScroll = () => {
      updateTargetMeasurement()
      if (cardRef.current) {
        setCardHeight(cardRef.current.offsetHeight || 260)
      }
    }

    window.addEventListener('resize', onResizeOrScroll, { passive: true })
    window.addEventListener('scroll', onResizeOrScroll, { passive: true, capture: true })
    return () => {
      window.removeEventListener('resize', onResizeOrScroll)
      window.removeEventListener('scroll', onResizeOrScroll, true)
    }
  }, [onboardingOpen, updateTargetMeasurement])

  // Keyboard navigation: Esc to close, ArrowRight/ArrowLeft to navigate
  useEffect(() => {
    if (!onboardingOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleCloseOrSkip()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrev()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onboardingOpen, handleCloseOrSkip, handleNext, handlePrev])

  if (!onboardingOpen) return null

  const StepIcon = currentStep.icon

  // Compute non-overlapping tooltip card position for both mobile and desktop
  const margin = 12
  const maxCardWidth = Math.min(380, viewport.width - margin * 2)
  let cardTop = Math.max(margin, Math.round((viewport.height - cardHeight) / 2))
  let cardLeft = Math.max(margin, Math.round((viewport.width - maxCardWidth) / 2))

  if (spotlightRect) {
    const gap = 14
    const targetBottom = spotlightRect.top + spotlightRect.height
    const targetRight = spotlightRect.left + spotlightRect.width
    const isDesktop = viewport.width >= 768

    if (isDesktop && spotlightRect.left < 280 && targetRight + gap + maxCardWidth <= viewport.width - margin) {
      // Target is in left sidebar on desktop/tablet -> place card to the right of the sidebar item
      cardLeft = targetRight + gap
      const idealTop = spotlightRect.top - 12
      cardTop = Math.max(
        margin,
        Math.min(idealTop, viewport.height - cardHeight - margin)
      )
    } else {
      // Center horizontally near target without overflowing screen
      const targetCenterX = spotlightRect.left + spotlightRect.width / 2
      cardLeft = Math.max(
        margin,
        Math.min(Math.round(targetCenterX - maxCardWidth / 2), viewport.width - maxCardWidth - margin)
      )

      const spaceBelow = viewport.height - targetBottom - margin
      const spaceAbove = spotlightRect.top - margin

      if (spaceBelow >= cardHeight + gap || spaceBelow >= spaceAbove) {
        // Place below target
        cardTop = Math.min(
          targetBottom + gap,
          Math.max(margin, viewport.height - cardHeight - margin)
        )
      } else {
        // Place above target (e.g., when highlighting bottom navigation on mobile)
        cardTop = Math.max(margin, spotlightRect.top - cardHeight - gap)
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] no-print select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-step-title"
    >
      {/* Dimmed Backdrop with SVG Spotlight Cutout (clicking outside dismisses cleanly) */}
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

      {/* Spotlight Focus Ring around target element (pointer-events-none so it never blocks) */}
      {spotlightRect && (
        <div
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
          }}
          className="fixed pointer-events-none rounded-[14px] ring-2 ring-[#1A73E8] dark:ring-[#8AB4F8] shadow-[0_0_0_4px_rgba(26,115,232,0.22)] motion-reduce:transition-none transition-all duration-150"
        />
      )}

      {/* Tooltip / Step Card */}
      <div
        ref={cardRef}
        style={{
          top: cardTop,
          left: cardLeft,
          width: maxCardWidth,
        }}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-[121] rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200 dark:border-[#2D2F34] shadow-2xl p-4 sm:p-5 text-gray-900 dark:text-gray-100 motion-reduce:transition-none"
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

        {/* Step Progress Dots */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-[#2D2F34]">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {ONBOARDING_STEPS.map((st, idx) => (
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

          {/* Navigation Buttons: Quay lại / Tiếp tục / Bắt đầu dùng */}
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
  )
}

