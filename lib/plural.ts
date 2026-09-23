/** "1 day", "2 days": a count of one drops the plural. */
export function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`
}
