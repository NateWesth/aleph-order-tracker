import { Fragment, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusLabel } from "./shared";

/**
 * Monday-style grouped board table: month groups with a coloured spine,
 * collapsible headers and solid status cells. All colours resolve from the
 * active theme tokens so the board follows light/dark and theme switches.
 */

export interface BoardColumn<T> {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "center";
  cell: (row: T) => ReactNode;
  summary?: (rows: T[]) => ReactNode;
}

export const GROUP_SPINES = [
  "hsl(var(--primary))",
  "hsl(var(--info))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
];

/** Solid, theme-token cell used for status / invoice / assignee pills. */
export function BoardCell({ tone, children, className }: { tone: "success" | "warning" | "info" | "danger" | "neutral" | "primary"; children: ReactNode; className?: string }) {
  const tones: Record<string, string> = {
    success: "bg-success text-success-foreground",
    warning: "bg-warning text-warning-foreground",
    info: "bg-info text-info-foreground",
    danger: "bg-destructive text-destructive-foreground",
    primary: "bg-primary text-primary-foreground",
    neutral: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("flex h-8 w-full items-center justify-center rounded-md px-2 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

export function statusTone(status: string): "success" | "warning" | "info" | "danger" | "neutral" | "primary" {
  switch (status) {
    case "completed": return "success";
    case "working_on_it": return "info";
    case "awaiting_quote_approval": return "warning";
    case "next": return "primary";
    case "scrapped": return "danger";
    default: return "neutral";
  }
}

export function BoardStatusCell({ status }: { status: string }) {
  return <BoardCell tone={statusTone(status)}>{statusLabel(status)}</BoardCell>;
}

export interface BoardGroup<T> {
  id: string;
  label: string;
  rows: T[];
  spine: string;
}

interface BoardTableProps<T> {
  groups: BoardGroup<T>[];
  columns: BoardColumn<T>[];
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  activeKey?: string | null;
  noun?: string;
}

export default function BoardTable<T>({ groups, columns, collapsed, onToggle, rowKey, onRowClick, activeKey, noun = "job" }: BoardTableProps<T>) {
  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const isCollapsed = !!collapsed[group.id];
        return (
          <section key={group.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <button
              type="button"
              onClick={() => onToggle(group.id)}
              className="flex w-full items-center gap-2 border-b border-border px-3 py-2.5 text-left transition hover:bg-accent/40"
              style={{ boxShadow: `inset 4px 0 0 0 ${group.spine}` }}
            >
              <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", !isCollapsed && "rotate-90")} style={{ color: group.spine }} />
              <span className="text-base font-bold" style={{ color: group.spine }}>{group.label}</span>
              <span className="text-xs font-medium text-muted-foreground">
                {group.rows.length} {noun}{group.rows.length === 1 ? "" : "s"}
              </span>
            </button>

            {!isCollapsed && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {columns.map((column) => (
                        <th
                          key={column.key}
                          className={cn(
                            "whitespace-nowrap border-r border-border/70 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground last:border-r-0",
                            column.align === "center" ? "text-center" : "text-left",
                          )}
                          style={{ width: column.width }}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => {
                      const key = rowKey(row);
                      return (
                        <tr
                          key={key}
                          onClick={() => onRowClick?.(row)}
                          className={cn(
                            "cursor-pointer border-b border-border/70 transition last:border-b-0 hover:bg-accent/40",
                            activeKey === key && "bg-accent/60",
                          )}
                          style={{ boxShadow: `inset 3px 0 0 0 ${group.spine}` }}
                        >
                          {columns.map((column) => (
                            <td
                              key={column.key}
                              className={cn(
                                "border-r border-border/60 px-2 py-1.5 align-middle last:border-r-0",
                                column.align === "center" ? "text-center" : "text-left",
                              )}
                            >
                              {column.cell(row)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {columns.some((column) => column.summary) && (
                      <tr className="bg-muted/30">
                        {columns.map((column) => (
                          <td
                            key={column.key}
                            className={cn(
                              "border-r border-border/60 px-3 py-1.5 text-xs font-bold tabular-nums text-muted-foreground last:border-r-0",
                              column.align === "center" ? "text-center" : "text-left",
                            )}
                          >
                            {column.summary?.(group.rows)}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
      {groups.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Nothing to show here yet.</p>
      )}
      <Fragment />
    </div>
  );
}
