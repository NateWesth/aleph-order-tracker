
import { Button } from "@/components/ui/button";
import { Building2, Copy, Edit, Mail, Phone, Trash2, UserRound } from "lucide-react";

interface Company {
  id: string;
  name: string;
  code: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  vat_number?: string;
  account_manager?: string;
  created_at: string;
}

interface CompanyTableProps {
  companies: Company[];
  onCopyCode: (code: string) => void;
  onEditCompany: (company: Company) => void;
  onDeleteCompany: (company: Company) => void;
}

export default function CompanyTable({ companies, onCopyCode, onEditCompany, onDeleteCompany }: CompanyTableProps) {
  if (companies.length === 0) {
    return (
      <div className="rounded-[28px] border-2 border-dashed border-border bg-card/45 py-16 text-center text-muted-foreground">
        <Building2 className="mx-auto mb-3 h-10 w-10 opacity-40" />
        <p className="font-semibold text-foreground">No clients found</p>
      </div>
    );
  }

  return (
    <div className="client-directory-grid grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {companies.map((company) => (
        <article key={company.id} className="group relative overflow-hidden rounded-[26px] border border-border/60 bg-card/90 shadow-[0_24px_52px_-44px_hsl(var(--foreground)/.48)] transition-all hover:-translate-y-1 hover:border-emerald-500/25">
          <div className="flex items-start gap-3 bg-gradient-to-r from-emerald-500/10 to-transparent p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"><Building2 className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-display text-lg font-black text-foreground">{company.name}</h3>
              <button onClick={() => onCopyCode(company.code)} className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-background/70 px-2 py-1 font-mono text-[10px] font-bold text-muted-foreground transition-colors hover:text-foreground">
                {company.code}<Copy className="h-3 w-3" />
              </button>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => onEditCompany(company)} aria-label={`Edit ${company.name}`}><Edit className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-destructive hover:text-destructive" onClick={() => onDeleteCompany(company)} aria-label={`Delete ${company.name}`}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>

          <div className="grid gap-2 p-4 text-sm">
            <div className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/35 px-3 py-2.5">
              <UserRound className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span className="truncate text-muted-foreground">{company.contact_person || "No contact assigned"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/35 px-3 py-2.5"><Mail className="h-3.5 w-3.5 shrink-0 text-emerald-500" /><span className="truncate text-xs text-muted-foreground">{company.email || "No email"}</span></div>
              <div className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/35 px-3 py-2.5"><Phone className="h-3.5 w-3.5 shrink-0 text-emerald-500" /><span className="truncate text-xs text-muted-foreground">{company.phone || "No phone"}</span></div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
