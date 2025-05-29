
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
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
import { Building2, Plus, Copy, Upload } from "lucide-react";

// Define the company interface with expanded fields
interface Company {
  id: string;
  name: string;
  code: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  vatNumber: string;
  logo?: string;
  createdAt: Date;
  userCount: number;
}

// Form schema for new companies with expanded fields
const newCompanySchema = z.object({
  name: z.string().min(1, "Company name is required"),
  contactPerson: z.string().min(1, "Contact person name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(1, "Phone number is required"),
  address: z.string().min(1, "Company address is required"),
  vatNumber: z.string().min(1, "VAT number is required"),
});

type NewCompanyFormValues = z.infer<typeof newCompanySchema>;

export default function ClientCompaniesPage() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isNewCompanyDialogOpen, setIsNewCompanyDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLogo, setSelectedLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const form = useForm<NewCompanyFormValues>({
    resolver: zodResolver(newCompanySchema),
    defaultValues: {
      name: "",
      contactPerson: "",
      email: "",
      phone: "",
      address: "",
      vatNumber: "",
    },
  });

  // Generate a unique company code
  const generateCompanyCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Handle logo file selection
  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedLogo(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle form submission
  const onSubmit = (data: NewCompanyFormValues) => {
    const newCompany: Company = {
      id: `company-${Date.now()}`,
      name: data.name,
      code: generateCompanyCode(),
      contactPerson: data.contactPerson,
      email: data.email,
      phone: data.phone,
      address: data.address,
      vatNumber: data.vatNumber,
      logo: logoPreview || undefined,
      createdAt: new Date(),
      userCount: 0,
    };

    setCompanies([...companies, newCompany]);
    setIsNewCompanyDialogOpen(false);
    form.reset();
    setSelectedLogo(null);
    setLogoPreview(null);

    toast({
      title: "Company Added",
      description: `${data.name} has been added successfully with code ${newCompany.code}.`,
    });
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
    setSelectedLogo(null);
    setLogoPreview(null);
    setIsNewCompanyDialogOpen(false);
  };

  // Filter companies based on search term
  const filteredCompanies = companies.filter(company => 
    company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Client Companies</h1>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search companies..."
            className="border rounded-md px-3 py-2"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Button onClick={() => setIsNewCompanyDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add New Company
          </Button>
        </div>
      </div>

      {/* Companies List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Company
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Company Code
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact Details
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Business Details
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Users
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredCompanies.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  No companies found.
                </td>
              </tr>
            )}
            
            {filteredCompanies.map((company) => (
              <tr key={company.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {company.logo ? (
                      <img src={company.logo} alt={`${company.name} logo`} className="h-8 w-8 rounded object-cover mr-2" />
                    ) : (
                      <Building2 className="h-6 w-6 text-gray-400 mr-2" />
                    )}
                    <div>
                      <div className="font-medium">{company.name}</div>
                      <div className="text-xs text-gray-500">
                        Added on {format(company.createdAt, 'MMM d, yyyy')}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
                      {company.code}
                    </div>
                    <button
                      onClick={() => copyToClipboard(company.code)}
                      className="ml-2 text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm">{company.contactPerson}</div>
                  <div className="text-sm text-gray-500">{company.email}</div>
                  <div className="text-sm text-gray-500">{company.phone}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm">{company.address}</div>
                  <div className="text-sm text-gray-500">VAT: {company.vatNumber}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm">
                    {company.userCount} {company.userCount === 1 ? 'user' : 'users'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <Button variant="link" size="sm">
                    Manage
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Company Dialog */}
      <Dialog open={isNewCompanyDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Client Company</DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Company Logo Upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Company Logo (Optional)</label>
                <div className="flex items-center space-x-4">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    id="logo-upload"
                  />
                  <label
                    htmlFor="logo-upload"
                    className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Logo
                  </label>
                  {logoPreview && (
                    <img src={logoPreview} alt="Logo preview" className="h-12 w-12 rounded object-cover" />
                  )}
                </div>
              </div>

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
                  name="contactPerson"
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
                  name="vatNumber"
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

              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-sm text-gray-600">
                  A unique company code will be automatically generated when you add this company.
                  Client users will need this code to link their account to this company during registration.
                  All company details including logo, address, and VAT number will appear on orders for this company.
                </p>
              </div>

              <DialogFooter>
                <Button type="submit">Add Company</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper function to format dates - simplified version for this component
function format(date: Date, formatStr: string) {
  return date.toLocaleDateString();
}
