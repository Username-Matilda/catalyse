export interface ProjectSkillRow {
  id: number
  isRequired: boolean | null
}

export interface MatchScore {
  required_match_percent: number
  matched_required_count: number
  total_required: number
  overall_score: number
}

export function calculateMatchScore(
  volunteerSkillIds: Set<number>,
  projectSkills: ProjectSkillRow[],
): MatchScore {
  const required = projectSkills.filter((s) => s.isRequired)

  const requiredIds = new Set(required.map((s) => s.id))

  const matchedRequired = new Set([...volunteerSkillIds].filter((id) => requiredIds.has(id)))

  const requiredScore = requiredIds.size > 0 ? (matchedRequired.size / requiredIds.size) * 100 : 100

  return {
    required_match_percent: Math.round(requiredScore),
    matched_required_count: matchedRequired.size,
    total_required: requiredIds.size,
    overall_score: Math.round(requiredScore),
  }
}

export function matchGradeLabel(matchedRequired: number): string | null {
  if (matchedRequired >= 6) return 'Excellent match'
  if (matchedRequired >= 4) return 'Great match'
  if (matchedRequired >= 2) return 'Good match'
  if (matchedRequired >= 1) return 'Partial match'
  return null
}
