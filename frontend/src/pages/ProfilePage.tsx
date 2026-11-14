import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  User,
  Mail,
  Phone,
  Building2,
  ShieldCheck,
  KeyRound,
  Smartphone,
  LogOut,
  CheckCircle2,
  Clock,
  Lock,
  Save,
  Eye,
  EyeOff,
  Download,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Users,
  Ticket,
  History,
  Settings,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/useAuthStore'
import { useAppStore } from '../store/useAppStore'
import {
  apiChangeMyPassword,
  apiDeleteMyAccount,
  apiGetMyProfileSecurity,
  apiRevokeOtherSessions,
  apiUpdateMyProfile,
} from '../lib/supabase'
import {
  PasswordStrengthMeter,
  evaluatePasswordStrength,
} from '../components/auth/PasswordStrengthMeter'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Modal } from '../components/ui/Modal'
import type { AccountSecuritySummary } from '../types'

function formatVNDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Chưa ghi nhận'
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function ProfilePage() {
  const navigate = useNavigate()
  const {
    profile,
    sessionToken,
    rememberMe,
    setRememberMe,
    updateProfileState,
    setAuthenticatedSession,
    logout,
  } = useAuthStore()

  const { classes, students, scheduleRules } = useAppStore()

  const [security, setSecurity] = useState<AccountSecuritySummary>({
    hasPassword: true,
    tokenVersion: 1,
    isFixedServerAdmin: profile?.role === 'admin',
    adminEmailConfigured: profile?.email || '',
  })

  // Profile form state
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [school, setSchool] = useState(profile?.school || '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '')
  const [savingProfile, setSavingProfile] = useState(false)

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [confirmPasswordModal, setConfirmPasswordModal] = useState(false)

  // Session & Account actions
  const [confirmRevokeOtherOpen, setConfirmRevokeOtherOpen] = useState(false)
  const [revokingSessions, setRevokingSessions] = useState(false)
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false)

  // Teacher self-delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '')
      setPhone(profile.phone || '')
      setSchool(profile.school || '')
      setAvatarUrl(profile.avatar_url || '')
    }
  }, [profile])

  useEffect(() => {
    if (!sessionToken) return
    void apiGetMyProfileSecurity(sessionToken)
      .then((res) => {
        setSecurity(res.security)
        void updateProfileState(res.profile)
      })
      .catch(() => undefined)
  }, [sessionToken, updateProfileState])

  if (!profile) return null

  const isAdmin = profile.role === 'admin'
  const initials =
    (profile.full_name || 'GV')
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') || 'GV'

  const activeClassesCount = classes.length
  const activeStudentsCount = students.filter((s) => s.status !== 'left').length
  const weeklySessionsCount = scheduleRules.length

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionToken) return
    if (fullName.trim().length < 2) {
      toast.error('Họ và tên phải có ít nhất 2 ký tự.')
      return
    }
    setSavingProfile(true)
    try {
      const res = await apiUpdateMyProfile(sessionToken, {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        school: school.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      })
      await updateProfileState(res.profile)
      toast.success(res.message)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể lưu hồ sơ.')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleRequestPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (security.hasPassword && !currentPassword) {
      toast.error('Vui lòng nhập mật khẩu hiện tại.')
      return
    }
    const strength = evaluatePasswordStrength(newPassword)
    if (!strength.isValid) {
      toast.error('Mật khẩu mới chưa đáp ứng yêu cầu an toàn (tối thiểu 8 ký tự, gồm chữ và số).')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Mật khẩu nhập lại không khớp.')
      return
    }
    setConfirmPasswordModal(true)
  }

  const executeChangePassword = async () => {
    if (!sessionToken) return
    setSavingPassword(true)
    try {
      const res = await apiChangeMyPassword(sessionToken, {
        currentPassword: security.hasPassword ? currentPassword : undefined,
        newPassword,
      })
      await setAuthenticatedSession({
        profile: res.profile,
        sessionToken: res.sessionToken,
        expiresAt: res.expiresAt,
        rememberMe,
      })
      setSecurity((prev) => ({
        ...prev,
        hasPassword: true,
        tokenVersion: prev.tokenVersion + 1,
      }))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success(res.message)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể đổi mật khẩu.')
    } finally {
      setSavingPassword(false)
    }
  }

  const executeRevokeOtherSessions = async () => {
    if (!sessionToken) return
    setRevokingSessions(true)
    try {
      const res = await apiRevokeOtherSessions(sessionToken)
      await setAuthenticatedSession({
        profile: res.profile,
        sessionToken: res.sessionToken,
        expiresAt: res.expiresAt,
        rememberMe,
      })
      setSecurity((prev) => ({
        ...prev,
        tokenVersion: prev.tokenVersion + 1,
      }))
      toast.success(res.message)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể thu hồi phiên khác.')
    } finally {
      setRevokingSessions(false)
    }
  }

  const handleExportPersonalBackup = () => {
    const st = useAppStore.getState()
    const payload = {
      exported_at: new Date().toISOString(),
      user_email: profile.email,
      classes: st.classes,
      students: st.students,
      studentEnrollments: st.studentEnrollments,
      studentStatusHistory: st.studentStatusHistory,
      sessionGuests: st.sessionGuests,
      scheduleRules: st.scheduleRules,
      sessionExceptions: st.sessionExceptions,
      extraSessions: st.extraSessions,
      attendance: st.attendance,
      paymentTransactions: st.paymentTransactions,
      schoolSchedule: st.schoolSchedule,
      schoolPeriods: st.schoolPeriods,
      schoolWeekConfigs: st.schoolWeekConfigs,
      holidays: st.holidays,
      settings: st.settings,
    }
    const json = JSON.stringify(payload, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sao-luu-lich-day-${profile.email.split('@')[0]}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Đã tải xuống tệp sao lưu dữ liệu cá nhân (.json)!')
  }

  const handleSelfDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionToken) return
    setDeletingAccount(true)
    try {
      const res = await apiDeleteMyAccount(sessionToken, {
        password: deletePassword,
        confirmText: deleteConfirmText,
      })
      toast.success(res.message)
      setDeleteModalOpen(false)
      await logout()
      navigate('/auth/login', { replace: true })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể xóa tài khoản.')
    } finally {
      setDeletingAccount(false)
    }
  }

  const providerLabel =
    profile.auth_provider === 'both'
      ? 'Email + Google OAuth'
      : profile.auth_provider === 'google'
      ? 'Google OAuth'
      : 'Email & Mật khẩu'

  return (
    <div className="p-4 tablet:p-6 desktop:p-8 max-w-5xl mx-auto w-full space-y-6 pb-24 tablet:pb-10">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl tablet:text-2xl font-bold text-gray-900 dark:text-white">
              Hồ sơ & Bảo mật Tài khoản
            </h1>
            {isAdmin ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950/80 text-[#1A73E8] dark:text-[#8AB4F8] border border-blue-200 dark:border-blue-800/60">
                <ShieldCheck size={13} />
                Quản trị viên Hệ thống
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                <User size={13} />
                Tài khoản Giáo viên
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {isAdmin
              ? 'Quản lý thông tin định danh Quản trị viên cố định, mật khẩu bảo mật và phiên đăng nhập hệ thống.'
              : 'Quản lý thông tin cá nhân, trường/đơn vị công tác, mật khẩu và thiết bị đăng nhập của thầy/cô.'}
          </p>
        </div>

        {isAdmin && (
          <Link
            to="/admin"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs sm:text-sm font-semibold shadow-sm transition-colors shrink-0"
          >
            <ShieldCheck size={17} />
            Mở Bảng điều khiển Quản trị
          </Link>
        )}
      </div>

      {/* Top Identity Summary Card */}
      <div className="rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200/80 dark:border-[#2D2F34] shadow-xs p-5 tablet:p-6">
        <div className="flex flex-col tablet:flex-row tablet:items-center gap-5">
          {/* Avatar */}
          <div className="relative shrink-0 self-start tablet:self-center">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                className="w-20 h-20 rounded-2xl object-cover border-2 border-[#1A73E8]/30 shadow-sm"
              />
            ) : (
              <div
                className={
                  isAdmin
                    ? 'w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1A73E8] to-indigo-600 text-white flex items-center justify-center font-extrabold text-2xl shadow-md'
                    : 'w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-600 text-white flex items-center justify-center font-extrabold text-2xl shadow-md'
                }
              >
                {initials}
              </div>
            )}
            <span
              title="Tài khoản đang hoạt động"
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center ring-4 ring-white dark:ring-[#1E1F22]"
            >
              <CheckCircle2 size={14} />
            </span>
          </div>

          {/* Identity Details */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg tablet:text-xl font-bold text-gray-900 dark:text-white truncate">
                {profile.full_name}
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/50">
                <CheckCircle2 size={11} />
                Đã xác minh Email
              </span>
              {isAdmin && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/50">
                  <Lock size={11} />
                  ADMIN_EMAIL cố định phía Server
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs sm:text-sm text-gray-600 dark:text-gray-300">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Mail size={14} className="text-gray-400" />
                {profile.email}
              </span>
              {profile.school && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 size={14} className="text-gray-400" />
                  {profile.school}
                </span>
              )}
              {profile.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={14} className="text-gray-400" />
                  {profile.phone}
                </span>
              )}
            </div>

            <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
              <span className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-[#282A2E] font-medium">
                Phương thức: <strong>{providerLabel}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-[#282A2E] font-medium inline-flex items-center gap-1">
                <Clock size={12} />
                Tham gia: {formatVNDateTime(profile.created_at)}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-[#282A2E] font-medium">
                Đăng nhập gần nhất: {formatVNDateTime(profile.last_login_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Role-specific quick bar inside identity card */}
        {isAdmin ? (
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-[#2D2F34] grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Link
              to="/admin?tab=accounts"
              className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50/70 dark:bg-[#1A73E8]/15 hover:bg-blue-100/80 dark:hover:bg-[#1A73E8]/25 text-[#1A73E8] dark:text-[#8AB4F8] transition-colors"
            >
              <Users size={18} className="shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">Duyệt & Quản lý GV</div>
                <div className="text-[11px] opacity-80 truncate">Phê duyệt, khóa, mở khóa</div>
              </div>
            </Link>
            <Link
              to="/admin?tab=invites"
              className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 hover:bg-purple-100/80 text-purple-700 dark:text-purple-300 transition-colors"
            >
              <Ticket size={18} className="shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">Mã mời Giáo viên</div>
                <div className="text-[11px] opacity-80 truncate">Cấp mã & link đăng ký</div>
              </div>
            </Link>
            <Link
              to="/admin?tab=settings"
              className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100/80 text-amber-800 dark:text-amber-300 transition-colors"
            >
              <Settings size={18} className="shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">Chế độ Đăng ký</div>
                <div className="text-[11px] opacity-80 truncate">Cấu hình mở / chờ duyệt</div>
              </div>
            </Link>
            <Link
              to="/admin?tab=audit"
              className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100/80 text-emerald-800 dark:text-emerald-300 transition-colors"
            >
              <History size={18} className="shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">Nhật ký Bảo mật</div>
                <div className="text-[11px] opacity-80 truncate">Tra cứu kiểm toán</div>
              </div>
            </Link>
          </div>
        ) : (
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-[#2D2F34] grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-[#24262B] border border-gray-100 dark:border-[#2D2F34]">
              <div className="text-[11px] text-gray-500 dark:text-gray-400">Số lớp đang quản lý</div>
              <div className="text-lg font-extrabold text-gray-900 dark:text-white mt-0.5">
                {activeClassesCount} lớp
              </div>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-[#24262B] border border-gray-100 dark:border-[#2D2F34]">
              <div className="text-[11px] text-gray-500 dark:text-gray-400">Học sinh đang theo học</div>
              <div className="text-lg font-extrabold text-[#1A73E8] dark:text-[#8AB4F8] mt-0.5">
                {activeStudentsCount} học sinh
              </div>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-[#24262B] border border-gray-100 dark:border-[#2D2F34]">
              <div className="text-[11px] text-gray-500 dark:text-gray-400">Ca dạy cố định/tuần</div>
              <div className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {weeklySessionsCount} buổi
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 desktop:grid-cols-12 gap-6">
        {/* Left Column: Edit Personal Info (7 cols) */}
        <div className="desktop:col-span-7 space-y-6">
          <form
            onSubmit={handleSaveProfile}
            className="rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200/80 dark:border-[#2D2F34] shadow-xs p-5 tablet:p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2D2F34] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-[#1A73E8]/20 text-[#1A73E8] dark:text-[#8AB4F8] flex items-center justify-center">
                  <User size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    Thông tin hồ sơ cá nhân
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Cập nhật họ tên hiển thị, số điện thoại và đơn vị công tác
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                  Họ và tên hiển thị <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="VD: Cô Nguyễn Thu Hà"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                  Địa chỉ Email tài khoản (Đã xác minh)
                </label>
                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="email"
                    disabled
                    value={profile.email}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-gray-100 dark:bg-[#282A2E] border border-gray-200 dark:border-[#37393F] text-sm text-gray-500 dark:text-gray-400 cursor-not-allowed"
                  />
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  {isAdmin
                    ? 'Email Quản trị viên cố định được cấu hình từ biến môi trường ADMIN_EMAIL trên máy chủ, không thể thay đổi từ trình duyệt.'
                    : 'Địa chỉ email định danh chính của tài khoản giáo viên.'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                  Số điện thoại liên hệ
                </label>
                <div className="relative">
                  <Phone
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="VD: 0912345678"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                  {isAdmin ? 'Đơn vị / Tổ bộ môn quản lý' : 'Trường / Đơn vị công tác'}
                </label>
                <div className="relative">
                  <Building2
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    placeholder="VD: THCS Cầu Giấy"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                  Đường dẫn ảnh đại diện (URL tùy chọn)
                </label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://... (để trống sẽ dùng chữ cái viết tắt tên)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors disabled:opacity-60"
              >
                {savingProfile ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                Lưu thông tin hồ sơ
              </button>
            </div>
          </form>

          {/* Role-Specific Card */}
          {isAdmin ? (
            <div className="rounded-2xl bg-gradient-to-br from-blue-50/90 via-indigo-50/50 to-white dark:from-[#1A73E8]/15 dark:via-[#1E1F22] dark:to-[#1E1F22] border border-blue-200/80 dark:border-blue-900/50 p-5 tablet:p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1A73E8] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <ShieldCheck size={20} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    Chính sách Bảo mật & Quyền hạn Quản trị viên (Server-Enforced)
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    Tài khoản của thầy/cô là <strong>Quản trị viên duy nhất</strong> của hệ thống, được xác thực tự động trên máy chủ thông qua biến môi trường{' '}
                    <code className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 font-mono text-[11px]">
                      ADMIN_EMAIL={security.adminEmailConfigured || profile.email}
                    </code>
                    .
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-white/90 dark:bg-[#24262B] border border-blue-100 dark:border-[#2D2F34] space-y-1">
                  <div className="font-bold text-gray-900 dark:text-white">
                    1. Nghiệp vụ Quản trị Tài khoản
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    Phê duyệt giáo viên mới, khóa/mở khóa tài khoản, cấp mã mời, hỗ trợ đặt lại mật khẩu và giám sát nhật ký kiểm toán.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-white/90 dark:bg-[#24262B] border border-blue-100 dark:border-[#2D2F34] space-y-1">
                  <div className="font-bold text-emerald-700 dark:text-emerald-400">
                    2. Bảo vệ Dữ liệu Học sinh & Lớp học
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    Theo quy tắc bảo mật dữ liệu trẻ em, Admin <strong>không xem hoặc can thiệp</strong> vào danh sách lớp, điểm danh hay học phí riêng của giáo viên khác.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <Link
                  to="/admin"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1A73E8] dark:text-[#8AB4F8] hover:underline"
                >
                  Đi tới Cổng Quản trị Hệ thống
                  <ExternalLink size={13} />
                </Link>
                <Link
                  to="/schedule"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  Chuyển sang Lịch dạy cá nhân của tôi →
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200/80 dark:border-[#2D2F34] shadow-xs p-5 tablet:p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2D2F34] pb-3.5">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    Sao lưu dữ liệu & Quyền riêng tư tài khoản
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Toàn bộ dữ liệu lớp học, học sinh, điểm danh và học phí thuộc quyền sở hữu riêng của thầy/cô
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-blue-50/60 dark:bg-[#1A73E8]/10 border border-blue-100 dark:border-blue-900/40">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-gray-900 dark:text-white">
                    Tải xuống bản sao lưu dữ liệu cá nhân (.json)
                  </div>
                  <div className="text-[11px] text-gray-600 dark:text-gray-300">
                    Lưu trữ toàn bộ lịch trường, lớp dạy thêm, điểm danh và lịch sử thu học phí về máy.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleExportPersonalBackup}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#24262B] border border-blue-200 dark:border-blue-800 text-xs font-semibold text-[#1A73E8] dark:text-[#8AB4F8] hover:bg-blue-50 transition-colors shrink-0"
                >
                  <Download size={14} />
                  Tải sao lưu (.json)
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-red-50/50 dark:bg-red-950/20 border border-red-200/70 dark:border-red-900/40">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-red-700 dark:text-red-300">
                    Tự xóa tài khoản cá nhân vĩnh viễn
                  </div>
                  <div className="text-[11px] text-red-600/80 dark:text-red-400/80">
                    Xóa tài khoản và toàn bộ dữ liệu lịch dạy của thầy/cô khỏi hệ thống. Hãy tải sao lưu trước khi thực hiện.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors shrink-0"
                >
                  <Trash2 size={14} />
                  Xóa tài khoản...
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Password & Device Sessions (5 cols) */}
        <div className="desktop:col-span-5 space-y-6">
          {/* Change Password Card */}
          <form
            onSubmit={handleRequestPasswordSubmit}
            className="rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200/80 dark:border-[#2D2F34] shadow-xs p-5 tablet:p-6 space-y-4"
          >
            <div className="flex items-center gap-2.5 border-b border-gray-100 dark:border-[#2D2F34] pb-3.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <KeyRound size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  {security.hasPassword ? 'Đổi mật khẩu đăng nhập' : 'Thiết lập mật khẩu đăng nhập'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {security.hasPassword
                    ? 'Tự động thu hồi phiên ở các thiết bị khác sau khi đổi'
                    : 'Tài khoản Google chưa có mật khẩu riêng — tạo mật khẩu để đăng nhập bằng cả 2 cách'}
                </p>
              </div>
            </div>

            {security.hasPassword && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                  Mật khẩu hiện tại
                </label>
                <div className="relative">
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Nhập mật khẩu hiện tại"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(!showPasswords)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                Mật khẩu mới
              </label>
              <div className="relative">
                <input
                  type={showPasswords ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Ít nhất 8 ký tự, gồm chữ và số"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <PasswordStrengthMeter password={newPassword} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                Nhập lại mật khẩu mới
              </label>
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập khớp mật khẩu mới"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
              />
            </div>

            <button
              type="submit"
              disabled={savingPassword}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 dark:bg-[#1A73E8] dark:hover:bg-[#1557B0] text-white text-xs sm:text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {savingPassword ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <KeyRound size={16} />
              )}
              {security.hasPassword ? 'Cập nhật mật khẩu mới' : 'Lưu mật khẩu đăng nhập'}
            </button>
          </form>

          {/* Session & Device Security Card */}
          <div className="rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200/80 dark:border-[#2D2F34] shadow-xs p-5 tablet:p-6 space-y-4">
            <div className="flex items-center gap-2.5 border-b border-gray-100 dark:border-[#2D2F34] pb-3.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Smartphone size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Phiên đăng nhập & Thiết bị
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Phiên bản khóa bảo mật hiện tại: #{security.tokenVersion}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-[#24262B] border border-gray-100 dark:border-[#2D2F34] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Thiết bị hiện tại (Đang trực tuyến)
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                  Hợp lệ
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Hỗ trợ lưu phiên bền vững cho cả trình duyệt máy tính và ứng dụng Màn hình chính (PWA) trên iPhone/iPad.
              </p>

              <label className="flex items-center justify-between pt-2 border-t border-gray-200/70 dark:border-[#37393F] cursor-pointer">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
                  Duy trì đăng nhập trên thiết bị này (30 ngày)
                </span>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded text-[#1A73E8] focus:ring-[#1A73E8]"
                />
              </label>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                disabled={revokingSessions}
                onClick={() => setConfirmRevokeOtherOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs font-semibold transition-colors"
              >
                <ShieldCheck size={16} />
                Đăng xuất khỏi tất cả các thiết bị khác
              </button>

              <button
                type="button"
                onClick={() => setConfirmLogoutOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-semibold transition-colors"
              >
                <LogOut size={16} />
                Đăng xuất khỏi thiết bị này
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Password Change Dialog */}
      <ConfirmDialog
        open={confirmPasswordModal}
        onClose={() => setConfirmPasswordModal(false)}
        onConfirm={executeChangePassword}
        title="Xác nhận đổi mật khẩu?"
        message="Sau khi đổi mật khẩu, tất cả các thiết bị khác đang đăng nhập tài khoản của thầy/cô sẽ tự động được đăng xuất để bảo vệ an toàn. Thiết bị hiện tại vẫn duy trì bình thường."
        confirmLabel="Đổi mật khẩu ngay"
        variant="primary"
      />

      {/* Confirm Revoke Other Sessions Dialog */}
      <ConfirmDialog
        open={confirmRevokeOtherOpen}
        onClose={() => setConfirmRevokeOtherOpen(false)}
        onConfirm={executeRevokeOtherSessions}
        title="Đăng xuất khỏi các thiết bị khác?"
        message="Toàn bộ phiên đăng nhập trên điện thoại, máy tính bảng hoặc trình duyệt khác sẽ bị thu hồi ngay lập tức. Phiên làm việc trên thiết bị hiện tại của thầy/cô vẫn được giữ nguyên."
        confirmLabel="Thu hồi các thiết bị khác"
        variant="warning"
      />

      {/* Confirm Logout Current Device Dialog */}
      <ConfirmDialog
        open={confirmLogoutOpen}
        onClose={() => setConfirmLogoutOpen(false)}
        onConfirm={() => {
          void logout().then(() => {
            toast.success('Đã đăng xuất khỏi thiết bị.')
            navigate('/auth/login', { replace: true })
          })
        }}
        title="Xác nhận đăng xuất?"
        message={`Thầy/cô muốn đăng xuất khỏi tài khoản ${profile.email} trên thiết bị này?`}
        confirmLabel="Đăng xuất"
        variant="danger"
      />

      {/* Self-Delete Teacher Account Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Xác nhận xóa vĩnh viễn tài khoản cá nhân"
        size="md"
      >
        <form onSubmit={handleSelfDeleteAccount} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs text-red-800 dark:text-red-200 flex items-start gap-2.5">
            <AlertTriangle size={18} className="shrink-0 text-red-600 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">Cảnh báo: Thao tác này không thể hoàn tác!</div>
              <p>
                Tài khoản <strong>{profile.email}</strong> sẽ bị xóa khỏi hệ thống. Khuyến nghị thầy/cô bấm nút{' '}
                <button
                  type="button"
                  onClick={handleExportPersonalBackup}
                  className="underline font-bold"
                >
                  Tải bản sao lưu (.json)
                </button>{' '}
                trước khi tiếp tục.
              </p>
            </div>
          </div>

          {security.hasPassword ? (
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                Nhập mật khẩu hiện tại để xác nhận xóa tài khoản
              </label>
              <input
                type="password"
                required
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Nhập mật khẩu của thầy/cô"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                Nhập chính xác cụm từ <strong>XOA TAI KHOAN</strong> để xác nhận
              </label>
              <input
                type="text"
                required
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="XOA TAI KHOAN"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm font-mono"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              className="btn-secondary"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={deletingAccount}
              className="btn-danger flex items-center gap-1.5"
            >
              {deletingAccount && <Loader2 size={14} className="animate-spin" />}
              Xác nhận xóa vĩnh viễn
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
