import { create } from 'zustand'
import type { PublicAuthConfig, UserProfile } from '../types'
import {
  apiCompleteOnboarding,
  apiGetMe,
  apiGetPublicAuthConfig,
  apiLogout,
  apiRefreshSession,
  apiSyncSupabaseSession,
  getRememberMePreference,
  loadPersistedAuthSession,
  persistAuthSession,
  setRememberMePreference,
  supabase,
} from '../lib/supabase'
import { useAppStore } from './useAppStore'
import { bootstrapCloudSync, pushServerState } from '../lib/backendSync'

interface AuthState {
  profile: UserProfile | null
  sessionToken: string | null
  expiresAt: number | null
  rememberMe: boolean
  publicConfig: PublicAuthConfig | null
  isInitialized: boolean
  isLoading: boolean
  sessionExpiredMidWork: boolean
  pendingVerificationEmail: string | null
  pendingDevVerifyUrl: string | null
  pendingAdminApprovalCount: number
  onboardingOpen: boolean

  initializeAuth: () => Promise<void>
  setRememberMe: (val: boolean) => void
  setPendingVerification: (email: string | null, devUrl?: string | null) => void
  setPendingAdminApprovalCount: (count: number) => void
  updateProfileState: (profile: UserProfile) => Promise<void>
  openOnboardingTour: () => void
  closeOnboardingTour: () => Promise<void>
  setAuthenticatedSession: (params: {
    profile: UserProfile
    sessionToken: string
    expiresAt: number
    rememberMe?: boolean
  }) => Promise<void>
  refreshSessionSilently: () => Promise<void>
  markSessionExpiredMidWork: () => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  profile: null,
  sessionToken: null,
  expiresAt: null,
  rememberMe: getRememberMePreference(),
  publicConfig: null,
  isInitialized: false,
  isLoading: true,
  sessionExpiredMidWork: false,
  pendingVerificationEmail: null,
  pendingDevVerifyUrl: null,
  pendingAdminApprovalCount: 0,
  onboardingOpen: false,

  setRememberMe: (val) => {
    setRememberMePreference(val)
    set({ rememberMe: val })
  },

  setPendingVerification: (email, devUrl = null) => {
    set({
      pendingVerificationEmail: email,
      pendingDevVerifyUrl: devUrl || null,
    })
  },

  setPendingAdminApprovalCount: (count) => {
    set({ pendingAdminApprovalCount: Math.max(0, count) })
  },

  updateProfileState: async (profile) => {
    const { sessionToken, expiresAt, rememberMe } = get()
    set({ profile })
    if (sessionToken && expiresAt) {
      await persistAuthSession({
        profile,
        sessionToken,
        expiresAt,
        rememberMe,
      })
    }
  },

  openOnboardingTour: () => {
    set({ onboardingOpen: true })
  },

  closeOnboardingTour: async () => {
    const { profile, sessionToken, expiresAt, rememberMe } = get()
    set({ onboardingOpen: false })

    if (profile && profile.onboarding_completed === false) {
      const updatedProfile: UserProfile = {
        ...profile,
        onboarding_completed: true,
      }
      set({ profile: updatedProfile })
      if (sessionToken && expiresAt) {
        await persistAuthSession({
          profile: updatedProfile,
          sessionToken,
          expiresAt,
          rememberMe,
        })
      }
      if (sessionToken) {
        const res = await apiCompleteOnboarding(sessionToken)
        if (res.success && res.profile) {
          set({ profile: res.profile })
          if (expiresAt) {
            await persistAuthSession({
              profile: res.profile,
              sessionToken,
              expiresAt,
              rememberMe,
            })
          }
        }
      }
    }
  },

  setAuthenticatedSession: async ({
    profile,
    sessionToken,
    expiresAt,
    rememberMe,
  }) => {
    const rem = rememberMe ?? get().rememberMe
    setRememberMePreference(rem)

    const hadExpiredMidWork = get().sessionExpiredMidWork

    await persistAuthSession({
      profile,
      sessionToken,
      expiresAt,
      rememberMe: rem,
    })

    // Sync user ID with main app store
    useAppStore.getState().setUserId(profile.id)

    const shouldAutoOpenOnboarding =
      profile.status === 'active' && profile.onboarding_completed === false

    set({
      profile,
      sessionToken,
      expiresAt,
      rememberMe: rem,
      sessionExpiredMidWork: false,
      isInitialized: true,
      isLoading: false,
      onboardingOpen: shouldAutoOpenOnboarding ? true : get().onboardingOpen,
    })

    // Section 4.2: If user just re-authenticated after a mid-work session expiration,
    // immediately push their preserved unsaved changes (attendance, schedule, fees) to the server!
    if (hadExpiredMidWork && profile.status === 'active') {
      void pushServerState(profile.id).catch(() => undefined)
    } else if (profile.status === 'active') {
      void bootstrapCloudSync().catch(() => undefined)
    }
  },

  initializeAuth: async () => {
    set({ isLoading: true })

    const publicConfig = await apiGetPublicAuthConfig()
    set({ publicConfig })

    // 1. Check if Supabase cloud client has an active session
    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession()
        if (data.session?.access_token && data.session.user) {
          const synced = await apiSyncSupabaseSession(data.session.access_token, {
            id: data.session.user.id,
            email: data.session.user.email || '',
            full_name: data.session.user.user_metadata?.full_name,
            phone: data.session.user.user_metadata?.phone,
            school: data.session.user.user_metadata?.school,
            email_verified: Boolean(data.session.user.email_confirmed_at),
            provider:
              data.session.user.app_metadata?.provider === 'google' ? 'google' : 'email',
          })
          await get().setAuthenticatedSession({
            profile: synced.profile,
            sessionToken: synced.sessionToken,
            expiresAt: synced.expiresAt,
            rememberMe: get().rememberMe,
          })
          return
        }
      } catch {
        // Fallback to local persisted session
      }
    }

    // 2. Load persisted session (from localStorage/sessionStorage or CacheStorage for iPhone PWA)
    const persisted = await loadPersistedAuthSession()
    if (!persisted || !persisted.sessionToken) {
      set({
        profile: null,
        sessionToken: null,
        expiresAt: null,
        isInitialized: true,
        isLoading: false,
      })
      return
    }

    try {
      const meResp = await apiGetMe(persisted.sessionToken)
      if (meResp.authenticated && meResp.profile) {
        await get().setAuthenticatedSession({
          profile: meResp.profile,
          sessionToken: persisted.sessionToken,
          expiresAt: persisted.expiresAt,
          rememberMe: persisted.rememberMe,
        })
        return
      }

      if (meResp.errorCode === 'ACCOUNT_LOCKED' && meResp.profile) {
        set({
          profile: { ...meResp.profile, status: 'locked' },
          sessionToken: persisted.sessionToken,
          expiresAt: persisted.expiresAt,
          isInitialized: true,
          isLoading: false,
        })
        return
      }

      // Token expired or invalid on startup -> clear and prompt login
      await persistAuthSession(null)
      set({
        profile: null,
        sessionToken: null,
        expiresAt: null,
        isInitialized: true,
        isLoading: false,
      })
    } catch {
      // Offline on iPhone PWA startup: keep cached profile active so teacher can view/mark attendance offline
      useAppStore.getState().setUserId(persisted.profile.id)
      set({
        profile: persisted.profile,
        sessionToken: persisted.sessionToken,
        expiresAt: persisted.expiresAt,
        rememberMe: persisted.rememberMe,
        isInitialized: true,
        isLoading: false,
      })
    }
  },

  refreshSessionSilently: async () => {
    const { sessionToken, profile, rememberMe } = get()
    if (!sessionToken || !profile) return

    try {
      const res = await apiRefreshSession(sessionToken)
      if (res.success && res.profile && res.sessionToken && res.expiresAt) {
        await persistAuthSession({
          profile: res.profile,
          sessionToken: res.sessionToken,
          expiresAt: res.expiresAt,
          rememberMe,
        })
        set({
          profile: res.profile,
          sessionToken: res.sessionToken,
          expiresAt: res.expiresAt,
          sessionExpiredMidWork: false,
        })
        return
      }

      // Section 6.4: If account was locked while logged in, block immediately!
      if (res.errorCode === 'ACCOUNT_LOCKED') {
        set({
          profile: { ...profile, status: 'locked' },
          sessionExpiredMidWork: false,
        })
        return
      }

      // Section 4.2: Session expired mid-work -> show yellow banner and KEEP unsaved state!
      if (res.errorCode === 'UNAUTHORIZED') {
        set({ sessionExpiredMidWork: true })
      }
    } catch {
      // Network temporarily unavailable; do not log out user on iPhone
    }
  },

  markSessionExpiredMidWork: () => {
    if (get().profile) {
      set({ sessionExpiredMidWork: true })
    }
  },

  logout: async () => {
    const token = get().sessionToken
    await apiLogout(token)
    await persistAuthSession(null)
    useAppStore.getState().setUserId('local')
    set({
      profile: null,
      sessionToken: null,
      expiresAt: null,
      sessionExpiredMidWork: false,
      pendingVerificationEmail: null,
      pendingDevVerifyUrl: null,
      onboardingOpen: false,
    })
  },
}))

