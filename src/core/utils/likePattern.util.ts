/**
 * Escaping for `LIKE` / `ILIKE` patterns built from user input.
 *
 * ## Why this is not optional
 *
 * Parameterised queries stop SQL *injection*, and every search query here is correctly
 * parameterised — but a bound parameter used as a `LIKE` pattern is still interpreted as a
 * pattern. `%` and `_` inside the value keep their wildcard meaning, which is a different
 * bug that parameterisation cannot help with.
 *
 * Measured against the live aggregated-search endpoint before this existed:
 *
 *   keyword=%              -> 50 results (the page limit) — the entire table
 *   keyword=_              -> 50 results
 *   keyword=zzzzzznomatch  -> 0 results
 *
 * Two consequences, and the second is the one that matters:
 *
 * 1. **Wrong results.** A bare `%` matches everything, so the user gets an arbitrary page
 *    of unrelated rows presented as search results. `_` matches any single character, so a
 *    literal search for `a_b` silently also matches `aXb`.
 *
 * 2. **A trivially triggerable full scan.** `searchText ILIKE '%%%'` cannot use the trigram
 *    index and degenerates to a sequential scan over `contentStreams`, which is the table
 *    that grows fastest here — every platform result from every search is persisted to it.
 *    Any anonymous caller could force that by typing one character, on an instance with
 *    512 MB and 0.1 vCPU.
 *
 * ## The escape character
 *
 * PostgreSQL's default `LIKE` escape is the backslash, so no `ESCAPE` clause is needed.
 * The backslash itself must be escaped **first** — and it is, because the character class
 * includes it and `replace` scans left to right in a single pass. Doing it as two separate
 * passes (`%` then `\`) would double-escape and break the pattern.
 */

/**
 * Make a user-supplied string safe to interpolate into a `LIKE`/`ILIKE` pattern.
 *
 * Escapes `\`, `%` and `_` so each is matched literally. Does **not** add the surrounding
 * `%` wildcards — the caller decides whether it wants a contains, prefix, or exact match:
 *
 * ```ts
 * const q = `%${escapeLikePattern(keyword)}%`;   // contains
 * const p = `${escapeLikePattern(keyword)}%`;    // prefix
 * ```
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * The common case: a `%term%` contains-pattern with the term escaped.
 *
 * Prefer this over hand-writing the template. Twelve sites built the pattern by hand and
 * only two of them escaped, which is the expected outcome for a rule that has to be
 * remembered at every call site.
 */
export function containsPattern(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}
