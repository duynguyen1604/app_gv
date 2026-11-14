import { ReactNode, useState, useEffect, useRef } from 'react'
import { ChevronLeft, Search, X, BookOpen, Users, HelpCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'
import { useAuthStore } from '../../store/useAuthStore'
import { cn } from '../../lib/utils'

interface TopBarProps {
  title: string
  subtitle?: string
  back?: boolean
  leftContent?: ReactNode
  rightContent?: ReactNode
  className?: string
  showGlobalSearch?: boolean
}

export function TopBar({
  title,
  subtitle,
  back,
  leftContent,
  rightContent,
  className,
  showGlobalSearch = true,
}: TopBarProps) {
  const navigate = useNavigate()
  const { classes, students } = useAppStore()
  const openOnboardingMenu = useAuthStore((s) => s.openOnboardingMenu)
  const [scrolled, setScrolled] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Add subtle shadow on scroll WITHOUT changing header height/padding/font-size or unmounting subtitle
  // (Prevents scroll-jump / jitter oscillation at scrollY ~ 24px on SettingsPage & ClassDetailPage)
  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 12
      setScrolled((prev) => (prev === next ? prev : next))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const q = searchQuery.trim().toLowerCase()
  const matchedClasses = q
    ? classes.filter(c => c.name.toLowerCase().includes(q) || c.location.toLowerCase().includes(q)).slice(0, 5)
    : []
  const matchedStudents = q
    ? students
        .filter(
          s =>
            s.name.toLowerCase().includes(q) ||
            (s.parent_name && s.parent_name.toLowerCase().includes(q)) ||
            (s.parent_phone && s.parent_phone.includes(q))
        )
        .slice(0, 6)
    : []

  return (
    <header
      style={{ overflowAnchor: 'none' }}
      className={cn(
        'sticky top-0 z-30 bg-white/95 dark:bg-[#1E1F22]/95 backdrop-blur-md border-b border-gray-200/80 dark:border-[#2D2F34] px-4 tablet:px-6 py-3 tablet:py-3.5 transition-shadow duration-150 no-print',
        scrolled && 'shadow-xs',
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 max-w-[1600px] mx-auto">
        {/* Left: Back button + Title */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {leftContent}
          {back && (
            <button
              onClick={() => navigate(-1)}
              aria-label="Quay lại"
              className="btn-icon -ml-1.5 text-gray-600 dark:text-gray-300 shrink-0"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <div className="min-w-0 flex-1" data-tour="app-brand">
            <h1 className="font-bold text-gray-900 dark:text-gray-100 leading-tight truncate text-lg tablet:text-xl">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Center/Right: Desktop Quick Search (Section 3.1) */}
        {showGlobalSearch && (
          <div ref={searchRef} className="hidden tablet:block relative w-64 desktop:w-80">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={e => {
                  setSearchQuery(e.target.value)
                  setSearchOpen(true)
                }}
                placeholder="Tìm nhanh lớp, học sinh, SĐT..."
                className="w-full rounded-full bg-gray-100 dark:bg-[#282A2E] border border-transparent focus:border-[#1A73E8] focus:bg-white dark:focus:bg-[#1E1F22] pl-9 pr-8 py-1.5 text-xs text-gray-800 dark:text-gray-200 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Xóa tìm kiếm"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {searchOpen && q.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 bg-white dark:bg-[#282A2E] rounded-xl shadow-lg border border-gray-200 dark:border-[#37393F] py-2 z-50 max-h-80 overflow-y-auto">
                {matchedClasses.length === 0 && matchedStudents.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-gray-400 text-center">
                    Không tìm thấy lớp hoặc học sinh phù hợp
                  </div>
                ) : (
                  <>
                    {matchedClasses.length > 0 && (
                      <div className="mb-1">
                        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          Lớp dạy thêm
                        </div>
                        {matchedClasses.map(cls => (
                          <button
                            key={cls.id}
                            onClick={() => {
                              setSearchOpen(false)
                              setSearchQuery('')
                              navigate(`/classes/${cls.id}`)
                            }}
                            className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-gray-100 dark:hover:bg-[#313338] text-xs"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: cls.color }}
                            />
                            <BookOpen size={13} className="text-gray-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-gray-800 dark:text-gray-200 truncate">
                                {cls.name}
                              </div>
                              {cls.location && (
                                <div className="text-[11px] text-gray-400 truncate">{cls.location}</div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {matchedStudents.length > 0 && (
                      <div>
                        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          Học sinh
                        </div>
                        {matchedStudents.map(st => {
                          const cls = classes.find(c => c.id === st.class_id)
                          return (
                            <button
                              key={st.id}
                              onClick={() => {
                                setSearchOpen(false)
                                setSearchQuery('')
                                navigate(`/classes/${st.class_id}`)
                              }}
                              className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-gray-100 dark:hover:bg-[#313338] text-xs"
                            >
                              <Users size={13} className="text-blue-500 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-gray-800 dark:text-gray-200 truncate">
                                  {st.name}
                                </div>
                                <div className="text-[11px] text-gray-400 truncate">
                                  {cls?.name || 'Lớp'} {st.parent_phone ? `· ${st.parent_phone}` : ''}
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Right Action Slot + Fixed Help / Onboarding Button */}
        <div className="flex items-center gap-2 shrink-0">
          {rightContent}
          <button
            type="button"
            onClick={openOnboardingMenu}
            data-tour="btn-onboarding-help"
            title="Xem hướng dẫn chi tiết từng trang"
            aria-label="Hướng dẫn sử dụng"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[#1A73E8] dark:text-[#8AB4F8] bg-blue-50/80 hover:bg-blue-100 dark:bg-[#1A73E8]/15 dark:hover:bg-[#1A73E8]/25 border border-blue-200/70 dark:border-blue-800/50 transition-colors"
          >
            <HelpCircle size={15} className="shrink-0" />
            <span className="hidden sm:inline">Hướng dẫn</span>
          </button>
        </div>
      </div>
    </header>
  )
}
