export interface ProjectSkillRow {
  id: number
  isRequired: boolean | null
}

export interface MatchScore {
  required_match_percent: number
  matched_required_count: number
  total_required: number
  matched_nice_to_have_count: number
  total_nice_to_have: number
  overall_score: number
}

export function calculateMatchScore(
  volunteerSkillIds: Set<number>,
  projectSkills: ProjectSkillRow[]
): MatchScore {
  const required = projectSkills.filter(s => s.isRequired)
  const niceToHave = projectSkills.filter(s => !s.isRequired)

  const requiredIds = new Set(required.map(s => s.id))
  const niceIds = new Set(niceToHave.map(s => s.id))

  const matchedRequired = new Set([...volunteerSkillIds].filter(id => requiredIds.has(id)))
  const matchedNice = new Set([...volunteerSkillIds].filter(id => niceIds.has(id)))

  const requiredScore = requiredIds.size > 0
    ? (matchedRequired.size / requiredIds.size) * 100
    : 100

  return {
    required_match_percent: Math.round(requiredScore),
    matched_required_count: matchedRequired.size,
    total_required: requiredIds.size,
    matched_nice_to_have_count: matchedNice.size,
    total_nice_to_have: niceIds.size,
    overall_score: Math.round(requiredScore),
  }
}
