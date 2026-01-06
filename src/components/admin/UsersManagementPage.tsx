import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { User, Shield, Search, Check, X, Clock } from "lucide-react";
import { UsersManagementPageSkeleton } from "@/components/ui/skeletons";

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  position: string;
  company_code: string;
  company_id: string;
  created_at: string;
  approved: boolean;
  role?: string;
  company_name?: string;
}

export default function UsersManagementPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      console.log("Fetching profiles...");
      
      // Fetch profiles with company information
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          *,
          companies(name)
        `)
        .order('created_at', { ascending: false });

      if (profilesError) {
        console.error("Profiles fetch error:", profilesError);
        throw profilesError;
      }

      console.log("Profiles fetched successfully:", profiles);

      // Fetch user roles
      console.log("Fetching user roles...");
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) {
        console.error("User roles fetch error:", rolesError);
        throw rolesError;
      }

      console.log("User roles fetched successfully:", userRoles);

      // Combine profiles with roles and company names
      const usersWithRoles = profiles?.map(profile => ({
        ...profile,
        role: userRoles?.find(role => role.user_id === profile.id)?.role || 'admin',
        company_name: profile.companies?.name || 'N/A'
      })) || [];

      console.log("Combined user data:", usersWithRoles);
      setUsers(usersWithRoles);
    } catch (error: any) {
      console.error("Failed to fetch users:", error);
      toast({
        title: "Error",
        description: "Failed to fetch users. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const approveUser = async (userId: string, approve: boolean) => {
    try {
      console.log("Updating user approval:", { userId, approve });
      
      const { error } = await supabase
        .from('profiles')
        .update({ approved: approve })
        .eq('id', userId);

      if (error) {
        console.error("Approval update error:", error);
        throw error;
      }

      console.log("User approval updated successfully");

      // Update local state
      setUsers(users.map(user => 
        user.id === userId ? { ...user, approved: approve } : user
      ));

      toast({
        title: "Success",
        description: approve ? "User has been approved and can now access the system." : "User access has been revoked.",
      });
    } catch (error: any) {
      console.error("Failed to update user approval:", error);
      toast({
        title: "Error",
        description: "Failed to update user approval. Please try again.",
        variant: "destructive",
      });
    }
  };

  const filteredUsers = users.filter(user => 
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.company_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Separate pending and approved users
  const pendingUsers = filteredUsers.filter(u => !u.approved);
  const approvedUsers = filteredUsers.filter(u => u.approved);

  if (loading) {
    return <UsersManagementPageSkeleton />;
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-aleph-green">User Management</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search users..."
              className="pl-10 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Pending Approval Section */}
      {pendingUsers.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-yellow-600" />
            <h2 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200">
              Pending Approval ({pendingUsers.length})
            </h2>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <div className="bg-yellow-100 p-2 rounded-full">
                          <User className="h-4 w-4 text-yellow-600" />
                        </div>
                        <div>
                          <div className="font-medium">{user.full_name || 'N/A'}</div>
                          <div className="text-sm text-gray-500">{user.position || 'No position'}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="text-sm">{user.email}</div>
                        <div className="text-sm text-gray-500">{user.phone || 'No phone'}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {new Date(user.created_at).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => approveUser(user.id, true)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => approveUser(user.id, false)}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Approved Users Section */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Active Users ({approvedUsers.length})</h2>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    No active users found.
                  </TableCell>
                </TableRow>
              ) : (
                approvedUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <div className="bg-aleph-green/10 p-2 rounded-full">
                          <User className="h-4 w-4 text-aleph-green" />
                        </div>
                        <div>
                          <div className="font-medium">{user.full_name || 'N/A'}</div>
                          <div className="text-sm text-gray-500">{user.position || 'No position'}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="text-sm">{user.email}</div>
                        <div className="text-sm text-gray-500">{user.phone || 'No phone'}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <Badge variant="outline">{user.company_name}</Badge>
                        {user.company_code && (
                          <div className="text-xs text-gray-500 mt-1">Code: {user.company_code}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-aleph-green">
                        <Shield className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {new Date(user.created_at).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => approveUser(user.id, false)}
                        className="text-red-600 border-red-600 hover:bg-red-50"
                      >
                        Revoke Access
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="text-sm text-gray-600 dark:text-gray-400">
        Total users: {filteredUsers.length}
      </div>
    </div>
  );
}
