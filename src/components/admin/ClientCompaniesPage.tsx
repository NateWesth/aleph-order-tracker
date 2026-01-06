import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

import CompanyForm, { companySchema, type CompanyFormValues } from "./components/CompanyForm";
import CompanyTable from "./components/CompanyTable";
import DeleteCompanyDialog from "./components/DeleteCompanyDialog";
import { useCompanyData } from "./hooks/useCompanyData";
import { generateCompanyCode, copyToClipboard } from "./utils/companyUtils";
import { ClientCompaniesPageSkeleton } from "@/components/ui/skeletons";

export default function ClientCompaniesPage() {
  const { companies, loading, refetch } = useCompanyData();
  const { toast } = useToast();
  const [isNewCompanyDialogOpen, setIsNewCompanyDialogOpen] = useState(false);
  const [isEditCompanyDialogOpen, setIsEditCompanyDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<any>(null);

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: "",
      contact_person: "",
      email: "",
      phone: "",
      address: "",
      vat_number: "",
      account_manager: "",
    },
  });

  // Handle form submission for new company
  const onSubmit = async (data: CompanyFormValues) => {
    try {
      const newCompany = {
        name: data.name,
        code: generateCompanyCode(),
        contact_person: data.contact_person,
        email: data.email,
        phone: data.phone,
        address: data.address,
        vat_number: data.vat_number,
        account_manager: data.account_manager,
      };

      const { error } = await supabase
        .from('companies')
        .insert(newCompany);

      if (error) throw error;

      await refetch();
      setIsNewCompanyDialogOpen(false);
      form.reset();

      toast({
        title: "Company Added",
        description: `${data.name} has been added successfully with code ${newCompany.code}.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to add company: " + error.message,
        variant: "destructive",
      });
    }
  };

  // Handle edit company
  const handleEditCompany = (company: any) => {
    setEditingCompany(company);
    form.reset({
      name: company.name,
      contact_person: company.contact_person || "",
      email: company.email || "",
      phone: company.phone || "",
      address: company.address || "",
      vat_number: company.vat_number || "",
      account_manager: company.account_manager || "",
    });
    setIsEditCompanyDialogOpen(true);
  };

  // Handle update company
  const handleUpdateCompany = async (data: CompanyFormValues) => {
    if (!editingCompany) return;

    try {
      const { error } = await supabase
        .from('companies')
        .update({
          name: data.name,
          contact_person: data.contact_person,
          email: data.email,
          phone: data.phone,
          address: data.address,
          vat_number: data.vat_number,
          account_manager: data.account_manager,
        })
        .eq('id', editingCompany.id);

      if (error) throw error;

      await refetch();
      setIsEditCompanyDialogOpen(false);
      setEditingCompany(null);
      form.reset();

      toast({
        title: "Company Updated",
        description: `${data.name} has been updated successfully.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update company: " + error.message,
        variant: "destructive",
      });
    }
  };

  // Handle delete company
  const handleDeleteCompany = async () => {
    if (!companyToDelete) return;

    try {
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', companyToDelete.id);

      if (error) throw error;

      await refetch();
      setDeleteDialogOpen(false);
      setCompanyToDelete(null);

      toast({
        title: "Company Deleted",
        description: `${companyToDelete.name} has been deleted successfully.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete company: " + error.message,
        variant: "destructive",
      });
    }
  };

  // Reset form when dialog closes
  const handleDialogClose = () => {
    form.reset();
    setIsNewCompanyDialogOpen(false);
    setIsEditCompanyDialogOpen(false);
    setEditingCompany(null);
  };

  // Filter companies based on search term
  const filteredCompanies = companies.filter(company => 
    company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <ClientCompaniesPageSkeleton />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            className="pl-9 h-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => setIsNewCompanyDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Client
        </Button>
      </div>

      <CompanyTable 
        companies={filteredCompanies.map(company => ({
          ...company,
          created_at: company.created_at || new Date().toISOString()
        }))}
        onCopyCode={(code) => copyToClipboard(code, toast)}
        onEditCompany={handleEditCompany}
        onDeleteCompany={(company) => {
          setCompanyToDelete(company);
          setDeleteDialogOpen(true);
        }}
      />

      <p className="text-xs text-muted-foreground">{filteredCompanies.length} clients</p>

      {/* New Company Dialog */}
      <Dialog open={isNewCompanyDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Client Company</DialogTitle>
          </DialogHeader>
          <CompanyForm form={form} onSubmit={onSubmit} />
        </DialogContent>
      </Dialog>

      {/* Edit Company Dialog */}
      <Dialog open={isEditCompanyDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
          </DialogHeader>
          <CompanyForm form={form} onSubmit={handleUpdateCompany} isEdit />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteCompanyDialog 
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        company={companyToDelete}
        onConfirm={handleDeleteCompany}
      />
    </div>
  );
}
