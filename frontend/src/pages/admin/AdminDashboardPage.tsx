import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ShieldCheck,
  Users,
  UserCheck,
  UserX,
  Clock,
  Ticket,
  Settings,
  History,
  Search,
  Plus,
  CheckCircle2,
  Lock,
  Unlock,
  KeyRound,
  Trash2,
  Copy,
  RefreshCw,
  Mail,
  Phone,
  Building2,
  AlertTriangle,
  CalendarDays,
  User,
  Loader2,
  Sparkles,
  ExternalLink,
  Ban,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/useAuthStore'
import {
  apiAdminApproveUser,
  apiAdminBulkApproveUsers,
  apiAdminCreateInvite,
  apiAdminCreateTeacher,
  apiAdminDeleteInvite,
  apiAdminDeleteTeacher,
  apiAdminLockUser,
  apiAdminResetUserPassword,
  apiAdminRevokeInvite,
  apiAdminUnlockUser,
  apiAdminUpdateSettings,
  apiGetAdminOverview,
} from '../../lib/supabase'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Modal } from '../../components/ui/Modal'
import {
  PasswordStrengthMeter,
  evaluatePasswordStrength,
} from '../../components/auth/PasswordStrengthMeter'
import type {
  AdminOverviewData,
  RegistrationMode,
  UserProfile,
} from '../../types'
import { cn } from '../../lib/utils'

type AdminTab = 'accounts' | 'invites' | 'settings' | 'audit'
type AccountStatusFilter = 'all' | 'pending' | 'active' | 'locked' | 'admin'

function formatVNDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatVNDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Chưa từng'
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

const AUDIT_ACTION_LABELS: Record<
  string,
  { label: string; badgeClass: string; category: 'auth' | 'admin' | 'security' }
> = {
  system_init: {
    label: 'Khởi tạo hệ thống',
    badgeClass: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    category: 'admin',
  },
  register: {
    label: 'Đăng ký tài khoản mới',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300',
    category: 'auth',
  },
  verify_email: {
    label: 'Xác minh địa chỉ Email',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300',
    category: 'auth',
  },
  login_success: {
    label: 'Đăng nhập thành công',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300',
    category: 'auth',
  },
  login_google_redirect: {
    label: 'Đăng nhập qua Google',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300',
    category: 'auth',
  },
  google_account_linked: {
    label: 'Liên kết tài khoản Google',
    badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300',
    category: 'security',
  },
  login_failed_lockout: {
    label: 'Tạm khóa do sai mật khẩu 5 lần',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300',
    category: 'security',
  },
  logout: {
    label: 'Đăng xuất',
    badgeClass: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    category: 'auth',
  },
  profile_updated: {
    label: 'Cập nhật hồ sơ cá nhân',
    badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    category: 'auth',
  },
  password_changed: {
    label: 'Đổi mật khẩu',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300',
    category: 'security',
  },
  password_reset_requested: {
    label: 'Yêu cầu khôi phục mật khẩu',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300',
    category: 'security',
  },
  password_reset_completed: {
    label: 'Hoàn tất đặt lại mật khẩu',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300',
    category: 'security',
  },
  revoke_other_sessions: {
    label: 'Thu hồi phiên thiết bị khác',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300',
    category: 'security',
  },
  admin_approve_account: {
    label: 'Admin duyệt giáo viên',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300',
    category: 'admin',
  },
  admin_bulk_approve: {
    label: 'Admin duyệt hàng loạt',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300',
    category: 'admin',
  },
  admin_lock_account: {
    label: 'Admin khóa tài khoản',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300',
    category: 'admin',
  },
  admin_unlock_account: {
    label: 'Admin mở khóa tài khoản',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300',
    category: 'admin',
  },
  admin_set_temp_password: {
    label: 'Admin cấp mật khẩu mới',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300',
    category: 'admin',
  },
  admin_send_password_reset_link: {
    label: 'Admin gửi link đặt mật khẩu',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300',
    category: 'admin',
  },
  admin_create_teacher: {
    label: 'Admin tạo tài khoản GV',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300',
    category: 'admin',
  },
  admin_reject_pending_account: {
    label: 'Admin từ chối yêu cầu đăng ký',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300',
    category: 'admin',
  },
  admin_delete_account: {
    label: 'Admin xóa tài khoản GV',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300',
    category: 'admin',
  },
  admin_update_settings: {
    label: 'Admin đổi cấu hình đăng ký',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300',
    category: 'admin',
  },
  admin_create_invite: {
    label: 'Admin tạo mã mời mới',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300',
    category: 'admin',
  },
  admin_revoke_invite: {
    label: 'Admin thu hồi mã mời',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300',
    category: 'admin',
  },
  admin_delete_invite: {
    label: 'Admin xóa mã mời',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300',
    category: 'admin',
  },
}

export function AdminDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = ((searchParams.get('tab') as AdminTab) || 'accounts') as AdminTab

  const { sessionToken, profile, setPendingAdminApprovalCount } = useAuthStore()
  const [overview, setOverview] = useState<AdminOverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Accounts tab filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>('all')

  // Action Modals
  const [approveTarget, setApproveTarget] = useState<UserProfile | null>(null)
  const [confirmBulkApproveOpen, setConfirmBulkApproveOpen] = useState(false)

  const [lockTarget, setLockTarget] = useState<UserProfile | null>(null)
  const [lockReason, setLockReason] = useState('Vi phạm quy định hoặc tạm nghỉ dạy')
  const [locking, setLocking] = useState(false)

  const [unlockTarget, setUnlockTarget] = useState<UserProfile | null>(null)

  const [resetPassTarget, setResetPassTarget] = useState<UserProfile | null>(null)
  const [resetMode, setResetMode] = useState<'temp_pass' | 'email_link'>('temp_pass')
  const [tempPasswordInput, setTempPasswordInput] = useState('Giaovien123')
  const [generatedResetResult, setGeneratedResetResult] = useState<{
    tempPass?: string
    resetUrl?: string
  } | null>(null)
  const [resettingPass, setResettingPass] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deletingUser, setDeletingUser] = useState(false)

  // Create Teacher Modal
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newTeacherName, setNewTeacherName] = useState('')
  const [newTeacherEmail, setNewTeacherEmail] = useState('')
  const [newTeacherPhone, setNewTeacherPhone] = useState('')
  const [newTeacherSchool, setNewTeacherSchool] = useState('')
  const [newTeacherPassword, setNewTeacherPassword] = useState('Giaovien123')
  const [creatingTeacher, setCreatingTeacher] = useState(false)

  // Invites tab state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteCustomCode, setInviteCustomCode] = useState('')
  const [inviteMaxUses, setInviteMaxUses] = useState(1)
  const [inviteExpireDays, setInviteExpireDays] = useState<number>(14)
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [revokeInviteTargetId, setRevokeInviteTargetId] = useState<string | null>(null)
  const [deleteInviteTargetId, setDeleteInviteTargetId] = useState<string | null>(null)

  // Settings tab state
  const [regMode, setRegMode] = useState<RegistrationMode>('pending_approval')
  const [googleEnabled, setGoogleEnabled] = useState(true)
  const [passwordEnabled, setPasswordEnabled] = useState(true)
  const [notifyAdminEmail, setNotifyAdminEmail] = useState(true)
  const [maxAccountsInput, setMaxAccountsInput] = useState<string>('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [confirmSaveSettingsOpen, setConfirmSaveSettingsOpen] = useState(false)

  // Audit tab filters
  const [auditSearch, setAuditSearch] = useState('')
  const [auditCategory, setAuditCategory] = useState<'all' | 'auth' | 'admin' | 'security'>('all')

  const fetchOverview = useCallback(
    async (silent = false) => {
      if (!sessionToken) return
      if (!silent) setLoading(true)
      else setRefreshing(true)
      try {
        const data = await apiGetAdminOverview(sessionToken)
        setOverview(data)
        setPendingAdminApprovalCount(data.stats.pendingCount)
        setRegMode(data.appSettings.registration_mode)
        setGoogleEnabled(data.appSettings.google_login_enabled)
        setPasswordEnabled(data.appSettings.password_login_enabled)
        setNotifyAdminEmail(data.appSettings.notify_admin_email)
        setMaxAccountsInput(
          data.appSettings.max_accounts ? String(data.appSettings.max_accounts) : ''
        )
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Không thể tải dữ liệu quản trị.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [sessionToken, setPendingAdminApprovalCount]
  )

  useEffect(() => {
    void fetchOverview(false)
  }, [fetchOverview])

  const setTab = (tab: AdminTab) => {
    setSearchParams({ tab })
  }

  const pendingProfiles = useMemo(
    () =>
      (overview?.profiles || []).filter(
        (p) => p.role === 'teacher' && p.status === 'pending'
      ),
    [overview]
  )

  const filteredProfiles = useMemo(() => {
    const list = overview?.profiles || []
    const q = searchQuery.trim().toLowerCase()
    return list.filter((p) => {
      if (statusFilter === 'pending' && p.status !== 'pending') return false
      if (statusFilter === 'active' && (p.status !== 'active' || p.role === 'admin'))
        return false
      if (statusFilter === 'locked' && p.status !== 'locked') return false
      if (statusFilter === 'admin' && p.role !== 'admin') return false

      if (!q) return true
      return (
        p.full_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.school || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q)
      )
    })
  }, [overview, searchQuery, statusFilter])

  const filteredAuditLogs = useMemo(() => {
    const logs = overview?.auditLogs || []
    const q = auditSearch.trim().toLowerCase()
    return logs.filter((log) => {
      const meta = AUDIT_ACTION_LABELS[log.action]
      if (auditCategory !== 'all' && meta && meta.category !== auditCategory) {
        return false
      }
      if (!q) return true
      return (
        log.action.toLowerCase().includes(q) ||
        (meta?.label || '').toLowerCase().includes(q) ||
        (log.actor_name || '').toLowerCase().includes(q) ||
        (log.actor_email || '').toLowerCase().includes(q) ||
        (log.target_name || '').toLowerCase().includes(q) ||
        (log.target_email || '').toLowerCase().includes(q)
      )
    })
  }, [overview, auditSearch, auditCategory])

  if (profile?.role !== 'admin') {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
          <AlertTriangle size={28} />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          Khu vực dành riêng cho Quản trị viên Hệ thống
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Chỉ tài khoản có email xác minh trùng khớp với biến môi trường ADMIN_EMAIL trên máy chủ mới có quyền truy cập trang này.
        </p>
        <Link to="/" className="btn-primary inline-flex">
          Quay về Lịch dạy
        </Link>
      </div>
    )
  }

  // Handlers
  const handleConfirmApproveSingle = async () => {
    if (!sessionToken || !approveTarget) return
    try {
      const res = await apiAdminApproveUser(sessionToken, approveTarget.id)
      toast.success(res.message)
      setApproveTarget(null)
      await fetchOverview(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi duyệt tài khoản.')
    }
  }

  const handleConfirmBulkApprove = async () => {
    if (!sessionToken) return
    try {
      const res = await apiAdminBulkApproveUsers(sessionToken)
      toast.success(res.message)
      setConfirmBulkApproveOpen(false)
      await fetchOverview(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi duyệt hàng loạt.')
    }
  }

  const handleConfirmLockUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionToken || !lockTarget) return
    setLocking(true)
    try {
      const res = await apiAdminLockUser(sessionToken, lockTarget.id, lockReason)
      toast.success(res.message)
      setLockTarget(null)
      await fetchOverview(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể khóa tài khoản.')
    } finally {
      setLocking(false)
    }
  }

  const handleConfirmUnlockUser = async () => {
    if (!sessionToken || !unlockTarget) return
    try {
      const res = await apiAdminUnlockUser(sessionToken, unlockTarget.id)
      toast.success(res.message)
      setUnlockTarget(null)
      await fetchOverview(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể mở khóa tài khoản.')
    }
  }

  const handleExecuteResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionToken || !resetPassTarget) return
    if (resetMode === 'temp_pass') {
      const strength = evaluatePasswordStrength(tempPasswordInput)
      if (!strength.isValid) {
        toast.error('Mật khẩu tạm thời phải có ít nhất 8 ký tự, gồm chữ và số.')
        return
      }
    }
    setResettingPass(true)
    try {
      const res = await apiAdminResetUserPassword(
        sessionToken,
        resetPassTarget.id,
        resetMode === 'temp_pass' ? tempPasswordInput : undefined
      )
      setGeneratedResetResult({
        tempPass: res.temporaryPassword,
        resetUrl: res.resetUrl,
      })
      toast.success(res.message)
      await fetchOverview(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu.')
    } finally {
      setResettingPass(false)
    }
  }

  const handleExecuteDeleteUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionToken || !deleteTarget) return
    setDeletingUser(true)
    try {
      const res = await apiAdminDeleteTeacher(sessionToken, deleteTarget.id, deleteReason)
      toast.success(res.message)
      setDeleteTarget(null)
      setDeleteReason('')
      await fetchOverview(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể xóa tài khoản.')
    } finally {
      setDeletingUser(false)
    }
  }

  const handleCreateTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionToken) return
    const strength = evaluatePasswordStrength(newTeacherPassword)
    if (!strength.isValid) {
      toast.error('Mật khẩu khởi tạo phải có ít nhất 8 ký tự, bao gồm chữ và số.')
      return
    }
    setCreatingTeacher(true)
    try {
      const res = await apiAdminCreateTeacher(sessionToken, {
        full_name: newTeacherName,
        email: newTeacherEmail,
        phone: newTeacherPhone,
        school: newTeacherSchool,
        password: newTeacherPassword,
        status: 'active',
      })
      toast.success(res.message)
      setCreateModalOpen(false)
      setNewTeacherName('')
      setNewTeacherEmail('')
      setNewTeacherPhone('')
      setNewTeacherSchool('')
      await fetchOverview(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể tạo tài khoản.')
    } finally {
      setCreatingTeacher(false)
    }
  }

  const handleCreateInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionToken) return
    setCreatingInvite(true)
    try {
      const res = await apiAdminCreateInvite(sessionToken, {
        email: inviteEmail.trim() || null,
        customCode: inviteCustomCode.trim() || null,
        maxUses: inviteMaxUses,
        expiresInDays: inviteExpireDays > 0 ? inviteExpireDays : null,
        sendEmailNow: true,
      })
      toast.success(res.message)
      setInviteEmail('')
      setInviteCustomCode('')
      await fetchOverview(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể tạo mã mời.')
    } finally {
      setCreatingInvite(false)
    }
  }

  const handleConfirmSaveSettings = async () => {
    if (!sessionToken) return
    setSavingSettings(true)
    try {
      const res = await apiAdminUpdateSettings(sessionToken, {
        registration_mode: regMode,
        google_login_enabled: googleEnabled,
        password_login_enabled: passwordEnabled,
        notify_admin_email: notifyAdminEmail,
        max_accounts: maxAccountsInput.trim() ? Number(maxAccountsInput) : null,
      })
      toast.success(res.message)
      await fetchOverview(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể lưu cài đặt.')
    } finally {
      setSavingSettings(false)
    }
  }

  return (
    <div className="p-4 tablet:p-6 desktop:p-8 max-w-7xl mx-auto w-full space-y-6 pb-24 tablet:pb-12">
      {/* Top Admin Workspace Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#1D4ED8] text-white p-5 tablet:p-6 shadow-md">
        <div className="flex flex-col desktop:flex-row desktop:items-center desktop:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-xs text-[11px] font-bold tracking-wide uppercase">
              <ShieldCheck size={14} className="text-sky-300" />
              Cổng Quản trị Hệ thống · ADMIN_EMAIL: {overview?.adminEmail || profile.email}
            </div>
            <h1 className="text-xl tablet:text-2xl font-extrabold tracking-tight">
              Quản lý Tài khoản Giáo viên & Bảo mật Hệ thống
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 max-w-3xl">
              Phê duyệt giáo viên đăng ký mới, cấp mã mời, quản lý trạng thái hoạt động và giám sát nhật ký kiểm toán.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-blue-50 text-xs sm:text-sm font-bold shadow-sm transition-colors"
            >
              <Plus size={16} />
              Tạo tài khoản Giáo viên
            </button>
            <button
              type="button"
              onClick={() => void fetchOverview(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs sm:text-sm font-semibold transition-colors"
            >
              <RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />
              Làm mới
            </button>
            <Link
              to="/profile"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs sm:text-sm font-semibold transition-colors"
            >
              <User size={15} />
              Hồ sơ Admin
            </Link>
          </div>
        </div>

        {/* Child Data Privacy Commitment Strip */}
        <div className="mt-4 pt-3.5 border-t border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-sky-100">
          <div className="flex items-center gap-2">
            <Lock size={14} className="shrink-0 text-emerald-300" />
            <span>
              <strong>Bảo vệ dữ liệu trẻ em & quyền riêng tư:</strong> Admin chỉ quản lý định danh tài khoản giáo viên; không xem danh sách lớp, học sinh, điểm danh hay học phí của giáo viên khác.
            </span>
          </div>
          <Link
            to="/schedule"
            className="inline-flex items-center gap-1 text-xs font-bold text-sky-200 hover:text-white shrink-0 underline"
          >
            <CalendarDays size={13} />
            Mở Lịch dạy cá nhân của tôi
          </Link>
        </div>
      </div>

      {/* 5 KPI Cards */}
      <div className="grid grid-cols-2 tablet:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => {
            setTab('accounts')
            setStatusFilter('pending')
          }}
          className={cn(
            'text-left p-4 rounded-2xl border transition-all',
            (overview?.stats.pendingCount || 0) > 0
              ? 'bg-amber-50/90 dark:bg-amber-950/35 border-amber-300 dark:border-amber-700/70 shadow-xs'
              : 'bg-white dark:bg-[#1E1F22] border-gray-200/80 dark:border-[#2D2F34]'
          )}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-amber-800 dark:text-amber-300">
            <span>Chờ phê duyệt</span>
            <Clock size={16} />
          </div>
          <div className="text-2xl font-extrabold text-amber-700 dark:text-amber-300 mt-1">
            {overview?.stats.pendingCount ?? 0}
          </div>
          <div className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
            {(overview?.stats.pendingCount || 0) > 0
              ? 'Cần Admin xét duyệt ngay'
              : 'Không có yêu cầu tồn đọng'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setTab('accounts')
            setStatusFilter('active')
          }}
          className="text-left p-4 rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200/80 dark:border-[#2D2F34] hover:border-emerald-300 transition-all"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <span>GV Đang hoạt động</span>
            <UserCheck size={16} />
          </div>
          <div className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
            {overview?.stats.activeCount ?? 0}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            Đã duyệt & sử dụng bình thường
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setTab('accounts')
            setStatusFilter('locked')
          }}
          className="text-left p-4 rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200/80 dark:border-[#2D2F34] hover:border-red-300 transition-all"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-red-600 dark:text-red-400">
            <span>Tài khoản bị khóa</span>
            <UserX size={16} />
          </div>
          <div className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
            {overview?.stats.lockedCount ?? 0}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            Đã thu hồi phiên truy cập
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setTab('accounts')
            setStatusFilter('all')
          }}
          className="text-left p-4 rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200/80 dark:border-[#2D2F34] hover:border-blue-300 transition-all"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[#1A73E8] dark:text-[#8AB4F8]">
            <span>Tổng số Giáo viên</span>
            <Users size={16} />
          </div>
          <div className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
            {overview?.stats.totalTeachers ?? 0}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            + 1 Admin cố định ({overview?.stats.totalAccounts ?? 1} TK)
          </div>
        </button>

        <div className="col-span-2 tablet:col-span-1 p-4 rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200/80 dark:border-[#2D2F34]">
          <div className="flex items-center justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            <span>Đăng nhập 7 ngày qua</span>
            <Sparkles size={16} />
          </div>
          <div className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
            {overview?.stats.activeLast7Days ?? 0}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            Chế độ:{' '}
            <strong>
              {overview?.appSettings.registration_mode === 'open'
                ? 'Mở tự do'
                : overview?.appSettings.registration_mode === 'invite_only'
                ? 'Chỉ mã mời'
                : 'Cần Admin duyệt'}
            </strong>
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-gray-200 dark:border-[#2D2F34]">
        <button
          type="button"
          onClick={() => setTab('accounts')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap',
            activeTab === 'accounts'
              ? 'border-[#1A73E8] text-[#1A73E8] dark:text-[#8AB4F8] bg-blue-50/60 dark:bg-[#1A73E8]/15'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          )}
        >
          <Users size={16} />
          Duyệt & Quản lý Tài khoản
          {(overview?.stats.pendingCount || 0) > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-500 text-white">
              {overview?.stats.pendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTab('invites')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap',
            activeTab === 'invites'
              ? 'border-[#1A73E8] text-[#1A73E8] dark:text-[#8AB4F8] bg-blue-50/60 dark:bg-[#1A73E8]/15'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          )}
        >
          <Ticket size={16} />
          Mã mời Giáo viên ({overview?.invites.length ?? 0})
        </button>

        <button
          type="button"
          onClick={() => setTab('settings')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap',
            activeTab === 'settings'
              ? 'border-[#1A73E8] text-[#1A73E8] dark:text-[#8AB4F8] bg-blue-50/60 dark:bg-[#1A73E8]/15'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          )}
        >
          <Settings size={16} />
          Chế độ Đăng ký & Bảo mật
        </button>

        <button
          type="button"
          onClick={() => setTab('audit')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap',
            activeTab === 'audit'
              ? 'border-[#1A73E8] text-[#1A73E8] dark:text-[#8AB4F8] bg-blue-50/60 dark:bg-[#1A73E8]/15'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          )}
        >
          <History size={16} />
          Nhật ký Kiểm toán ({overview?.auditLogs.length ?? 0})
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center space-y-3">
          <Loader2 size={28} className="animate-spin text-[#1A73E8] mx-auto" />
          <p className="text-xs text-gray-500">Đang tải dữ liệu Quản trị Hệ thống...</p>
        </div>
      ) : (
        <>
          {/* ================================================================ */}
          {/* TAB 1: ACCOUNTS MANAGEMENT & APPROVAL QUEUE                      */}
          {/* ================================================================ */}
          {activeTab === 'accounts' && (
            <div className="space-y-6">
              {/* Prominent Pending Approval Queue */}
              {pendingProfiles.length > 0 && (
                <div className="rounded-2xl bg-amber-50/90 dark:bg-amber-950/25 border-2 border-amber-300 dark:border-amber-700/70 p-4 tablet:p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-extrabold shrink-0">
                        {pendingProfiles.length}
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-amber-950 dark:text-amber-200">
                          Danh sách Giáo viên đang chờ phê duyệt ({pendingProfiles.length})
                        </h2>
                        <p className="text-xs text-amber-800/90 dark:text-amber-300/80">
                          Các giáo viên dưới đây đã đăng ký và đang đợi Admin kích hoạt để bắt đầu xếp lịch dạy.
                        </p>
                      </div>
                    </div>

                    {pendingProfiles.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setConfirmBulkApproveOpen(true)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors shrink-0"
                      >
                        <CheckCircle2 size={15} />
                        Duyệt tất cả ({pendingProfiles.length})
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
                    {pendingProfiles.map((u) => (
                      <div
                        key={u.id}
                        className="p-4 rounded-xl bg-white dark:bg-[#1E1F22] border border-amber-200 dark:border-amber-800/60 shadow-2xs flex flex-col justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm text-gray-900 dark:text-white">
                              {u.full_name}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Chờ duyệt
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-300 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="inline-flex items-center gap-1">
                              <Mail size={12} /> {u.email}
                            </span>
                            {u.phone && (
                              <span className="inline-flex items-center gap-1">
                                <Phone size={12} /> {u.phone}
                              </span>
                            )}
                            {u.school && (
                              <span className="inline-flex items-center gap-1">
                                <Building2 size={12} /> {u.school}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            Đăng ký lúc: {formatVNDateTime(u.created_at)} ·{' '}
                            {u.email_verified ? 'Đã xác minh Email ✅' : 'Chưa xác minh Email'}
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-[#2D2F34]">
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget(u)
                              setDeleteReason('Không thuộc danh sách giáo viên của đơn vị')
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                          >
                            Từ chối / Xóa
                          </button>
                          <button
                            type="button"
                            onClick={() => setApproveTarget(u)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-colors"
                          >
                            <CheckCircle2 size={14} />
                            Phê duyệt ngay
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search & Filter Bar */}
              <div className="rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200/80 dark:border-[#2D2F34] p-4 space-y-4">
                <div className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tìm theo tên giáo viên, email, trường hoặc số điện thoại..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 dark:bg-[#24262B] border border-gray-200 dark:border-[#37393F] text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'all', label: `Tất cả (${overview?.profiles.length ?? 0})` },
                        { id: 'pending', label: `Chờ duyệt (${overview?.stats.pendingCount ?? 0})` },
                        { id: 'active', label: `Đang hoạt động (${overview?.stats.activeCount ?? 0})` },
                        { id: 'locked', label: `Bị khóa (${overview?.stats.lockedCount ?? 0})` },
                        { id: 'admin', label: 'Admin (1)' },
                      ] as { id: AccountStatusFilter; label: string }[]
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setStatusFilter(f.id)}
                        className={cn(
                          'px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors',
                          statusFilter === f.id
                            ? 'bg-[#1A73E8] text-white'
                            : 'bg-gray-100 dark:bg-[#282A2E] text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accounts Table (Desktop) / Cards (Mobile) */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-[#2D2F34] text-[11px] font-bold uppercase text-gray-500 dark:text-gray-400">
                        <th className="py-3 px-3">Tài khoản Giáo viên</th>
                        <th className="py-3 px-3">Trường / SĐT</th>
                        <th className="py-3 px-3">Vai trò & Trạng thái</th>
                        <th className="py-3 px-3">Ngày tạo / Đăng nhập cuối</th>
                        <th className="py-3 px-3 text-right">Thao tác Quản trị</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-[#2D2F34] text-xs sm:text-sm">
                      {filteredProfiles.map((u) => {
                        const isRowAdmin = u.role === 'admin'
                        return (
                          <tr
                            key={u.id}
                            className="hover:bg-gray-50/80 dark:hover:bg-[#24262B]/60 transition-colors"
                          >
                            <td className="py-3.5 px-3">
                              <div className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                {u.full_name}
                                {u.email_verified && (
                                  <span
                                    title="Đã xác minh Email"
                                    className="text-emerald-600 dark:text-emerald-400"
                                  >
                                    <CheckCircle2 size={14} />
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {u.email}
                              </div>
                            </td>

                            <td className="py-3.5 px-3 text-xs text-gray-600 dark:text-gray-300">
                              <div>{u.school || '—'}</div>
                              <div className="text-gray-400">{u.phone || '—'}</div>
                            </td>

                            <td className="py-3.5 px-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {isRowAdmin ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-950 text-[#1A73E8] dark:text-[#8AB4F8]">
                                    <ShieldCheck size={12} />
                                    Admin cố định (Server)
                                  </span>
                                ) : u.status === 'active' ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                                    Đang hoạt động
                                  </span>
                                ) : u.status === 'pending' ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300">
                                    Chờ phê duyệt
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300">
                                    Đã khóa
                                  </span>
                                )}
                              </div>
                              {u.locked_reason && (
                                <div className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                                  Lý do: {u.locked_reason}
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-3 text-xs text-gray-500 dark:text-gray-400">
                              <div>Tạo: {formatVNDate(u.created_at)}</div>
                              <div>ĐN cuối: {formatVNDateTime(u.last_login_at)}</div>
                            </td>

                            <td className="py-3.5 px-3 text-right">
                              {isRowAdmin ? (
                                <Link
                                  to="/profile"
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-[#282A2E] text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200"
                                >
                                  <User size={13} />
                                  Hồ sơ của tôi
                                </Link>
                              ) : (
                                <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                  {u.status === 'pending' && (
                                    <button
                                      type="button"
                                      onClick={() => setApproveTarget(u)}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                                    >
                                      Duyệt
                                    </button>
                                  )}

                                  {u.status === 'locked' ? (
                                    <button
                                      type="button"
                                      onClick={() => setUnlockTarget(u)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold"
                                    >
                                      <Unlock size={13} />
                                      Mở khóa
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLockTarget(u)
                                        setLockReason('Tạm khóa theo yêu cầu quản trị')
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 text-xs font-semibold"
                                    >
                                      <Lock size={13} />
                                      Khóa
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setResetPassTarget(u)
                                      setGeneratedResetResult(null)
                                      setTempPasswordInput('Giaovien123')
                                    }}
                                    title="Đặt lại mật khẩu hoặc gửi link khôi phục"
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-[#1A73E8] dark:text-[#8AB4F8] border border-blue-200 dark:border-blue-800/60 text-xs font-semibold"
                                  >
                                    <KeyRound size={13} />
                                    Mật khẩu
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteTarget(u)
                                      setDeleteReason('')
                                    }}
                                    title="Xóa tài khoản giáo viên"
                                    className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 2: INVITE CODES MANAGEMENT                                   */}
          {/* ================================================================ */}
          {activeTab === 'invites' && (
            <div className="grid grid-cols-1 desktop:grid-cols-12 gap-6">
              {/* Create Invite Form */}
              <form
                onSubmit={handleCreateInviteSubmit}
                className="desktop:col-span-5 rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200/80 dark:border-[#2D2F34] p-5 space-y-4 self-start"
              >
                <div className="flex items-center gap-2.5 border-b border-gray-100 dark:border-[#2D2F34] pb-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                    <Ticket size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">
                      Tạo mã mời Giáo viên mới
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Dùng để mời giáo viên đăng ký nhanh qua Zalo hoặc Email
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                    Email giáo viên nhận (Để trống nếu dùng chung cho nhiều GV)
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="VD: cogiaotoan@truong.edu.vn"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                      Số lượt dùng tối đa
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={inviteMaxUses}
                      onChange={(e) => setInviteMaxUses(Number(e.target.value || 1))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                      Hạn sử dụng (ngày)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={inviteExpireDays}
                      onChange={(e) => setInviteExpireDays(Number(e.target.value || 0))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                    Mã mời tùy chọn (Để trống sẽ tự sinh mã)
                  </label>
                  <input
                    type="text"
                    value={inviteCustomCode}
                    onChange={(e) => setInviteCustomCode(e.target.value.toUpperCase())}
                    placeholder="VD: TOAN-THCS-2026"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm font-mono uppercase"
                  />
                </div>

                <button
                  type="submit"
                  disabled={creatingInvite}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2"
                >
                  {creatingInvite ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                  Tạo mã mời ngay
                </button>
              </form>

              {/* Invites List */}
              <div className="desktop:col-span-7 rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200/80 dark:border-[#2D2F34] p-5 space-y-4">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Danh sách Mã mời đã phát hành ({overview?.invites.length ?? 0})
                </h3>

                {(overview?.invites.length || 0) === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-500 border border-dashed border-gray-200 dark:border-[#2D2F34] rounded-xl">
                    Chưa có mã mời nào. Hãy tạo mã mời ở khung bên trái để gửi cho giáo viên.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {overview?.invites.map((inv) => {
                      const registerLink = `${window.location.origin}/auth/register?invite=${encodeURIComponent(
                        inv.code
                      )}${inv.email ? `&email=${encodeURIComponent(inv.email)}` : ''}`

                      return (
                        <div
                          key={inv.id}
                          className="p-4 rounded-xl bg-gray-50 dark:bg-[#24262B] border border-gray-200/70 dark:border-[#37393F] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-extrabold text-sm px-2.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300">
                                {inv.code}
                              </span>
                              {inv.revoked ? (
                                <span className="text-[11px] font-bold text-red-600">
                                  Đã thu hồi
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold text-emerald-600">
                                  Đã dùng {inv.used_count}/{inv.max_uses} lượt
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-300">
                              Email chỉ định: <strong>{inv.email || 'Dùng chung mọi email'}</strong> · Hạn:{' '}
                              {inv.expires_at ? formatVNDate(inv.expires_at) : 'Không giới hạn'}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(inv.code)
                                toast.success(`Đã sao chép mã ${inv.code}`)
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1E1F22] border border-gray-200 dark:border-[#37393F] text-xs font-semibold"
                            >
                              <Copy size={13} />
                              Chép mã
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(registerLink)
                                toast.success('Đã sao chép đường dẫn đăng ký kèm mã mời!')
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-[#1A73E8] dark:text-[#8AB4F8] text-xs font-semibold"
                            >
                              <ExternalLink size={13} />
                              Chép Link Zalo
                            </button>
                            {!inv.revoked && (
                              <button
                                type="button"
                                onClick={() => setRevokeInviteTargetId(inv.id)}
                                className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50"
                                title="Thu hồi mã mời"
                              >
                                <Ban size={15} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDeleteInviteTargetId(inv.id)}
                              className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                              title="Xóa mã mời"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 3: REGISTRATION MODE & SYSTEM SECURITY SETTINGS              */}
          {/* ================================================================ */}
          {activeTab === 'settings' && (
            <div className="rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200/80 dark:border-[#2D2F34] p-5 tablet:p-6 max-w-3xl space-y-6">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Chế độ Đăng ký Tài khoản Giáo viên (`registration_mode`)
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Quy định cách thức giáo viên mới tham gia vào hệ thống sau khi xác minh địa chỉ email.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {(
                  [
                    {
                      mode: 'pending_approval',
                      title: '1. Cần Admin phê duyệt (Mặc định · Khuyến nghị)',
                      desc: 'Giáo viên đăng ký và xác minh email xong sẽ ở trạng thái Chờ duyệt. Chỉ khi Admin bấm Duyệt thì giáo viên mới vào được ứng dụng.',
                    },
                    {
                      mode: 'open',
                      title: '2. Mở tự do (Open Registration)',
                      desc: 'Giáo viên đăng ký và xác minh email thành công sẽ tự động được kích hoạt (active) ngay lập tức mà không cần chờ duyệt.',
                    },
                    {
                      mode: 'invite_only',
                      title: '3. Chỉ theo lời mời (Invite Only)',
                      desc: 'Chỉ những giáo viên có Mã mời hợp lệ do Admin cấp mới có thể gửi biểu mẫu đăng ký tài khoản.',
                    },
                  ] as { mode: RegistrationMode; title: string; desc: string }[]
                ).map((item) => (
                  <label
                    key={item.mode}
                    className={cn(
                      'flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all',
                      regMode === item.mode
                        ? 'border-[#1A73E8] bg-blue-50/50 dark:bg-[#1A73E8]/15'
                        : 'border-gray-200 dark:border-[#37393F] hover:bg-gray-50 dark:hover:bg-[#24262B]'
                    )}
                  >
                    <input
                      type="radio"
                      name="registration_mode"
                      checked={regMode === item.mode}
                      onChange={() => setRegMode(item.mode)}
                      className="mt-1 text-[#1A73E8]"
                    />
                    <div className="space-y-0.5">
                      <div className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                        {item.title}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{item.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-[#2D2F34]">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                  Phương thức Xác thực & Thông báo
                </h4>

                <label className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 dark:bg-[#24262B] cursor-pointer">
                  <div>
                    <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">
                      Cho phép đăng nhập bằng Email & Mật khẩu
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Phương thức đăng nhập tiêu chuẩn có kiểm tra độ mạnh mật khẩu
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={passwordEnabled}
                    onChange={(e) => setPasswordEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-[#1A73E8]"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 dark:bg-[#24262B] cursor-pointer">
                  <div>
                    <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">
                      Cho phép Đăng nhập / Liên kết Google (Redirect OAuth)
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Tự động gộp chung vào hồ sơ nếu trùng địa chỉ email đã đăng ký
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={googleEnabled}
                    onChange={(e) => setGoogleEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-[#1A73E8]"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 dark:bg-[#24262B] cursor-pointer">
                  <div>
                    <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">
                      Gửi email thông báo cho Admin khi có giáo viên mới chờ duyệt
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Gửi tới địa chỉ {overview?.adminEmail || profile.email}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyAdminEmail}
                    onChange={(e) => setNotifyAdminEmail(e.target.checked)}
                    className="w-4 h-4 rounded text-[#1A73E8]"
                  />
                </label>

                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-[#24262B] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">
                      Giới hạn số lượng tài khoản tối đa
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Để trống nếu không giới hạn số lượng giáo viên đăng ký
                    </div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    placeholder="Không giới hạn"
                    value={maxAccountsInput}
                    onChange={(e) => setMaxAccountsInput(e.target.value)}
                    className="w-40 px-3 py-2 rounded-xl bg-white dark:bg-[#1E1F22] border border-gray-300 dark:border-[#37393F] text-xs sm:text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={savingSettings}
                  onClick={() => setConfirmSaveSettingsOpen(true)}
                  className="px-5 py-2.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs sm:text-sm font-bold shadow-xs"
                >
                  Lưu cấu hình Hệ thống
                </button>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 4: SECURITY AUDIT LOG                                        */}
          {/* ================================================================ */}
          {activeTab === 'audit' && (
            <div className="rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200/80 dark:border-[#2D2F34] p-4 tablet:p-5 space-y-4">
              <div className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Tìm trong nhật ký theo hành động, người thực hiện, email..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 dark:bg-[#24262B] border border-gray-200 dark:border-[#37393F] text-xs sm:text-sm"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'all', label: 'Tất cả sự kiện' },
                      { id: 'admin', label: 'Thao tác Quản trị' },
                      { id: 'auth', label: 'Đăng nhập & Hồ sơ' },
                      { id: 'security', label: 'Cảnh báo & Mật khẩu' },
                    ] as const
                  ).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setAuditCategory(c.id)}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors',
                        auditCategory === c.id
                          ? 'bg-[#1A73E8] text-white'
                          : 'bg-gray-100 dark:bg-[#282A2E] text-gray-600 dark:text-gray-300'
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-[#2D2F34] text-[11px] font-bold uppercase text-gray-500 dark:text-gray-400">
                      <th className="py-3 px-3">Thời gian</th>
                      <th className="py-3 px-3">Sự kiện</th>
                      <th className="py-3 px-3">Người thực hiện</th>
                      <th className="py-3 px-3">Tài khoản đích / Chi tiết</th>
                      <th className="py-3 px-3 text-right">IP (Ẩn danh)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-[#2D2F34] text-xs">
                    {filteredAuditLogs.map((log) => {
                      const meta = AUDIT_ACTION_LABELS[log.action] || {
                        label: log.action,
                        badgeClass: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
                      }
                      return (
                        <tr key={log.id} className="hover:bg-gray-50/70 dark:hover:bg-[#24262B]/50">
                          <td className="py-3 px-3 whitespace-nowrap text-gray-500">
                            {formatVNDateTime(log.created_at)}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={cn(
                                'inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold',
                                meta.badgeClass
                              )}
                            >
                              {meta.label}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-gray-900 dark:text-white">
                              {log.actor_name || 'Hệ thống'}
                            </div>
                            {log.actor_email && (
                              <div className="text-[11px] text-gray-400">{log.actor_email}</div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-gray-600 dark:text-gray-300">
                            {log.target_name && (
                              <div className="font-medium">
                                Đích: {log.target_name} ({log.target_email})
                              </div>
                            )}
                            {log.detail && Object.keys(log.detail).length > 0 && (
                              <div className="text-[11px] text-gray-400 truncate max-w-md">
                                {JSON.stringify(log.detail)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-[11px] text-gray-400">
                            {log.ip_masked}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ==================================================================== */}
      {/* MODALS & CONFIRMATION DIALOGS                                        */}
      {/* ==================================================================== */}

      {/* Approve Single Teacher Confirm */}
      <ConfirmDialog
        open={Boolean(approveTarget)}
        onClose={() => setApproveTarget(null)}
        onConfirm={handleConfirmApproveSingle}
        title="Phê duyệt tài khoản giáo viên?"
        message={`Xác nhận phê duyệt tài khoản cho ${approveTarget?.full_name} (${approveTarget?.email})? Hệ thống sẽ kích hoạt trạng thái Đang hoạt động và gửi email thông báo cho giáo viên.`}
        confirmLabel="Phê duyệt ngay"
        variant="primary"
      />

      {/* Bulk Approve Confirm */}
      <ConfirmDialog
        open={confirmBulkApproveOpen}
        onClose={() => setConfirmBulkApproveOpen(false)}
        onConfirm={handleConfirmBulkApprove}
        title={`Duyệt tất cả ${pendingProfiles.length} giáo viên đang chờ?`}
        message={`Hệ thống sẽ phê duyệt đồng loạt ${pendingProfiles.length} tài khoản giáo viên đang chờ và gửi thư thông báo kích hoạt cho từng thầy/cô.`}
        confirmLabel="Duyệt tất cả"
        variant="primary"
      />

      {/* Unlock Teacher Confirm */}
      <ConfirmDialog
        open={Boolean(unlockTarget)}
        onClose={() => setUnlockTarget(null)}
        onConfirm={handleConfirmUnlockUser}
        title="Mở khóa tài khoản giáo viên?"
        message={`Khôi phục quyền đăng nhập và hoạt động bình thường cho tài khoản ${unlockTarget?.full_name} (${unlockTarget?.email})?`}
        confirmLabel="Mở khóa ngay"
        variant="primary"
      />

      {/* Lock Teacher Modal with Reason */}
      <Modal
        open={Boolean(lockTarget)}
        onClose={() => setLockTarget(null)}
        title={`Khóa tài khoản: ${lockTarget?.full_name || ''}`}
        size="md"
      >
        <form onSubmit={handleConfirmLockUser} className="space-y-4">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Khi bị khóa, phiên đăng nhập hiện tại của giáo viên <strong>{lockTarget?.email}</strong> trên mọi thiết bị sẽ bị thu hồi ngay lập tức. Dữ liệu lịch dạy của giáo viên vẫn được giữ nguyên.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
              Lý do khóa tài khoản (Hiển thị khi giáo viên đăng nhập)
            </label>
            <input
              type="text"
              required
              value={lockReason}
              onChange={(e) => setLockReason(e.target.value)}
              placeholder="Nhập lý do khóa tài khoản..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setLockTarget(null)}
              className="btn-secondary"
            >
              Hủy
            </button>
            <button type="submit" disabled={locking} className="btn-danger">
              Xác nhận khóa tài khoản
            </button>
          </div>
        </form>
      </Modal>

      {/* Admin Reset Password Modal */}
      <Modal
        open={Boolean(resetPassTarget)}
        onClose={() => {
          setResetPassTarget(null)
          setGeneratedResetResult(null)
        }}
        title={`Hỗ trợ mật khẩu: ${resetPassTarget?.full_name || ''}`}
        size="md"
      >
        <form onSubmit={handleExecuteResetPassword} className="space-y-4">
          <div className="text-xs text-gray-600 dark:text-gray-300">
            Tài khoản: <strong>{resetPassTarget?.email}</strong>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setResetMode('temp_pass')}
              className={cn(
                'p-3 rounded-xl border text-left text-xs font-semibold transition-all',
                resetMode === 'temp_pass'
                  ? 'border-[#1A73E8] bg-blue-50/70 dark:bg-[#1A73E8]/20 text-[#1A73E8] dark:text-[#8AB4F8]'
                  : 'border-gray-200 dark:border-[#37393F]'
              )}
            >
              <div className="font-bold">1. Đặt mật khẩu tạm trực tiếp</div>
              <div className="text-[11px] opacity-80 mt-0.5">
                Cấp mật khẩu mới ngay để gửi qua Zalo cho giáo viên
              </div>
            </button>
            <button
              type="button"
              onClick={() => setResetMode('email_link')}
              className={cn(
                'p-3 rounded-xl border text-left text-xs font-semibold transition-all',
                resetMode === 'email_link'
                  ? 'border-[#1A73E8] bg-blue-50/70 dark:bg-[#1A73E8]/20 text-[#1A73E8] dark:text-[#8AB4F8]'
                  : 'border-gray-200 dark:border-[#37393F]'
              )}
            >
              <div className="font-bold">2. Gửi link tự đặt lại (1 giờ)</div>
              <div className="text-[11px] opacity-80 mt-0.5">
                Tạo liên kết khôi phục gửi vào hộp thư giáo viên
              </div>
            </button>
          </div>

          {resetMode === 'temp_pass' && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                Mật khẩu mới cấp cho giáo viên
              </label>
              <input
                type="text"
                required
                value={tempPasswordInput}
                onChange={(e) => setTempPasswordInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm font-mono"
              />
              <PasswordStrengthMeter password={tempPasswordInput} />
            </div>
          )}

          {generatedResetResult && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs space-y-2">
              <div className="font-bold text-emerald-800 dark:text-emerald-200">
                Đã thực hiện thành công!
              </div>
              {generatedResetResult.tempPass && (
                <div className="flex items-center justify-between gap-2">
                  <span>
                    Mật khẩu mới: <strong className="font-mono">{generatedResetResult.tempPass}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        `Tài khoản Lịch Dạy GV của thầy/cô (${resetPassTarget?.email}) đã được cấp mật khẩu mới: ${generatedResetResult.tempPass}`
                      )
                      toast.success('Đã sao chép thông tin mật khẩu để gửi Zalo!')
                    }}
                    className="px-2.5 py-1 rounded bg-white dark:bg-[#1E1F22] border text-xs font-bold"
                  >
                    Sao chép gửi Zalo
                  </button>
                </div>
              )}
              {generatedResetResult.resetUrl && (
                <div className="space-y-1">
                  <div>Liên kết đặt lại mật khẩu (hiệu lực 1 giờ):</div>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(generatedResetResult.resetUrl!)
                      toast.success('Đã sao chép liên kết đặt lại mật khẩu!')
                    }}
                    className="px-2.5 py-1 rounded bg-white dark:bg-[#1E1F22] border text-xs font-bold"
                  >
                    Sao chép liên kết
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setResetPassTarget(null)
                setGeneratedResetResult(null)
              }}
              className="btn-secondary"
            >
              Đóng
            </button>
            <button type="submit" disabled={resettingPass} className="btn-primary">
              {resetMode === 'temp_pass' ? 'Lưu mật khẩu mới' : 'Tạo & Gửi liên kết'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete / Reject Teacher Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={
          deleteTarget?.status === 'pending'
            ? `Từ chối đăng ký: ${deleteTarget?.full_name}`
            : `Xóa tài khoản giáo viên: ${deleteTarget?.full_name}`
        }
        size="md"
      >
        <form onSubmit={handleExecuteDeleteUser} className="space-y-4">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Xác nhận xóa tài khoản <strong>{deleteTarget?.email}</strong> khỏi hệ thống? Thao tác này sẽ được ghi vào Nhật ký Kiểm toán.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
              Lý do từ chối / xóa (Tùy chọn)
            </label>
            <input
              type="text"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="VD: Tạo nhầm tài khoản hoặc không còn công tác"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="btn-secondary"
            >
              Hủy
            </button>
            <button type="submit" disabled={deletingUser} className="btn-danger">
              Xác nhận xóa
            </button>
          </div>
        </form>
      </Modal>

      {/* Create New Teacher Modal */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Tạo tài khoản Giáo viên mới (Kích hoạt ngay)"
        size="md"
      >
        <form onSubmit={handleCreateTeacherSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
              Họ và tên giáo viên <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={newTeacherName}
              onChange={(e) => setNewTeacherName(e.target.value)}
              placeholder="VD: Cô Lê Thị Mai"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
              Địa chỉ Email đăng nhập <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={newTeacherEmail}
              onChange={(e) => setNewTeacherEmail(e.target.value)}
              placeholder="maile@truong.edu.vn"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                Số điện thoại
              </label>
              <input
                type="tel"
                value={newTeacherPhone}
                onChange={(e) => setNewTeacherPhone(e.target.value)}
                placeholder="0912..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                Trường / Đơn vị
              </label>
              <input
                type="text"
                value={newTeacherSchool}
                onChange={(e) => setNewTeacherSchool(e.target.value)}
                placeholder="THCS..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
              Mật khẩu khởi tạo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={newTeacherPassword}
              onChange={(e) => setNewTeacherPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-sm font-mono"
            />
            <PasswordStrengthMeter password={newTeacherPassword} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="btn-secondary"
            >
              Hủy
            </button>
            <button type="submit" disabled={creatingTeacher} className="btn-primary">
              Tạo & Kích hoạt ngay
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Revoke Invite */}
      <ConfirmDialog
        open={Boolean(revokeInviteTargetId)}
        onClose={() => setRevokeInviteTargetId(null)}
        onConfirm={async () => {
          if (!sessionToken || !revokeInviteTargetId) return
          try {
            const res = await apiAdminRevokeInvite(sessionToken, revokeInviteTargetId)
            toast.success(res.message)
            setRevokeInviteTargetId(null)
            await fetchOverview(true)
          } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Lỗi thu hồi mã mời.')
          }
        }}
        title="Thu hồi mã mời này?"
        message="Mã mời sau khi thu hồi sẽ không thể dùng để đăng ký tài khoản mới nữa."
        confirmLabel="Thu hồi"
        variant="warning"
      />

      {/* Confirm Delete Invite */}
      <ConfirmDialog
        open={Boolean(deleteInviteTargetId)}
        onClose={() => setDeleteInviteTargetId(null)}
        onConfirm={async () => {
          if (!sessionToken || !deleteInviteTargetId) return
          try {
            const res = await apiAdminDeleteInvite(sessionToken, deleteInviteTargetId)
            toast.success(res.message)
            setDeleteInviteTargetId(null)
            await fetchOverview(true)
          } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Lỗi xóa mã mời.')
          }
        }}
        title="Xóa mã mời?"
        message="Bạn có chắc chắn muốn xóa mã mời này khỏi danh sách?"
        confirmLabel="Xóa"
        variant="danger"
      />

      {/* Confirm Save App Settings */}
      <ConfirmDialog
        open={confirmSaveSettingsOpen}
        onClose={() => setConfirmSaveSettingsOpen(false)}
        onConfirm={handleConfirmSaveSettings}
        title="Xác nhận lưu cấu hình hệ thống?"
        message="Thay đổi chế độ đăng ký và phương thức đăng nhập sẽ áp dụng ngay lập tức cho các tài khoản đăng ký mới."
        confirmLabel="Lưu cấu hình"
        variant="primary"
      />
    </div>
  )
}

