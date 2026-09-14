import { describe, it, expect } from 'vitest'
import { canViewBugReport, canPostBugReportComment } from './bug-report-access'

describe('bug report access', () => {
  const report = { reporterId: 7 }

  it('admins can view and comment on any report', () => {
    expect(canViewBugReport(report, { id: 1, isAdmin: true })).toBe(true)
    expect(canPostBugReportComment({ reporterId: null }, { id: 1, isAdmin: true })).toBe(true)
  })

  it('the reporter can view and comment on their own report', () => {
    expect(canViewBugReport(report, { id: 7, isAdmin: false })).toBe(true)
    expect(canPostBugReportComment(report, { id: 7, isAdmin: false })).toBe(true)
  })

  it('other volunteers cannot, and anonymous reports have no reporter to match', () => {
    expect(canViewBugReport(report, { id: 8, isAdmin: false })).toBe(false)
    expect(canViewBugReport({ reporterId: null }, { id: 8, isAdmin: false })).toBe(false)
  })
})
