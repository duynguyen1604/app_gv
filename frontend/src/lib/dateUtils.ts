import { format, parse, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isToday, isSameDay } from 'date-fns'
import { vi } from 'date-fns/locale'

export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh'

// Format date for display: dd/MM/yyyy
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd/MM/yyyy')
}

// Format date short: dd/MM
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd/MM')
}

// Format time: HH:mm
export function formatTime(time: string): string {
  return time.substring(0, 5)
}

// Format currency VND
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount) + 'đ'
}

// Get current week (Mon-Sun) for a given date
export function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 })
  const end = endOfWeek(date, { weekStartsOn: 1 })
  return eachDayOfInterval({ start, end })
}

// Vietnamese weekday names
export const VI_WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
export const VI_WEEKDAYS_FULL = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

// Get weekday name (1=Mon=T2, 7=Sun=CN)
export function getWeekdayName(weekday: number, full = false): string {
  const idx = weekday - 1
  return full ? VI_WEEKDAYS_FULL[idx] : VI_WEEKDAYS[idx]
}

// Convert JS Date weekday (0=Sun) to our weekday (1=Mon...7=Sun)
export function dateToWeekday(date: Date): number {
  const day = date.getDay() // 0=Sun, 1=Mon...6=Sat
  return day === 0 ? 7 : day
}

// Format week header
export function formatWeekHeader(startDate: Date): string {
  const end = endOfWeek(startDate, { weekStartsOn: 1 })
  const startStr = format(startDate, 'dd/MM', { locale: vi })
  const endStr = format(end, 'dd/MM/yyyy', { locale: vi })
  return `${startStr} – ${endStr}`
}

// Get week start (Monday)
export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 })
}

export function nextWeek(date: Date): Date {
  return addWeeks(date, 1)
}

export function prevWeek(date: Date): Date {
  return subWeeks(date, 1)
}

export function isDateToday(date: Date): boolean {
  return isToday(date)
}

export function isSameDayDate(d1: Date, d2: Date): boolean {
  return isSameDay(d1, d2)
}

// Format month for display
export function formatMonth(month: string): string {
  // month = YYYY-MM
  const [year, m] = month.split('-')
  return `Tháng ${parseInt(m)}/${year}`
}

// Get current month string
export function getCurrentMonth(): string {
  return format(new Date(), 'yyyy-MM')
}

// Parse YYYY-MM-DD string to Date
export function parseDateStr(dateStr: string): Date {
  return parseISO(dateStr)
}

// Format Date to YYYY-MM-DD
export function toDateStr(date: Date): string {
  return format(date, 'yyyy-dd-MM') // fix: should be yyyy-MM-dd
}

// Actually format properly
export function dateToStr(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

// Get Vietnamese full date
export function formatFullDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  const weekday = getWeekdayName(dateToWeekday(d), true)
  return `${weekday}, ${format(d, 'dd/MM/yyyy')}`
}

// Check if two time ranges overlap
export function timeRangesOverlap(
  start1: string, end1: string,
  start2: string, end2: string
): boolean {
  const s1 = timeToMinutes(start1)
  const e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2)
  const e2 = timeToMinutes(end2)
  return s1 < e2 && s2 < e1
}

// Convert HH:mm to minutes
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// Get list of months for a range
export function getMonthsInRange(from: Date, to: Date): string[] {
  const months: string[] = []
  let current = new Date(from.getFullYear(), from.getMonth(), 1)
  const end = new Date(to.getFullYear(), to.getMonth(), 1)
  while (current <= end) {
    months.push(format(current, 'yyyy-MM'))
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1)
  }
  return months
}

// Get all days in a month
export function getDaysInMonth(month: string): Date[] {
  const [year, m] = month.split('-').map(Number)
  const start = new Date(year, m - 1, 1)
  const end = new Date(year, m, 0)
  return eachDayOfInterval({ start, end })
}

