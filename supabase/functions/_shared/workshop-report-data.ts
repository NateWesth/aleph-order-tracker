type ReportReader = { from: (table: string) => any };

/** Read the complete current workshop snapshot; never report a failed read as no work. */
export async function readWorkshopReportData(db: ReportReader, table: "sharpening_jobs" | "repair_tickets", fields: string) {
  const data: Record<string, any>[] = [];
  for (let from = 0; ; from += 500) {
    let query = db.from(table).select(fields);
    query = table === "sharpening_jobs" ? query.neq("status", "completed") : query.not("status", "in", "(completed,scrapped)");
    const page = await query.order("deadline_date").order("id").range(from, from + 499);
    if (page.error) throw new Error(`${table} could not refresh: ${page.error.message}`);
    data.push(...(page.data || []));
    if ((page.data?.length || 0) < 500) return { data };
  }
}

export function requireWorkshopReportData(results: PromiseSettledResult<unknown>[]) {
  for (const result of results) if (result.status === "rejected") throw result.reason;
}