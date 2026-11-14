import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/utils'

const COMMON_WEAK_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password1',
  'password123',
  'qwerty123',
  'qwertyuiop',
  'abc12345',
  '11111111',
  '00000000',
  'matkhau1',
  'matkhau123',
  'iloveyou1',
  'zaq12wsx',
])

export interface PasswordValidationResult {
  hasMinLength: boolean
  hasLetter: boolean
  hasNumber: boolean
  hasSpecialOrUpper: boolean
  isCommonWeak: boolean
  isValid: boolean
  score: 0 | 1 | 2 | 3 | 4
  label: string
}

export function evaluatePasswordStrength(password: string): PasswordValidationResult {
  const hasMinLength = password.length >= 8
  const hasLetter = /[a-zA-ZÀ-ỹ]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecialOrUpper =
    (/[A-Z]/.test(password) && /[a-z]/.test(password)) ||
    /[^a-zA-Z0-9]/.test(password) ||
    password.length >= 12
  const isCommonWeak =
    password.length > 0 && COMMON_WEAK_PASSWORDS.has(password.toLowerCase())

  const isValid = hasMinLength && hasLetter && hasNumber && !isCommonWeak

  let rawScore = 0
  if (hasMinLength) rawScore += 1
  if (hasLetter) rawScore += 1
  if (hasNumber) rawScore += 1
  if (hasSpecialOrUpper && isValid) rawScore += 1
  if (isCommonWeak) rawScore = 1

  const score = (password.length === 0 ? 0 : Math.min(4, Math.max(1, rawScore))) as
    | 0
    | 1
    | 2
    | 3
    | 4

  const labels: Record<number, string> = {
    0: 'Chưa nhập',
    1: isCommonWeak ? 'Quá phổ biến (Không an toàn)' : 'Yếu',
    2: 'Trung bình',
    3: 'Khá mạnh',
    4: 'Rất mạnh',
  }

  return {
    hasMinLength,
    hasLetter,
    hasNumber,
    hasSpecialOrUpper,
    isCommonWeak,
    isValid,
    score,
    label: labels[score],
  }
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  const result = evaluatePasswordStrength(password)

  if (!password) return null

  const barColors: Record<number, string> = {
    0: 'bg-gray-200 dark:bg-gray-700',
    1: 'bg-red-500',
    2: 'bg-amber-500',
    3: 'bg-blue-500',
    4: 'bg-emerald-500',
  }

  const textColors: Record<number, string> = {
    0: 'text-gray-500',
    1: 'text-red-600 dark:text-red-400',
    2: 'text-amber-600 dark:text-amber-400',
    3: 'text-blue-600 dark:text-blue-400',
    4: 'text-emerald-600 dark:text-emerald-400',
  }

  const rules = [
    { ok: result.hasMinLength, text: 'Tối thiểu 8 ký tự' },
    { ok: result.hasLetter, text: 'Có chứa chữ cái (a–z)' },
    { ok: result.hasNumber, text: 'Có chứa chữ số (0–9)' },
  ]

  return (
    <div className="mt-2 space-y-2 rounded-xl bg-gray-50/90 dark:bg-[#1E1F22] p-3 border border-gray-200/70 dark:border-[#2D2F34]">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500 dark:text-gray-400 font-medium">Độ mạnh mật khẩu:</span>
        <span className={cn('font-semibold', textColors[result.score])}>{result.label}</span>
      </div>

      {/* 4-segment strength bar */}
      <div className="grid grid-cols-4 gap-1.5 h-1.5">
        {[1, 2, 3, 4].map((idx) => (
          <div
            key={idx}
            className={cn(
              'rounded-full transition-colors duration-200',
              result.score >= idx ? barColors[result.score] : 'bg-gray-200 dark:bg-gray-700'
            )}
          />
        ))}
      </div>

      {result.isCommonWeak && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium pt-0.5">
          <AlertTriangle size={14} className="shrink-0" />
          <span>Mật khẩu này quá phổ biến, vui lòng chọn mật khẩu khó đoán hơn.</span>
        </div>
      )}

      {/* Checklist */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-0.5">
        {rules.map((r) => (
          <div
            key={r.text}
            className={cn(
              'flex items-center gap-1.5 text-[11px]',
              r.ok
                ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                : 'text-gray-500 dark:text-gray-400'
            )}
          >
            {r.ok ? (
              <CheckCircle2 size={13} className="shrink-0" />
            ) : (
              <Circle size={13} className="shrink-0 opacity-60" />
            )}
            <span>{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

