import type { 
  SchoolSchedule, 
  ScheduleRule, 
  SessionException, 
  ExtraSession, 
  Class, 
  ConflictCheckResult 
} from '../types'
import { dateToWeekday, timeRangesOverlap, timeToMinutes, parseDateStr } from './dateUtils'

export interface CheckConflictParams {
  date: string // YYYY-MM-DD
  start_time: string // HH:mm
  end_time: string // HH:mm
  class_id?: string
  location?: string
  exclude_id?: string // ID to exclude (e.g. when editing an extra session or moving)
  schoolSchedule: SchoolSchedule[]
  scheduleRules: ScheduleRule[]
  sessionExceptions: SessionException[]
  extraSessions: ExtraSession[]
  classes: Class[]
}

export function checkScheduleConflict({
  date,
  start_time,
  end_time,
  class_id,
  location = '',
  exclude_id,
  schoolSchedule,
  scheduleRules,
  sessionExceptions,
  extraSessions,
  classes
}: CheckConflictParams): ConflictCheckResult {
  const conflicts: string[] = []
  const warnings: string[] = []

  const targetDateObj = parseDateStr(date)
  const targetWeekday = dateToWeekday(targetDateObj)
  const currentClass = classes.find(c => c.id === class_id)
  const currentLocation = location || currentClass?.location || ''

  // 1. Check school schedule on that weekday
  for (const item of schoolSchedule) {
    if (item.weekday === targetWeekday && item.valid_from <= date && (!item.valid_to || item.valid_to >= date)) {
      if (timeRangesOverlap(start_time, end_time, item.start_time, item.end_time)) {
        conflicts.push(`Trùng với tiết trường: ${item.class_name} - ${item.subject} (${item.period}, ${item.start_time}–${item.end_time}${item.room ? ', Phòng ' + item.room : ''})`)
      } else {
        // Check travel time buffer (< 15 mins)
        const diff = Math.min(
          Math.abs(timeToMinutes(start_time) - timeToMinutes(item.end_time)),
          Math.abs(timeToMinutes(item.start_time) - timeToMinutes(end_time))
        )
        if (diff < 15 && diff >= 0) {
          warnings.push(`Chỉ cách tiết trường (${item.subject}) ${diff} phút, lưu ý thời gian di chuyển.`)
        }
      }
    }
  }

  // 2. Check fixed tutoring rules
  for (const rule of scheduleRules) {
    if (rule.weekday === targetWeekday && rule.valid_from <= date && (!rule.valid_to || rule.valid_to >= date)) {
      // Check exception for this rule on this date
      const ex = sessionExceptions.find(e => e.rule_id === rule.id && e.original_date === date)
      if (ex && (ex.action === 'cancelled' || ex.action === 'moved')) {
        continue // This original slot is free
      }

      if (exclude_id && rule.id === exclude_id) {
        continue
      }

      const otherCls = classes.find(c => c.id === rule.class_id)
      const otherName = otherCls?.name || 'Lớp dạy thêm'
      const otherLoc = otherCls?.location || ''

      if (timeRangesOverlap(start_time, end_time, rule.start_time, rule.end_time)) {
        conflicts.push(`Trùng với lịch cố định lớp: ${otherName} (${rule.start_time}–${rule.end_time})`)
      } else if (otherLoc && currentLocation && otherLoc !== currentLocation) {
        const diff = Math.min(
          Math.abs(timeToMinutes(start_time) - timeToMinutes(rule.end_time)),
          Math.abs(timeToMinutes(rule.start_time) - timeToMinutes(end_time))
        )
        if (diff < 20 && diff >= 0) {
          warnings.push(`Chỉ cách lớp ${otherName} (${otherLoc}) ${diff} phút, khác địa điểm (${currentLocation}).`)
        }
      }
    }
  }

  // 3. Check moved sessions landing on this date
  for (const ex of sessionExceptions) {
    if (ex.action === 'moved' && ex.new_date === date && ex.new_start && ex.new_end) {
      if (exclude_id && ex.id === exclude_id) continue

      const rule = scheduleRules.find(r => r.id === ex.rule_id)
      const otherCls = classes.find(c => c.id === rule?.class_id)
      const otherName = otherCls?.name || 'Lớp đã dời'
      const otherLoc = otherCls?.location || ''

      if (timeRangesOverlap(start_time, end_time, ex.new_start, ex.new_end)) {
        conflicts.push(`Trùng với buổi đã dời: ${otherName} (${ex.new_start}–${ex.new_end})`)
      } else if (otherLoc && currentLocation && otherLoc !== currentLocation) {
        const diff = Math.min(
          Math.abs(timeToMinutes(start_time) - timeToMinutes(ex.new_end)),
          Math.abs(timeToMinutes(ex.new_start) - timeToMinutes(end_time))
        )
        if (diff < 20 && diff >= 0) {
          warnings.push(`Chỉ cách buổi dời ${otherName} (${otherLoc}) ${diff} phút.`)
        }
      }
    }
  }

  // 4. Check extra sessions on this date
  for (const extra of extraSessions) {
    if (extra.date === date) {
      if (exclude_id && extra.id === exclude_id) continue

      const otherCls = classes.find(c => c.id === extra.class_id)
      const otherName = otherCls?.name || 'Buổi phát sinh'
      const otherLoc = otherCls?.location || ''

      if (timeRangesOverlap(start_time, end_time, extra.start_time, extra.end_time)) {
        conflicts.push(`Trùng với buổi phát sinh: ${otherName} (${extra.start_time}–${extra.end_time})`)
      } else if (otherLoc && currentLocation && otherLoc !== currentLocation) {
        const diff = Math.min(
          Math.abs(timeToMinutes(start_time) - timeToMinutes(extra.end_time)),
          Math.abs(timeToMinutes(extra.start_time) - timeToMinutes(end_time))
        )
        if (diff < 20 && diff >= 0) {
          warnings.push(`Chỉ cách buổi phát sinh ${otherName} (${otherLoc}) ${diff} phút.`)
        }
      }
    }
  }

  if (conflicts.length > 0) {
    return {
      hasConflict: true,
      severity: 'error',
      message: conflicts.join(' | '),
      conflicts,
    }
  }

  if (warnings.length > 0) {
    return {
      hasConflict: false,
      severity: 'warning',
      message: warnings.join(' | '),
      conflicts: warnings,
    }
  }

  return {
    hasConflict: false,
    severity: null,
    message: null,
    conflicts: [],
  }
}

