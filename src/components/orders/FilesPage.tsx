
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { File, Download, Printer, Search, Plus, FileText, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalRealtimeOrders } from "./hooks/useGlobalRealtimeOrders";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Define the order file interface
interface OrderFile {
  id: string;
  name: string;
  url: string;
  type: 'invoice' | 'quote' | 'purchase-order' | 'delivery-note';
  uploadedBy: 'admin' | 'client';
  uploadDate: Date;
  orderNumber: string;
  companyName: string;
}

interface CompletedOrderFiles {
  orderNumber: string;
  companyName: string;
  completedDate: Date;
  files: OrderFile[];
}

interface MonthGroup {
  month: string;
  orderFiles: CompletedOrderFiles[];
  isOpen: boolean;
}

interface FilesPageProps {
  isAdmin: boolean;
}

export default function FilesPage({ isAdmin }: FilesPageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [completedOrderFiles, setCompletedOrderFiles] = useState<CompletedOrderFiles[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [monthGroups, setMonthGroups] = useState<MonthGroup[]>([]);

  // Fetch completed orders and their associated files
  const fetchCompletedOrderFiles = async () => {
    if (!user?.id) return;

    try {
      console.log('Fetching completed orders with files...');
      
      let ordersQuery = supabase
        .from('orders')
        .select(`
          *,
          companies (
            name,
            code
          )
        `)
        .eq('status', 'completed')
        .order('completed_date', { ascending: false });

      // If user is not admin, fetch only user's orders
      if (!isAdmin) {
        ordersQuery = ordersQuery.eq('user_id', user.id);
      }

      const { data: orders, error: ordersError } = await ordersQuery;

      if (ordersError) {
        console.error("Error fetching completed orders:", ordersError);
        return;
      }

      console.log('Fetched completed orders:', orders?.length || 0);

      // For each completed order, fetch its files
      const orderFilesPromises = (orders || []).map(async (order) => {
        const { data: files, error: filesError } = await supabase
          .from('order_files')
          .select('*')
          .eq('order_id', order.id)
          .order('created_at', { ascending: false });

        if (filesError) {
          console.error(`Error fetching files for order ${order.order_number}:`, filesError);
          return null;
        }

        // Transform files to match UI format
        const transformedFiles: OrderFile[] = (files || []).map(file => ({
          id: file.id,
          name: file.file_name,
          url: file.file_url,
          type: file.file_type as 'invoice' | 'quote' | 'purchase-order' | 'delivery-note',
          uploadedBy: file.uploaded_by_role as 'admin' | 'client',
          uploadDate: new Date(file.created_at),
          orderNumber: order.order_number,
          companyName: order.companies?.name || "Unknown Company"
        }));

        return {
          orderNumber: order.order_number,
          companyName: order.companies?.name || "Unknown Company",
          completedDate: order.completed_date ? new Date(order.completed_date) : new Date(order.created_at),
          files: transformedFiles
        };
      });

      const orderFilesResults = await Promise.all(orderFilesPromises);
      const validOrderFiles = orderFilesResults.filter(Boolean) as CompletedOrderFiles[];
      
      setCompletedOrderFiles(validOrderFiles);
    } catch (error) {
      console.error("Failed to fetch completed order files:", error);
    }
  };

  // Set up real-time subscriptions for order changes
  useGlobalRealtimeOrders({
    onOrdersChange: () => {
      console.log('Real-time update detected, refreshing completed order files...');
      fetchCompletedOrderFiles();
    },
    isAdmin,
    pageType: 'files'
  });

  useEffect(() => {
    fetchCompletedOrderFiles();
  }, [isAdmin, user?.id]);

  // Group completed order files by completion month
  useEffect(() => {
    const filteredOrderFiles = completedOrderFiles.filter(orderFile => 
      orderFile.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      orderFile.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      orderFile.files.some(file => 
        file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (!filterType || file.type === filterType)
      )
    );

    // Group by completion month
    const monthMap = new Map<string, CompletedOrderFiles[]>();
    
    filteredOrderFiles.forEach(orderFile => {
      const monthKey = format(orderFile.completedDate, 'MMMM yyyy');
      
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, []);
      }
      monthMap.get(monthKey)!.push(orderFile);
    });

    // Convert to array and sort by month (newest first)
    const groups: MonthGroup[] = Array.from(monthMap.entries())
      .map(([month, orderFiles]) => ({
        month,
        orderFiles: orderFiles.sort((a, b) => 
          b.completedDate.getTime() - a.completedDate.getTime()
        ),
        isOpen: true // Default to open
      }))
      .sort((a, b) => {
        // Sort by month (newest first)
        const dateA = new Date(a.month);
        const dateB = new Date(b.month);
        return dateB.getTime() - dateA.getTime();
      });

    setMonthGroups(groups);
  }, [completedOrderFiles, searchTerm, filterType]);

  // Toggle month group
  const toggleMonthGroup = (monthIndex: number) => {
    setMonthGroups(prev => prev.map((group, index) => 
      index === monthIndex ? { ...group, isOpen: !group.isOpen } : group
    ));
  };

  // Handle file action (download or print)
  const handleFileAction = (file: OrderFile, action: 'download' | 'print') => {
    toast({
      title: action === 'download' ? "Downloading File" : "Printing File",
      description: `${action === 'download' ? 'Downloading' : 'Printing'} ${file.name}...`,
    });
    
    if (action === 'download') {
      // Download the file
      const link = document.createElement('a');
      link.href = file.url;
      link.download = file.name;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Print the file
      const printWindow = window.open(file.url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    }
  };

  const handleFileView = (file: OrderFile) => {
    window.open(file.url, '_blank');
  };

  // Get all file types for filter
  const allFiles = completedOrderFiles.flatMap(orderFile => orderFile.files);
  const fileTypes = [...new Set(allFiles.map(file => file.type))];

  return (
    <div className="w-full max-w-full p-2 md:p-4 bg-background overflow-x-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4 mb-4 md:mb-6">
        <h1 className="text-lg md:text-2xl font-bold text-foreground">Files Repository</h1>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search files..."
              className="pl-10 pr-4 py-2 border border-border rounded-md w-full bg-card text-card-foreground text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <select
            className="border border-border rounded-md px-3 py-2 bg-card text-card-foreground text-sm"
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

      {/* Real-time Status Indicator */}
      <div className="mb-4 p-2 bg-green-50 rounded-md border border-green-200">
        <p className="text-sm text-green-800">
          ✅ Files automatically collected from completed orders - Real-time updates enabled
        </p>
      </div>

      {/* Files by Month */}
      <div className="space-y-4">
        {monthGroups.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No completed order files found.
          </div>
        )}

        {monthGroups.map((monthGroup, monthIndex) => (
          <div key={monthGroup.month} className="bg-white rounded-lg shadow">
            <Collapsible open={monthGroup.isOpen} onOpenChange={() => toggleMonthGroup(monthIndex)}>
              <CollapsibleTrigger asChild>
                <div className="p-4 border-b cursor-pointer hover:bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {monthGroup.isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <h2 className="text-lg font-semibold text-aleph-blue">{monthGroup.month}</h2>
                    <Badge variant="outline">{monthGroup.orderFiles.length} completed orders</Badge>
                  </div>
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="divide-y">
                  {monthGroup.orderFiles.map(orderFile => (
                    <div key={orderFile.orderNumber} className="p-4">
                      <div className="mb-3">
                        <h3 className="font-medium text-aleph-blue">Order #{orderFile.orderNumber}</h3>
                        <p className="text-sm text-gray-600">{orderFile.companyName}</p>
                        <p className="text-sm text-gray-500">
                          Completed: {format(orderFile.completedDate, 'MMM d, yyyy')}
                        </p>
                        <Badge variant="outline" className="mt-1">
                          {orderFile.files.length} files
                        </Badge>
                      </div>
                      
                      {orderFile.files.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No files uploaded for this order</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {orderFile.files.map((file) => (
                            <div key={file.id} className="border rounded-lg p-3 hover:shadow-md transition-shadow border-aleph-blue/10">
                              <div className="flex items-start">
                                <FileText className="h-8 w-8 text-aleph-blue mr-2 flex-shrink-0" />
                                <div className="flex-grow min-w-0">
                                  <h4 className="font-medium truncate text-sm" title={file.name}>{file.name}</h4>
                                  <div className="flex items-center text-xs text-gray-500 mt-1">
                                    <span className="capitalize">{file.type.replace('-', ' ')}</span>
                                    <span className="mx-1">•</span>
                                    <span>{format(file.uploadDate, 'MMM d')}</span>
                                    <span className="mx-1">•</span>
                                    <span>{file.uploadedBy === 'admin' ? 'Admin' : 'Client'}</span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex justify-end mt-3 space-x-1">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 px-2 text-aleph-blue hover:bg-aleph-blue/10"
                                  onClick={() => handleFileView(file)}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 px-2 text-aleph-blue hover:bg-aleph-blue/10"
                                  onClick={() => handleFileAction(file, 'download')}
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 px-2 text-aleph-magenta hover:bg-aleph-magenta/10"
                                  onClick={() => handleFileAction(file, 'print')}
                                >
                                  <Printer className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        ))}
      </div>
    </div>
  );
}
