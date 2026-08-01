// Bug report comment threads are shared by the reporter and admins only.

export type BugReportForAccess = {
  reporterId: number | null
}

export type BugReportViewer = { id: number; isAdmin: boolean }

export function canViewBugReport(report: BugReportForAccess, viewer: BugReportViewer): boolean {
  return viewer.isAdmin || (report.reporterId !== null && report.reporterId === viewer.id)
}

export function canPostBugReportComment(
  report: BugReportForAccess,
  viewer: BugReportViewer,
): boolean {
  return canViewBugReport(report, viewer)
}
