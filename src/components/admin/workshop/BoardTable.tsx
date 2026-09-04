import { type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusLabel } from "./shared";

/**
 * Monday-style grouped board table: month groups with a coloured spine,
 * collapsible headers and solid status cells. Status / priority colours are
 * coded with the Aleph logo spectrum (cyan, teal, violet, magenta, pink),
 * everything else resolves from the active theme tokens.
 */

export interface BoardColumn<T> {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "center";
  cell: (row: T) => ReactNode;
  summary?: (rows: T[]) => ReactNode;
}

/** Logo spectrum used for the group spines. */
export const GROUP_SPINES = [
  "hsl(var(--logo-cyan))",
  "hsl(var(--logo-magenta))",
  "hsl(var(--logo-violet))",
  "hsl(var(--logo-teal))",
  "hsl(var(--logo-pink))",
];

export type BoardTone =
  | "cyan" | "teal" | "violet" | "magenta" | "pink" | "ink" | "neutral"
  // legacy aliases
  | "success" | "warning" | "info" | "danger" | "primary";

const TONES: Record<BoardTone, string> = {
  cyan: "bg-logo-cyan text-logo-on",
  teal: "bg-logo-teal text-white",
  violet: "bg-logo-violet text-white",
  magenta: "bg-logo-magenta text-white",
  pink: "bg-logo-pink text-white",
  ink: "bg-logo-ink text-white",
  neutral: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  // legacy aliases keep older call-sites working
  success: "bg-logo-cyan text-logo-on",
  info: "bg-logo-teal text-white",
  warning: "bg-logo-pink text-white",
  danger: "bg-logo-magenta text-white",
  primary: "bg-logo-violet text-white",
};

/** Solid, colour-coded cell used for status / priority / invoice pills. */
export function BoardCell({ tone, children, className }: { tone: BoardTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-7 w-full items-center justify-center gap-1 truncate rounded-full px-2.5 text-[11px] font-semibold capitalize tracking-tight shadow-sm transition-transform duration-150 group-hover/row:scale-[1.03]",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): BoardTone {
  switch (status) {
    case "completed": return "cyan";
    case "working_on_it": return "magenta";
    case "next": return "teal";
    case "awaiting_quote_approval": return "pink";
    case "pending_sent_in": return "violet";
    case "scrapped": return "ink";
    default: return "neutral";
  }
}

export function priorityTone(priority: string): BoardTone {
  switch (priority) {
    case "urgent": return "magenta";
    case "high": return "pink";
    case "normal": return "teal";
    default: return "neutral";
  }
}

export function BoardStatusCell({ status }: { status: string }) {
  return <BoardCell tone={statusTone(status)}>{statusLabel(status)}</BoardCell>;
}

export function BoardPriorityCell({ priority }: { priority: string }) {
  return <BoardCell tone={priorityTone(priority)}>{priority}</BoardCell>;
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
  if (groups.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        Nothing to show here yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const isCollapsed = !!collapsed[group.id];
        return (
          <section
            key={group.id}
            className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_hsl(0_0%_0%/0.04),0_12px_28px_-24px_hsl(0_0%_0%/0.5)]"
          >
            <button
              type="button"
              onClick={() => onToggle(group.id)}
              className="group/head relative flex w-full items-center gap-2.5 px-4 py-3 text-left transition hover:bg-accent/30"
            >
              <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: group.spine }} />
              <ChevronRight
                className={cn("h-4 w-4 shrink-0 transition-transform duration-200", !isCollapsed && "rotate-90")}
                style={{ color: group.spine }}
              />
              <span className="text-[15px] font-bold tracking-tight" style={{ color: group.spine }}>{group.label}</span>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                style={{ background: `color-mix(in srgb, ${group.spine} 14%, transparent)`, color: group.spine }}
              >
                {group.rows.length} {noun}{group.rows.length === 1 ? "" : "s"}
              </span>
            </button>

            {!isCollapsed && (
              <div className="overflow-x-auto border-t border-border/70">
                <table className="w-full min-w-[960px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th
                          key={column.key}
                          className={cn(
                            "sticky top-0 z-10 whitespace-nowrap border-b border-border/70 bg-muted/60 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur",
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
                    {group.rows.map((row, index) => {
                      const key = rowKey(row);
                      return (
                        <tr
                          key={key}
                          onClick={() => onRowClick?.(row)}
                          className={cn(
                            "group/row cursor-pointer transition-colors",
                            index % 2 === 1 && "bg-muted/20",
                            "hover:bg-accent/40",
                            activeKey === key && "bg-accent/60",
                          )}
                        >
                          {columns.map((column, columnIndex) => (
                            <td
                              key={column.key}
                              className={cn(
                                "border-b border-border/50 px-2.5 py-2 align-middle",
                                columnIndex === 0 && "relative pl-4",
                                column.align === "center" ? "text-center" : "text-left",
                              )}
                            >
                              {columnIndex === 0 && (
                                <span
                                  className="absolute inset-y-0 left-0 w-1 opacity-40 transition-opacity group-hover/row:opacity-100"
                                  style={{ background: group.spine }}
                                />
                              )}
                              {column.cell(row)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {columns.some((column) => column.summary) && (
                      <tr className="bg-muted/40">
                        {columns.map((column) => (
                          <td
                            key={column.key}
                            className={cn(
                              "px-3 py-2 text-[11px] font-bold uppercase tracking-wide tabular-nums text-muted-foreground",
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
    </div>
  );
}
