# How Gaddr handles languages

The shared standard for Gaddr Jobs, Gaddr Search and Me, front end and back end.
This file is identical in all three repositories. Change it in one, copy it to
the others.

Each repository also has a `gaddr-i18n` skill in `.claude/skills/` with the
details for that stack. This file is the part that does not change between them.

## The one rule

**Every string a human reads is a key in a catalogue.** Including
`aria-label`, `placeholder`, `title`, `alt`, toast messages, empty states,
option labels and error text.

Everything below follows from that, and every gate we have exists because some
version of it was broken.

## Ten rules that came from real bugs

1. **Key by meaning, not by wording.** `search.noResults`, not
   `search.nothingFoundText`. When the copy changes the key should not.

2. **Never split a sentence across keys.** Word order differs by language. Pass
   values as arguments: `t("resultsFor", { query })`, never
   `t("resultsPrefix") + query`.

3. **Counts need plural rules, never a glued number.**
   `"{count, plural, =0 {No results} =1 {1 result} other {# results}}"`.
   English and Swedish agree on plural rules. Arabic has six categories, Polish
   and Russian have three. A number glued to a noun cannot be translated.

   Search has this through next-intl. **Jobs does not.** Its `t()` does a plain
   `{name}` substitution and nothing else, and 43 keys already paper over the
   gap in English with shapes like `"{count} talent(s) found"` and `"{count}
   days ago"`, which renders "1 days ago". Those read as careless in English and
   cannot be translated into Arabic at all. Plural support in Jobs is a
   prerequisite for the Arabic catalogue, not a polish item.

4. **A label array is invisible to every gate.** `const LABELS = ["Design",
   "Writing"]` looks like data and ships as English. Resolve it through the
   catalogue: `t(\`talentCards.category.${code}\`)`.

5. **The server returns codes, not sentences.** A procedure or endpoint that
   returns `"Someone you have worked with"` has decided the language on the
   server, where there is no reader. Return `reason: "contact"` and let the
   client translate it.

6. **Never show a raw error message to a user.** An API error string is written
   for a developer and is English. Write the sentence, key it, and map the code.

7. **Portable modules never return copy.** A module that can be lifted into
   another product cannot import the translation hook without stopping being
   portable. Return a name and let the caller render
   `namespace.thing.<name>`.

8. **Resolve the locale on the server.** If the language is discovered in a
   client effect, the server renders the default language for everyone. The
   reader sees a flash of the wrong language, and search engines and social
   scrapers only ever see that first version. This shipped in Jobs and was
   invisible for months because the page looked correct once it settled.

9. **Ship only the active catalogue to the browser.** Importing every catalogue
   statically puts all of them in the bundle. Two catalogues is 216 KB; seven
   would be three quarters of a megabyte for text nobody reads.

10. **Never format a date, number or currency by hand.** Use the platform
    formatter, and pin the time zone explicitly. An unset zone means the server
    uses its own, which differs between a laptop and production, and every
    formatted date becomes a hydration mismatch.

## Adding a language

The shape is the same everywhere. The details are in each repository's skill.

1. Copy the reference catalogue and translate it. Keys never change: they are
   the contract between the catalogue and the code.
2. Add or enable the entry in that repository's locale registry.
3. Run that repository's gates.

Two things are worth saying plainly:

**A language is either offered or it is not.** Half a catalogue behind a menu
entry is worse than no menu entry, because the reader chose it and got English.
Both registries carry a flag for this (`status: "ready"` in Jobs, `hasCatalog`
in Search). Nothing offers a language until its catalogue is complete.

**Legal text is not translated by a model.** Terms, privacy policy and
acceptable use need counsel. In Jobs that is 77 strings deliberately excluded.

## Right to left

Arabic is the first right-to-left language in both products, and in both the
blocker is the same and it is not the catalogue.

`dir` on `<html>` is wired from the registry in both. What breaks is component
CSS. Directional utilities have to become logical:

| Physical, breaks in RTL | Logical, correct |
|---|---|
| `ml-4` / `mr-4` | `ms-4` / `me-4` |
| `pl-2` / `pr-2` | `ps-2` / `pe-2` |
| `left-0` / `right-0` | `start-0` / `end-0` |
| `text-left` / `text-right` | `text-start` / `text-end` |
| `border-l` / `border-r` | `border-s` / `border-e` |
| `rounded-l` / `rounded-r` | `rounded-s` / `rounded-e` |

Measured 2026-07-26: **616 occurrences across about 180 files in Jobs**, and
roughly 650 in Search. Write logical properties in new components whatever
language you are building for, so the number stops growing.

Directional icons, back arrows and chevrons must mirror: `rtl:rotate-180`.
Never mirror a logo, a photograph or a numeral.

## What each gate cannot see

A coverage check compares catalogues to each other. **It cannot see a string
that was never a key.** Jobs reported 100 percent coverage while the sidebar
rendered 85 hardcoded English labels to Swedish readers.

So coverage needs a second gate that reads the source. Jobs has one, and its
limits are worth copying along with it: it matches JSX text of three or more
capitalised words, which means a `placeholder`, an `aria-label`, a label array
and any two word phrase all pass it. **Being on the locked list means "no prose
the regex can find", not "translated".**

The useful shape is a ratchet: lock the surfaces that are clean, add to the list
as files are done, and it can never regress. A gate that covers a little and
holds beats one that covers everything and gets switched off.

## Voice

No em dash, in any language. It is the most reliable tell of machine written
text, and Jobs fails the build on one anywhere in the repository.

No generated prose vocabulary: seamless, robust, unlock, empower, elevate,
leverage and the rest.

Swedish: plain verb, address the reader as *du*. Do not translate a product
name. "Community" stays "Community", "Feed" becomes "Flöde".

In the language picker, write each language in its own name and never translate
it. A Korean reader scans for "한국어", not for "Korean" and not for
"Koreanska".

## Where the three codebases stand

Measured 2026-07-26.

| | Jobs | Search and Me front end | Search and Me back end |
|---|---|---|---|
| Library | custom `useI18n` | next-intl 4 | none, and none needed |
| Registry | `src/lib/locales.ts` | `src/i18n/locales.ts` | n/a |
| Catalogues | `messages/<code>.json` | `src/i18n/messages/<code>.json` | n/a |
| Complete | en, sv | en, sv | n/a |
| Declared | 7 | 29 | n/a |
| Default | en | **sv** | n/a |
| Cookie | `locale` | `gaddr-locale` | n/a |
| Missing key | renders the key | falls back to English | n/a |
| Plural rules | **none** | ICU, via next-intl | n/a |
| Locale in URL | no | no | n/a |

### Four differences that need a decision

These are not bugs in either product. They are places where the two disagree,
and a reader who uses both will notice.

1. **Different default language.** Jobs defaults to English, Search to Swedish.
2. **Different cookie name.** `locale` against `gaddr-locale`, so a reader who
   sets their language in one product sets nothing in the other.
3. **Different codes for Chinese.** Jobs uses `zh`, Search uses `zh-Hans` and
   `zh-Hant`. Search is right: "Chinese" alone does not say which script.
4. **Different behaviour on a missing key.** Search deep merges over English and
   degrades quietly. Jobs renders the dotted key and fails loudly. Both are
   defensible. Loud is better while a catalogue is being built, quiet is better
   once it ships.

### Two things that block the new languages outright

**Jobs cannot express a plural.** See rule 3. 43 keys carry a count today and
none of them can be made correct in Arabic without plural support in `t()`.


`backend/src/core/utils/fuse.util.ts` normalises search queries with an
ASCII-only `\w`, so Chinese, Japanese, Korean and Arabic queries reduce to an
empty string. Asserted in `fuse.util.spec.ts`.

**Translating the interface into those languages does not make them work.** A
reader gets an Arabic interface and no search results. The fix is Unicode
property escapes, `\p{L}\p{N}` with the `u` flag, and it has to land before any
of those markets is marketed to.
