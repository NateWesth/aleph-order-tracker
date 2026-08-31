const GENERIC_ITEM_TOKENS = new Set([
  "m-miscellaneous",
  "m-misc",
  "miscellaneous",
  "misc",
  "m miscellaneous",
  "item",
  "product",
]);

const normalize = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");

export const isMiscellaneousItem = (value: unknown) => {
  const normalized = normalize(value).toLowerCase();
  return Boolean(normalized) && (GENERIC_ITEM_TOKENS.has(normalized) || normalized.startsWith("m-misc"));
};

export interface ItemDisplaySource {
  code?: string | null;
  sku?: string | null;
  name?: string | null;
  description?: string | null;
  notes?: string | null;
}

export const getMeaningfulItemDescription = (item: ItemDisplaySource) => {
  for (const candidate of [item.description, item.notes]) {
    const value = normalize(candidate);
    if (value && !isMiscellaneousItem(value)) return value;
  }
  return "";
};

export const getItemDisplayName = (item: ItemDisplaySource) => {
  const name = normalize(item.name);
  const code = normalize(item.code || item.sku);
  const description = getMeaningfulItemDescription(item);
  if ((isMiscellaneousItem(code) || isMiscellaneousItem(name)) && description) return description;
  if (isMiscellaneousItem(code) || isMiscellaneousItem(name)) return "Description required";
  return name || description || code || "Unnamed item";
};

export const getItemSecondaryDescription = (item: ItemDisplaySource) => {
  const displayName = getItemDisplayName(item);
  const description = getMeaningfulItemDescription(item);
  return description && description.toLowerCase() !== displayName.toLowerCase() ? description : "";
};

/**
 * Shared SKUs such as M-MISC do not identify one product. Procurement and
 * analytics must keep each description in its own bucket instead of merging
 * unrelated custom lines into one giant "Miscellaneous" row.
 */
export const getItemIdentityKey = (item: ItemDisplaySource) => {
  const code = normalize(item.code || item.sku).toUpperCase() || "NO-SKU";
  if (!isMiscellaneousItem(code)) return code;
  const description = getItemDisplayName(item).toLowerCase();
  return `${code}::${description || "description-required"}`;
};
