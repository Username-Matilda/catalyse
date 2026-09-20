// Errs towards yes: a bare domain counts, because mail clients and browsers turn one into a
// link without being asked.
const LINK_LIKE = /https?:\/\/|www\.|\b[a-z0-9-]+\.[a-z]{2,}\b/i

/** Whether any of the texts holds something a reader could follow as a link. */
export function containsLink(...texts: (string | null | undefined)[]): boolean {
  return texts.some((text) => !!text && LINK_LIKE.test(text))
}
