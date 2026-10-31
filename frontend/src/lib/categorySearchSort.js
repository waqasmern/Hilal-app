/**
 * Rank category names against the search box so best matches sort first in tabs.
 * Higher = stronger match.
 */
export function categoryNameMatchRank(name, queryRaw) {
  const q = String(queryRaw || "").trim().toLowerCase();
  if (!q) return 0;
  const n = String(name || "").toLowerCase();
  if (n === q) return 4;
  if (n.startsWith(q)) return 3;
  if (n.includes(q)) return 2;
  return 0;
}

export function sortParentCategoryNames(categories, queryRaw) {
  const q = String(queryRaw || "").trim().toLowerCase();
  const parents = categories.filter((c) => !c.parent_id);
  if (!q) {
    return [...parents]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => c.name);
  }
  return [...parents]
    .sort((a, b) => {
      const score = (row) => {
        let s = categoryNameMatchRank(row.name, q);
        for (const sub of categories) {
          if (sub.parent_id !== row.id) continue;
          s = Math.max(s, categoryNameMatchRank(sub.name, q));
        }
        return s;
      };
      return score(b) - score(a) || a.name.localeCompare(b.name);
    })
    .map((c) => c.name);
}

export function sortSubCategoryNames(categories, parentName, queryRaw) {
  const q = String(queryRaw || "").trim().toLowerCase();
  const parent = categories.find((pc) => !pc.parent_id && pc.name === parentName);
  if (!parent) return [];
  const subs = categories.filter((c) => c.parent_id === parent.id);
  if (!q) {
    return [...subs]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => c.name);
  }
  return [...subs]
    .sort((a, b) => {
      const sa = categoryNameMatchRank(a.name, q);
      const sb = categoryNameMatchRank(b.name, q);
      return sb - sa || a.name.localeCompare(b.name);
    })
    .map((c) => c.name);
}
