
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
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

export default function ClientCompaniesPage() {
  const { companies, setCompanies, loading, fetchCompanies, toast } = useCompanyData();
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

      await fetchCompanies();
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

      await fetchCompanies();
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

      await fetchCompanies();
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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading companies...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-aleph-green">Client Companies</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search companies..."
              className="pl-10 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button onClick={() => setIsNewCompanyDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add New Company
          </Button>
        </div>
      </div>

      <CompanyTable 
        companies={filteredCompanies}
        onCopyCode={(code) => copyToClipboard(code, toast)}
        onEditCompany={handleEditCompany}
        onDeleteCompany={(company) => {
          setCompanyToDelete(company);
          setDeleteDialogOpen(true);
        }}
      />

      <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        Total companies: {filteredCompanies.length}
      </div>

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
