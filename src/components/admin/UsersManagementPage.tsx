
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
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Shield, Search } from "lucide-react";

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  position: string;
  company_code: string;
  company_id: string;
  created_at: string;
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
        role: userRoles?.find(role => role.user_id === profile.id)?.role || 'user',
        company_name: profile.companies?.name || 'Unknown Company'
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

  const updateUserRole = async (userId: string, newRole: "admin" | "user") => {
    try {
      console.log("Updating user role:", { userId, newRole });
      
      // Update role in user_roles table
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', userId);

      if (error) {
        console.error("Role update error:", error);
        throw error;
      }

      console.log("User role updated successfully");

      // Update local state
      setUsers(users.map(user => 
        user.id === userId ? { ...user, role: newRole } : user
      ));

      toast({
        title: "Success",
        description: `User role updated to ${newRole === 'user' ? 'client' : newRole}`,
      });
    } catch (error: any) {
      console.error("Failed to update user role:", error);
      toast({
        title: "Error",
        description: "Failed to update user role. Please try again.",
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
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

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
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
                      <div className="text-xs text-gray-500 mt-1">Code: {user.company_code || 'None'}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={user.role === 'admin' ? 'default' : 'secondary'}
                      className={user.role === 'admin' ? 'bg-aleph-green' : ''}
                    >
                      <Shield className="h-3 w-3 mr-1" />
                      {user.role === 'user' ? 'client' : user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {new Date(user.created_at).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      onValueChange={(value: "admin" | "user") => updateUserRole(user.id, value)}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Client</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        Total users: {filteredUsers.length}
      </div>
    </div>
  );
}
