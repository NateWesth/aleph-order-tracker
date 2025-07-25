
import { Button } from "@/components/ui/button";
import { Building2, Copy, Edit, Trash2 } from "lucide-react";

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
    <div className="bg-card rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Company
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Company Code
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Contact Details
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Business Details
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {companies.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                  No companies found.
                </td>
              </tr>
            ) : (
              companies.map((company) => (
                <tr key={company.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="bg-aleph-green/10 p-2 rounded-full mr-3">
                        <Building2 className="h-6 w-6 text-aleph-green" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{company.name}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Added on {new Date(company.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">
                        {company.code}
                      </div>
                      <button
                        onClick={() => onCopyCode(company.code)}
                        className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">{company.contact_person || 'N/A'}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{company.email || 'N/A'}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{company.phone || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 dark:text-white max-w-xs truncate">{company.address || 'N/A'}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">VAT: {company.vat_number || 'N/A'}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Manager: {company.account_manager || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => onEditCompany(company)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => onDeleteCompany(company)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
