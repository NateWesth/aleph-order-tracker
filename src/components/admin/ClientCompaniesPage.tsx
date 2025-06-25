import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Building2, Plus, Copy, Upload, Search, Edit, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Form schema for companies with expanded fields
const companySchema = z.object({
  name: z.string().min(1, "Company name is required"),
  contact_person: z.string().min(1, "Contact person name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(1, "Phone number is required"),
  address: z.string().min(1, "Company address is required"),
  vat_number: z.string().min(1, "VAT number is required"),
  account_manager: z.string().optional(),
});

type CompanyFormValues = z.infer<typeof companySchema>;

export default function ClientCompaniesPage() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<any[]>([]);
  const [isNewCompanyDialogOpen, setIsNewCompanyDialogOpen] = useState(false);
  const [isEditCompanyDialogOpen, setIsEditCompanyDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCompanies(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch companies: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Generate a unique company code
  const generateCompanyCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

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

  // Copy company code to clipboard
  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: "Copied to Clipboard",
      description: `Company code ${code} has been copied to clipboard.`,
    });
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

      {/* Companies List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
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
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                    No companies found.
                  </td>
                </tr>
              ) : (
                filteredCompanies.map((company) => (
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
                          onClick={() => copyToClipboard(company.code)}
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
                          onClick={() => handleEditCompany(company)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setCompanyToDelete(company);
                            setDeleteDialogOpen(true);
                          }}
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

      <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        Total companies: {filteredCompanies.length}
      </div>

      {/* New Company Dialog */}
      <Dialog open={isNewCompanyDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Client Company</DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter company name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="contact_person"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter contact name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Address</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Enter complete company address" rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="vat_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VAT Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter VAT number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter phone number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter email address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="account_manager"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Manager</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter account manager name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  A unique company code will be automatically generated when you add this company.
                  Client users will need this code to link their account to this company during registration.
                </p>
              </div>

              <DialogFooter>
                <Button type="submit">Add Company</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Company Dialog */}
      <Dialog open={isEditCompanyDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleUpdateCompany)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter company name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="contact_person"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter contact name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Address</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Enter complete company address" rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="vat_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VAT Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter VAT number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter phone number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter email address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="account_manager"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Manager</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter account manager name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="submit">Update Company</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {companyToDelete?.name} and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCompany}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
