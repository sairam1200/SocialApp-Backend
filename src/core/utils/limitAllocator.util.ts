type SearchSectionKey =
  | 'contentStream'
  | 'userContent'
  | 'linkedAccount'
  | 'manualProfile';

export interface SectionSkipMap {
  contentStream: boolean;
  userContent: boolean;
  linkedAccount: boolean;
  manualProfile: boolean;
}

/**
 * Distributes the limit among non-skipped sections
 */
function getSectionLimits(
  limit: number,
  skips: SectionSkipMap,
): Record<SearchSectionKey, number> {
  const sections: { key: SearchSectionKey; skip: boolean }[] = [
    { key: 'contentStream', skip: skips.contentStream },
    { key: 'userContent', skip: skips.userContent },
    { key: 'linkedAccount', skip: skips.linkedAccount },
    { key: 'manualProfile', skip: skips.manualProfile },
  ];

  const activeSections = sections.filter((s) => !s.skip);
  const activeCount = activeSections.length;

  const baseLimit = Math.floor(limit / activeCount);
  const remainder = limit % activeCount;

  const limits: Record<SearchSectionKey, number> = {
    contentStream: 0,
    userContent: 0,
    linkedAccount: 0,
    manualProfile: 0,
  };

  activeSections.forEach((section, index) => {
    limits[section.key] = baseLimit + (index < remainder ? 1 : 0);
  });

  return limits;
}

export default { getSectionLimits };
