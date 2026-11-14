import type { Env, ServerState } from '../../types/index'
import { kvGet, kvSet } from '../../shared/kv.service'

export function emptyServerState(): ServerState {
  return {
    classes: [],
    students: [],
    studentEnrollments: [],
    studentStatusHistory: [],
    sessionGuests: [],
    scheduleRules: [],
    sessionExceptions: [],
    extraSessions: [],
    schoolPeriods: [],
    schoolSchedule: [],
    schoolWeekConfigs: [],
    holidays: [],
    sessionNotes: [],
    attendance: [],
    payments: [],
    paymentTransactions: [],
    monthLocks: [],
    changeLogs: [],
    calendarEventMap: [],
    calendarSyncLogs: [],
    settings: null,
    notificationLogs: [],
  }
}

export function syncKeyForUser(userId: string): string {
  const clean = String(userId || '').trim()
  return `v3_clean_sync_state:${clean}`
}

export function normalizeSyncPayload(body: Record<string, any>): ServerState {
  return {
    classes: Array.isArray(body.classes) ? body.classes : [],
    students: Array.isArray(body.students) ? body.students : [],
    studentEnrollments: Array.isArray(body.studentEnrollments) ? body.studentEnrollments : [],
    studentStatusHistory: Array.isArray(body.studentStatusHistory)
      ? body.studentStatusHistory
      : [],
    sessionGuests: Array.isArray(body.sessionGuests) ? body.sessionGuests : [],
    scheduleRules: Array.isArray(body.scheduleRules) ? body.scheduleRules : [],
    sessionExceptions: Array.isArray(body.sessionExceptions) ? body.sessionExceptions : [],
    extraSessions: Array.isArray(body.extraSessions) ? body.extraSessions : [],
    schoolPeriods: Array.isArray(body.schoolPeriods) ? body.schoolPeriods : [],
    schoolSchedule: Array.isArray(body.schoolSchedule) ? body.schoolSchedule : [],
    schoolWeekConfigs: Array.isArray(body.schoolWeekConfigs) ? body.schoolWeekConfigs : [],
    holidays: Array.isArray(body.holidays) ? body.holidays : [],
    sessionNotes: Array.isArray(body.sessionNotes) ? body.sessionNotes : [],
    attendance: Array.isArray(body.attendance) ? body.attendance : [],
    payments: Array.isArray(body.payments) ? body.payments : [],
    paymentTransactions: Array.isArray(body.paymentTransactions) ? body.paymentTransactions : [],
    monthLocks: Array.isArray(body.monthLocks) ? body.monthLocks : [],
    changeLogs: Array.isArray(body.changeLogs) ? body.changeLogs : [],
    calendarEventMap: Array.isArray(body.calendarEventMap) ? body.calendarEventMap : [],
    calendarSyncLogs: Array.isArray(body.calendarSyncLogs) ? body.calendarSyncLogs : [],
    settings: body.settings || null,
    notificationLogs: Array.isArray(body.notificationLogs) ? body.notificationLogs : [],
  }
}

export async function getSyncStateForUser(env: Env, userId: string): Promise<ServerState> {
  return (await kvGet<ServerState>(env.DB, syncKeyForUser(userId))) || emptyServerState()
}

export async function saveSyncStateForUser(
  env: Env,
  userId: string,
  state: ServerState
): Promise<void> {
  await kvSet(env.DB, syncKeyForUser(userId), state)
}

