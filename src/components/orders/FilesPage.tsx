
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { File, Download, Printer, Search } from "lucide-react";

// Define the order file interface
interface OrderFile {
  id: string;
  name: string;
  url: string;
  type: 'invoice' | 'quote' | 'purchase-order' | 'proof-of-payment';
  uploadedBy: 'admin' | 'client';
  uploadDate: Date;
  orderNumber: string;
  companyName: string;
}

interface FilesPageProps {
  isAdmin: boolean;
}

export default function FilesPage({ isAdmin }: FilesPageProps) {
  const { toast } = useToast();
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);

  // Handle file action (download or print)
  const handleFileAction = (file: OrderFile, action: 'download' | 'print') => {
    // In a real app, this would download or print the actual file
    toast({
      title: action === 'download' ? "Downloading File" : "Printing File",
      description: `${action === 'download' ? 'Downloading' : 'Printing'} ${file.name}...`,
    });
    
    if (action === 'download') {
      // Simulate a download by opening in a new tab
      window.open(file.url, '_blank');
    } else {
      // Simulate printing by opening print dialog
      const printWindow = window.open(file.url, '_blank');
      printWindow?.addEventListener('load', () => {
        printWindow.print();
      });
    }
  };

  // Filter files based on search term and file type
  const filteredFiles = files.filter(file => 
    (file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
     file.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
     file.companyName.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (!filterType || file.type === filterType)
  );

  // Get unique file types for filtering
  const fileTypes = [...new Set(files.map(file => file.type))];

  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">Files Repository</h1>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search files..."
              className="pl-10 pr-4 py-2 border rounded-md w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <select
            className="border rounded-md px-3 py-2"
            value={filterType || ''}
            onChange={(e) => setFilterType(e.target.value || null)}
          >
            <option value="">All Types</option>
            {fileTypes.map(type => (
              <option key={type} value={type}>
                {type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Files Grid */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">All Files</h2>
        </div>

        {filteredFiles.length === 0 ? (
          <div className="p-8 text-center">
            <File className="h-12 w-12 mx-auto text-gray-300" />
            <p className="mt-2 text-gray-500">No files found</p>
            {(searchTerm || filterType) && (
              <Button 
                variant="link" 
                onClick={() => {
                  setSearchTerm('');
                  setFilterType(null);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {filteredFiles.map((file) => (
              <div key={file.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start">
                  <File className="h-10 w-10 text-blue-500 mr-3 flex-shrink-0" />
                  <div className="flex-grow min-w-0">
                    <h3 className="font-medium truncate" title={file.name}>{file.name}</h3>
                    <p className="text-sm text-gray-600">
                      Order #{file.orderNumber} - {file.companyName}
                    </p>
                    <div className="flex items-center text-xs text-gray-500 mt-1">
                      <span className="capitalize">{file.type.replace('-', ' ')}</span>
                      <span className="mx-1">•</span>
                      <span>{format(file.uploadDate, 'MMM d, yyyy')}</span>
                      <span className="mx-1">•</span>
                      <span>{file.uploadedBy === 'admin' ? 'Admin' : 'Client'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end mt-4 space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex items-center space-x-1"
                    onClick={() => handleFileAction(file, 'download')}
                  >
                    <Download className="h-4 w-4" />
                    <span>Download</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex items-center space-x-1"
                    onClick={() => handleFileAction(file, 'print')}
                  >
                    <Printer className="h-4 w-4" />
                    <span>Print</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
