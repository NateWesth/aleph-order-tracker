
import { Button } from "@/components/ui/button";
import { Copy, Edit, Trash2 } from "lucide-react";

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
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Contact</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Email</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {companies.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                No clients found
              </td>
            </tr>
          ) : (
            companies.map((company) => (
              <tr key={company.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2">
                  <span className="font-medium text-foreground">{company.name}</span>
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => onCopyCode(company.code)}
                    className="inline-flex items-center gap-1 font-mono text-xs bg-muted px-2 py-0.5 rounded hover:bg-muted/80 transition-colors"
                  >
                    {company.code}
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </button>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {company.contact_person || '—'}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {company.email || '—'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onEditCompany(company)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => onDeleteCompany(company)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
