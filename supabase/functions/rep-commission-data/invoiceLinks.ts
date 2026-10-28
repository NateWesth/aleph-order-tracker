export type InvoiceLink = { invoice_id: string; rep_id: string };

/** Stable ownership snapshot: insertion order never changes cache validity. */
export function invoiceLinkFingerprint(links: InvoiceLink[]): string {
  return JSON.stringify(links.map(({ invoice_id, rep_id }) => [invoice_id, rep_id]).sort((a, b) =>
    a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])
  ));
}

export function hasCurrentInvoiceLinks(report: any, fingerprint: string): boolean {
  return report?.invoice_links_fingerprint === fingerprint;
}