import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Mail, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CompletedOrderEmailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    id: string;
    orderNumber: string;
    companyName: string;
    company_id?: string;
  } | null;
}

interface UserForEmail {
  id: string;
  full_name: string | null;
  email: string | null;
  role: 'admin' | 'user';
  isSelected: boolean;
}

interface OrderFile {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  mime_type: string | null;
}

export default function CompletedOrderEmailDialog({
  isOpen,
  onClose,
  order
}: CompletedOrderEmailDialogProps) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserForEmail[]>([]);
  const [orderFiles, setOrderFiles] = useState<OrderFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Fetch users (company users + admin users)
  const fetchUsers = async () => {
    if (!order) return;

    setLoading(true);
    try {
      console.log('Fetching users for order:', order);

      // Get company users based on company_id
      let companyUsers: any[] = [];
      if (order.company_id) {
        console.log('Fetching company users for company_id:', order.company_id);
        
        const { data: companyUsersData, error: companyError } = await supabase
          .from('profiles')
          .select(`
            id,
            full_name,
            email
          `)
          .eq('company_id', order.company_id)
          .not('email', 'is', null);
        
        console.log('Company users query result:', companyUsersData, companyError);
        
        if (companyUsersData && !companyError) {
          // Get user roles for these users
          const userIds = companyUsersData.map(u => u.id);
          const { data: userRolesData } = await supabase
            .from('user_roles')
            .select('user_id, role')
            .in('user_id', userIds);
          
          console.log('User roles for company users:', userRolesData);
          
          companyUsers = companyUsersData.map(user => {
            const userRole = userRolesData?.find(r => r.user_id === user.id);
            return {
              id: user.id,
              full_name: user.full_name,
              email: user.email,
              role: userRole?.role || 'user' as const,
              isSelected: false
            };
          });
        }
      }

      // Get all admin users
      console.log('Fetching admin users...');
      const { data: adminRolesData, error: adminError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('role', 'admin');
      
      console.log('Admin roles query result:', adminRolesData, adminError);

      let adminUsers: any[] = [];
      if (adminRolesData && !adminError && adminRolesData.length > 0) {
        const adminUserIds = adminRolesData.map(r => r.user_id);
        const { data: adminProfilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', adminUserIds)
          .not('email', 'is', null);
        
        console.log('Admin profiles query result:', adminProfilesData, profilesError);
        
        if (adminProfilesData && !profilesError) {
          adminUsers = adminProfilesData.map(user => ({
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            role: 'admin' as const,
            isSelected: false
          }));
        }
      }

      console.log('Company users found:', companyUsers.length);
      console.log('Admin users found:', adminUsers.length);

      // Combine and deduplicate users
      const allUsers = [...companyUsers, ...adminUsers];
      const uniqueUsers = allUsers.filter((user, index, self) => 
        index === self.findIndex(u => u.id === user.id)
      );

      console.log('Total unique users:', uniqueUsers.length);
      setUsers(uniqueUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "Failed to fetch users for email",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch order files
  const fetchOrderFiles = async () => {
    if (!order?.id) return;

    try {
      const { data, error } = await supabase
        .from('order_files')
        .select('id, file_name, file_url, file_type, mime_type')
        .eq('order_id', order.id);

      if (error) throw error;

      setOrderFiles(data || []);
    } catch (error) {
      console.error('Error fetching order files:', error);
    }
  };

  // Toggle user selection
  const toggleUserSelection = (userId: string) => {
    setUsers(prev => prev.map(user => 
      user.id === userId 
        ? { ...user, isSelected: !user.isSelected }
        : user
    ));
  };

  // Select all users
  const selectAllUsers = () => {
    setUsers(prev => prev.map(user => ({ ...user, isSelected: true })));
  };

  // Deselect all users
  const deselectAllUsers = () => {
    setUsers(prev => prev.map(user => ({ ...user, isSelected: false })));
  };

  // Send emails
  const sendEmails = async () => {
    const selectedUsers = users.filter(user => user.isSelected);
    
    if (selectedUsers.length === 0) {
      toast({
        title: "No Recipients",
        description: "Please select at least one user to send the email to.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-completed-order-email', {
        body: {
          orderId: order?.id,
          orderNumber: order?.orderNumber,
          companyName: order?.companyName,
          recipients: selectedUsers.map(user => ({
            id: user.id,
            email: user.email,
            name: user.full_name
          })),
          files: orderFiles
        }
      });

      if (error) throw error;

      toast({
        title: "Emails Sent",
        description: `Successfully sent email to ${selectedUsers.length} recipients.`,
      });

      onClose();
    } catch (error: any) {
      console.error('Error sending emails:', error);
      toast({
        title: "Error",
        description: `Failed to send emails: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (isOpen && order) {
      fetchUsers();
      fetchOrderFiles();
    }
  }, [isOpen, order]);

  const selectedCount = users.filter(user => user.isSelected).length;
  const adminUsers = users.filter(user => user.role === 'admin');
  const companyUsers = users.filter(user => user.role === 'user');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Order Files - Order #{order?.orderNumber}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading users...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Order info */}
            <div className="bg-muted/50 p-4 rounded-lg">
              <h3 className="font-medium mb-2">Order Details</h3>
              <p className="text-sm text-muted-foreground">
                Order #{order?.orderNumber} for {order?.companyName}
              </p>
              {orderFiles.length > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {orderFiles.length} file(s) will be included in the email
                </p>
              )}
            </div>

            {/* Selection controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="font-medium">Recipients ({selectedCount} selected)</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllUsers}
                  disabled={users.length === 0}
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={deselectAllUsers}
                  disabled={selectedCount === 0}
                >
                  Deselect All
                </Button>
              </div>
            </div>

            {/* Admin users */}
            {adminUsers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Admin Users</Badge>
                  <span className="text-sm text-muted-foreground">
                    ({adminUsers.filter(u => u.isSelected).length} selected)
                  </span>
                </div>
                <div className="space-y-2 pl-4">
                  {adminUsers.map(user => (
                    <div
                      key={user.id}
                      className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={user.isSelected}
                        onCheckedChange={() => toggleUserSelection(user.id)}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{user.full_name || 'No name'}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Company users */}
            {companyUsers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Company Users</Badge>
                  <span className="text-sm text-muted-foreground">
                    ({companyUsers.filter(u => u.isSelected).length} selected)
                  </span>
                </div>
                <div className="space-y-2 pl-4">
                  {companyUsers.map(user => (
                    <div
                      key={user.id}
                      className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={user.isSelected}
                        onCheckedChange={() => toggleUserSelection(user.id)}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{user.full_name || 'No name'}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {users.length === 0 && !loading && (
              <div className="text-center py-8 text-muted-foreground">
                No users with email addresses found for this company.
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={onClose} disabled={sending}>
                Cancel
              </Button>
              <Button
                onClick={sendEmails}
                disabled={selectedCount === 0 || sending}
                className="flex items-center gap-2"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Send Email to {selectedCount} Recipients
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}