import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Generate a random color for a class
export function randomClassColor(): string {
  const colors = [
    '#F97316', '#8B5CF6', '#EC4899', '#14B8A6',
    '#F59E0B', '#06B6D4', '#84CC16', '#EF4444'
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

// Status display
export function studentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: 'Đang học',
    trial: 'Học thử',
    left: 'Đã nghỉ'
  }
  return labels[status] || status
}

export function studentStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    trial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    left: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  }
  return colors[status] || ''
}

// Attendance status
export function attendanceLabel(status: string): string {
  const labels: Record<string, string> = {
    present: 'Có mặt',
    absent: 'Vắng',
    excused: 'Vắng phép'
  }
  return labels[status] || '-'
}

// Truncate text
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.substring(0, maxLen) + '...'
}

// Validate phone number (VN)
export function isValidPhone(phone: string): boolean {
  return /^(0|\+84)[0-9]{9,10}$/.test(phone.replace(/\s/g, ''))
}

// Format phone for tel: link
export function formatPhoneTel(phone: string): string {
  return 'tel:' + phone.replace(/\s/g, '')
}

// Generate unique ID (fallback when Supabase not available)
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

