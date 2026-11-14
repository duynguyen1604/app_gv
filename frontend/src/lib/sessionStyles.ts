import type { CalendarSession } from '../types'

export interface SessionVisualStyle {
  bgLight: string
  bgDark: string
  borderColor: string
  textLight: string
  textDark: string
  badgeBgLight: string
  badgeTextLight: string
  dotColor: string
}

const PALETTE_BY_HEX: Record<string, SessionVisualStyle> = {
  '#3B82F6': {
    // Blue - Văn 12 onl (Thùy)
    bgLight: '#EFF6FF',
    bgDark: 'rgba(59, 130, 246, 0.22)',
    borderColor: '#2563EB',
    textLight: '#1E3A8A',
    textDark: '#DBEAFE',
    badgeBgLight: '#DBEAFE',
    badgeTextLight: '#1D4ED8',
    dotColor: '#2563EB',
  },
  '#EC4899': {
    // Pink - Văn 9 off 2hs
    bgLight: '#FDF2F8',
    bgDark: 'rgba(236, 72, 153, 0.22)',
    borderColor: '#DB2777',
    textLight: '#831843',
    textDark: '#FCE7F3',
    badgeBgLight: '#FCE7F3',
    badgeTextLight: '#BE185D',
    dotColor: '#DB2777',
  },
  '#8B5CF6': {
    // Purple - Văn 7V1
    bgLight: '#F5F3FF',
    bgDark: 'rgba(139, 92, 246, 0.24)',
    borderColor: '#7C3AED',
    textLight: '#4C1D95',
    textDark: '#EDE9FE',
    badgeBgLight: '#EDE9FE',
    badgeTextLight: '#6D28D9',
    dotColor: '#7C3AED',
  },
  '#F59E0B': {
    // Amber - Văn 9 onl
    bgLight: '#FFFBEB',
    bgDark: 'rgba(245, 158, 11, 0.22)',
    borderColor: '#D97706',
    textLight: '#78350F',
    textDark: '#FEF3C7',
    badgeBgLight: '#FEF3C7',
    badgeTextLight: '#B45309',
    dotColor: '#D97706',
  },
  '#10B981': {
    // Emerald Green - Văn 7 Bảo
    bgLight: '#ECFDF5',
    bgDark: 'rgba(16, 185, 129, 0.22)',
    borderColor: '#059669',
    textLight: '#064E3B',
    textDark: '#D1FAE5',
    badgeBgLight: '#D1FAE5',
    badgeTextLight: '#047857',
    dotColor: '#059669',
  },
  '#F43F5E': {
    // Rose - Văn 9V1
    bgLight: '#FFF1F2',
    bgDark: 'rgba(244, 63, 94, 0.22)',
    borderColor: '#E11D48',
    textLight: '#881337',
    textDark: '#FFE4E6',
    badgeBgLight: '#FFE4E6',
    badgeTextLight: '#BE123C',
    dotColor: '#E11D48',
  },
  '#F97316': {
    // Orange - Văn 8, V6
    bgLight: '#FFF7ED',
    bgDark: 'rgba(249, 115, 22, 0.22)',
    borderColor: '#EA580C',
    textLight: '#7C2D12',
    textDark: '#FFEDD5',
    badgeBgLight: '#FFEDD5',
    badgeTextLight: '#C2410C',
    dotColor: '#EA580C',
  },
  '#06B6D4': {
    // Cyan - Văn 12V1 Trang
    bgLight: '#ECFEFF',
    bgDark: 'rgba(6, 182, 212, 0.22)',
    borderColor: '#0891B2',
    textLight: '#164E63',
    textDark: '#CFFAFE',
    badgeBgLight: '#CFFAFE',
    badgeTextLight: '#0E7490',
    dotColor: '#0891B2',
  },
  '#6366F1': {
    // Indigo - TV 5 Bảo Anh
    bgLight: '#EEF2FF',
    bgDark: 'rgba(99, 102, 241, 0.24)',
    borderColor: '#4F46E5',
    textLight: '#312E81',
    textDark: '#E0E7FF',
    badgeBgLight: '#E0E7FF',
    badgeTextLight: '#4338CA',
    dotColor: '#4F46E5',
  },
  '#EAB308': {
    // Yellow - Văn 6V1; V7; TV2
    bgLight: '#FEFCE8',
    bgDark: 'rgba(234, 179, 8, 0.22)',
    borderColor: '#CA8A04',
    textLight: '#713F12',
    textDark: '#FEF9C3',
    badgeBgLight: '#FEF08A',
    badgeTextLight: '#854D0E',
    dotColor: '#CA8A04',
  },
  '#0EA5E9': {
    // Sky - Văn 12; V9
    bgLight: '#F0F9FF',
    bgDark: 'rgba(14, 165, 233, 0.22)',
    borderColor: '#0284C7',
    textLight: '#0C4A6E',
    textDark: '#E0F2FE',
    badgeBgLight: '#E0F2FE',
    badgeTextLight: '#0369A1',
    dotColor: '#0284C7',
  },
  '#14B8A6': {
    // Teal - TV5 Hiển
    bgLight: '#F0FDFA',
    bgDark: 'rgba(20, 184, 166, 0.22)',
    borderColor: '#0D9488',
    textLight: '#134E4A',
    textDark: '#CCFBF1',
    badgeBgLight: '#CCFBF1',
    badgeTextLight: '#0F766E',
    dotColor: '#0D9488',
  },
  '#A855F7': {
    // Violet - Văn 7V2
    bgLight: '#FAF5FF',
    bgDark: 'rgba(168, 85, 247, 0.24)',
    borderColor: '#9333EA',
    textLight: '#581C87',
    textDark: '#F3E8FF',
    badgeBgLight: '#F3E8FF',
    badgeTextLight: '#7E22CE',
    dotColor: '#9333EA',
  },
  '#EA580C': {
    // Deep Orange - Văn 8
    bgLight: '#FFF7ED',
    bgDark: 'rgba(234, 88, 12, 0.24)',
    borderColor: '#C2410C',
    textLight: '#7C2D12',
    textDark: '#FFEDD5',
    badgeBgLight: '#FFEDD5',
    badgeTextLight: '#9A3412',
    dotColor: '#C2410C',
  },
}

const SCHOOL_STYLE: SessionVisualStyle = {
  bgLight: '#F1F5F9',
  bgDark: 'rgba(100, 116, 139, 0.22)',
  borderColor: '#475569',
  textLight: '#1E293B',
  textDark: '#E2E8F0',
  badgeBgLight: '#E2E8F0',
  badgeTextLight: '#334155',
  dotColor: '#475569',
}

const DUTY_STYLE: SessionVisualStyle = {
  bgLight: '#F8FAFC',
  bgDark: 'rgba(71, 85, 105, 0.25)',
  borderColor: '#64748B',
  textLight: '#334155',
  textDark: '#CBD5E1',
  badgeBgLight: '#E2E8F0',
  badgeTextLight: '#475569',
  dotColor: '#64748B',
}

const EXTRA_STYLE: SessionVisualStyle = {
  bgLight: '#F5F3FF',
  bgDark: 'rgba(124, 58, 237, 0.25)',
  borderColor: '#7C3AED',
  textLight: '#4C1D95',
  textDark: '#EDE9FE',
  badgeBgLight: '#EDE9FE',
  badgeTextLight: '#6D28D9',
  dotColor: '#7C3AED',
}

const DEFAULT_TUTORING_STYLE: SessionVisualStyle = {
  bgLight: '#EFF6FF',
  bgDark: 'rgba(37, 99, 235, 0.22)',
  borderColor: '#2563EB',
  textLight: '#1E3A8A',
  textDark: '#DBEAFE',
  badgeBgLight: '#DBEAFE',
  badgeTextLight: '#1D4ED8',
  dotColor: '#2563EB',
}

export function getSessionVisualStyle(session: CalendarSession): SessionVisualStyle {
  if (session.type === 'school') return SCHOOL_STYLE
  if (session.type === 'duty') return DUTY_STYLE
  if (session.type === 'tutoring_extra') {
    if (session.color && PALETTE_BY_HEX[session.color.toUpperCase()]) {
      return PALETTE_BY_HEX[session.color.toUpperCase()]
    }
    return EXTRA_STYLE
  }
  if (session.color) {
    const key = session.color.toUpperCase()
    if (PALETTE_BY_HEX[key]) return PALETTE_BY_HEX[key]
  }
  return DEFAULT_TUTORING_STYLE
}

export function getSessionInlineStyle(
  session: CalendarSession,
  darkMode: boolean
): React.CSSProperties {
  if (session.is_cancelled) {
    return {
      backgroundColor: darkMode ? 'rgba(39, 39, 42, 0.55)' : '#F8FAFC',
      borderLeftColor: '#94A3B8',
      color: darkMode ? '#9CA3AF' : '#64748B',
    }
  }
  const st = getSessionVisualStyle(session)
  return {
    backgroundColor: darkMode ? st.bgDark : st.bgLight,
    borderLeftColor: st.borderColor,
    color: darkMode ? st.textDark : st.textLight,
  }
}

