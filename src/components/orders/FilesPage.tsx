
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Download, Search, FileText, Image, Archive, Video, Music, Code, File as FileIcon, Trash2, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface OrderFile {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number | null;
  created_at: string;
  order_id: string;
  uploaded_by_role: string;
  uploaded_by_user_id: string;
  order?: {
    order_number: string;
    status: string;
    companies?: {
      name: string;
    } | null;
  };
}

interface FilesPageProps {
  isAdmin: boolean;
}

export default function FilesPage({ isAdmin }: FilesPageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<OrderFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Get file icon based on file type
  const getFileIcon = (fileName: string, fileType: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const iconClass = "h-4 w-4";

    if (fileType.startsWith('image/')) {
      return <Image className={iconClass} />;
    }
    if (fileType.startsWith('video/')) {
      return <Video className={iconClass} />;
    }
    if (fileType.startsWith('audio/')) {
      return <Music className={iconClass} />;
    }
    if (fileType.includes('pdf') || extension === 'pdf') {
      return <FileText className={iconClass} />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension || '')) {
      return <Archive className={iconClass} />;
    }
    if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'xml'].includes(extension || '')) {
      return <Code className={iconClass} />;
    }
    return <FileIcon className={iconClass} />;
  };

  // Format file size
  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Fetch files from database
  const fetchFiles = async () => {
    if (!user?.id) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }

    try {
      console.log('Fetching files from Supabase...');
      setLoading(true);
      setError(null);

      let query = supabase
        .from('order_files')
        .select(`
          *,
          orders!inner (
            order_number,
            status,
            companies (
              name
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        // For non-admin users, only show files from their orders
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('id', user.id)
          .single();

        if (profile?.company_id) {
          query = query.eq('orders.company_id', profile.company_id);
        } else {
          query = query.eq('orders.user_id', user.id);
        }
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        console.error("Error fetching files:", fetchError);
        setError(`Failed to fetch files: ${fetchError.message}`);
        return;
      }

      console.log('Fetched files from database:', data?.length || 0);

      if (data) {
        const formattedFiles: OrderFile[] = data.map((file: any) => ({
          id: file.id,
          file_name: file.file_name,
          file_url: file.file_url,
          file_type: file.file_type,
          file_size: file.file_size,
          created_at: file.created_at,
          order_id: file.order_id,
          uploaded_by_role: file.uploaded_by_role,
          uploaded_by_user_id: file.uploaded_by_user_id,
          order: file.orders
        }));

        setFiles(formattedFiles);
        setFilteredFiles(formattedFiles);
      } else {
        setFiles([]);
        setFilteredFiles([]);
      }
    } catch (error) {
      console.error("Failed to fetch files:", error);
      setError(`Failed to fetch files: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Load files on component mount
  useEffect(() => {
    console.log('Files page mounted, fetching files...');
    fetchFiles();
  }, [isAdmin, user?.id]);

  // Filter files based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredFiles(files);
    } else {
      const filtered = files.filter(file => 
        file.file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.order?.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.order?.companies?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredFiles(filtered);
    }
  }, [searchTerm, files]);

  // Download file
  const downloadFile = async (file: OrderFile) => {
    try {
      const response = await fetch(file.file_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = file.file_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Download Started",
        description: `Downloading ${file.file_name}...`
      });
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Download Failed",
        description: "Failed to download file. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Delete file (admin only)
  const deleteFile = async (fileId: string, fileName: string) => {
    if (!isAdmin) return;

    try {
      console.log('Deleting file:', fileId);
      
      const { error } = await supabase
        .from('order_files')
        .delete()
        .eq('id', fileId);

      if (error) throw error;

      const remainingFiles = files.filter(file => file.id !== fileId);
      setFiles(remainingFiles);

      toast({
        title: "File Deleted",
        description: `${fileName} has been deleted successfully.`
      });
      
      console.log('File successfully deleted');
    } catch (error: any) {
      console.error('Error deleting file:', error);
      toast({
        title: "Error",
        description: "Failed to delete file. Please try again.",
        variant: "destructive"
      });
    }
  };

  // View file in new tab
  const viewFile = (file: OrderFile) => {
    window.open(file.file_url, '_blank');
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 bg-background">
        <div className="flex justify-center items-center h-64">
          <div className="text-lg text-foreground">Loading files...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 bg-background">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-lg text-red-600 mb-4">Error: {error}</div>
          <Button onClick={fetchFiles}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto p-4 bg-background">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-lg mb-4 text-foreground">Please log in to view files</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 bg-background">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-foreground">Order Files</h1>
      </div>

      <div className="bg-card border border-border rounded-lg shadow">
        <div className="p-4 border-b border-border">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-card-foreground">All Order Documents</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-64 bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
              />
            </div>
          </div>
        </div>
        
        {filteredFiles.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            {searchTerm ? `No files found matching "${searchTerm}".` : "No files found. Files uploaded to orders will appear here."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border">
                <TableHead className="text-foreground">File</TableHead>
                <TableHead className="text-foreground">Order #</TableHead>
                <TableHead className="text-foreground">Company</TableHead>
                <TableHead className="text-foreground">Size</TableHead>
                <TableHead className="text-foreground">Uploaded By</TableHead>
                <TableHead className="text-foreground">Date</TableHead>
                <TableHead className="text-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFiles.map(file => (
                <TableRow key={file.id} className="border-b border-border hover:bg-muted/50">
                  <TableCell className="text-foreground">
                    <div className="flex items-center gap-2">
                      {getFileIcon(file.file_name, file.file_type)}
                      <span className="truncate max-w-xs" title={file.file_name}>
                        {file.file_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    #{file.order?.order_number}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {file.order?.companies?.name || "Unknown Company"}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {formatFileSize(file.file_size)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={file.uploaded_by_role === 'admin' ? 'default' : 'secondary'}>
                      {file.uploaded_by_role === 'admin' ? 'Admin' : 'Client'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-foreground">
                    {format(new Date(file.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => viewFile(file)}
                        title="View file"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => downloadFile(file)}
                        title="Download file"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      
                      {isAdmin && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20"
                              title="Delete file"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-card border-border">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-card-foreground">Delete File</AlertDialogTitle>
                              <AlertDialogDescription className="text-muted-foreground">
                                Are you sure you want to delete "{file.file_name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="border-border text-foreground hover:bg-muted">Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => deleteFile(file.id, file.file_name)} 
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
