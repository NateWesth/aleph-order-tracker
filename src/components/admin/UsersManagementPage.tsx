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
import { User, Shield, Search, Check, X, Clock, UserCog, Percent } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageHeader } from "@/components/ui/PageHeader";

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
  can_edit_commission?: boolean;
  role?: 'admin' | 'user';
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

      // Fetch user roles
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) {
        console.error("User roles fetch error:", rolesError);
        throw rolesError;
      }

      // Combine profiles with roles and company names
      const usersWithRoles = profiles?.map(profile => ({
        ...profile,
        role: userRoles?.find(role => role.user_id === profile.id)?.role || 'user',
        company_name: profile.companies?.name || 'N/A'
      })) || [];

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
      const { error } = await supabase
        .from('profiles')
        .update({ approved: approve })
        .eq('id', userId);

      if (error) throw error;

      setUsers(users.map(user => 
        user.id === userId ? { ...user, approved: approve } : user
      ));

      toast({
        title: "Success",
        description: approve ? "User has been approved." : "User access has been revoked.",
      });
    } catch (error: any) {
      console.error("Failed to update user approval:", error);
      toast({
        title: "Error",
        description: "Failed to update user approval.",
        variant: "destructive",
      });
    }
  };

  const updateUserRole = async (userId: string, newRole: 'admin' | 'user') => {
    try {
      // Check if user already has a role record
      const { data: existingRole, error: checkError } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingRole) {
        // Update existing role
        const { error } = await supabase
          .from('user_roles')
          .update({ role: newRole })
          .eq('user_id', userId);

        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newRole });

        if (error) throw error;
      }

      setUsers(users.map(user => 
        user.id === userId ? { ...user, role: newRole } : user
      ));

      toast({
        title: "Success",
        description: `User role updated to ${newRole}.`,
      });
    } catch (error: any) {
      console.error("Failed to update user role:", error);
      toast({
        title: "Error",
        description: "Failed to update user role.",
        variant: "destructive",
      });
    }
  };

  const toggleCommissionAccess = async (userId: string, value: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ can_edit_commission: value })
        .eq('id', userId);
      if (error) throw error;
      setUsers(users.map(u => u.id === userId ? { ...u, can_edit_commission: value } : u));
      toast({
        title: "Success",
        description: value ? "User can now edit commissions." : "Commission editing access revoked.",
      });
    } catch (error: any) {
      console.error("Failed to update commission access:", error);
      toast({ title: "Error", description: "Failed to update commission access.", variant: "destructive" });
    }
  };

  const filteredUsers = users.filter(user => 
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.company_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingUsers = filteredUsers.filter(u => !u.approved);
  const approvedUsers = filteredUsers.filter(u => u.approved);

  if (loading) {
    return <PageSkeleton variant="cards" />;
  }

  return (
    <div className="aleph-page-workspace aleph-users-workspace space-y-6">
      <PageHeader
        title="User Management"
        icon={UserCog}
        description="Approve requests and manage team access."
        stats={[{ label: "users", value: users.length, icon: User }]}
        toolbar={
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search users..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        }
      />

      {/* Pending Approval Section */}
      {pendingUsers.length > 0 && (
        <div className="bg-warning/10 rounded-2xl p-4 border-2 border-warning/20">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-warning" />
            <h2 className="font-display text-lg font-semibold text-warning">
              Pending Approval ({pendingUsers.length})
            </h2>
          </div>
          <div className="bg-card rounded-xl shadow-soft">
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
                        <div className="bg-yellow-100 dark:bg-yellow-900/50 p-2 rounded-full">
                          <User className="h-4 w-4 text-yellow-600" />
                        </div>
                        <div>
                          <div className="font-medium">{user.full_name || 'N/A'}</div>
                          <div className="text-sm text-muted-foreground">{user.position || 'No position'}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{user.email}</div>
                      <div className="text-sm text-muted-foreground">{user.phone || 'No phone'}</div>
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

      {/* Active Users Section */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Active Users ({approvedUsers.length})</h2>
        <div className="bg-card rounded-lg shadow">
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
                        <div className="bg-primary/10 p-2 rounded-full">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{user.full_name || 'N/A'}</div>
                          <div className="text-sm text-muted-foreground">{user.position || 'No position'}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{user.email}</div>
                      <div className="text-sm text-muted-foreground">{user.phone || 'No phone'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.company_name}</Badge>
                      {user.company_code && (
                        <div className="text-xs text-muted-foreground mt-1">Code: {user.company_code}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        {user.role === 'admin' ? (
                          <Badge className="bg-primary">
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <User className="h-3 w-3 mr-1" />
                            User
                          </Badge>
                        )}
                        {user.can_edit_commission && (
                          <Badge variant="outline" className="border-green-600 text-green-700 dark:text-green-400">
                            <Percent className="h-3 w-3 mr-1" />
                            Commission Editor
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {new Date(user.created_at).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 flex-wrap">
                        {user.role === 'admin' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateUserRole(user.id, 'user')}
                            className="text-orange-600 border-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                          >
                            <UserCog className="h-4 w-4 mr-1" />
                            Make User
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateUserRole(user.id, 'admin')}
                            className="text-primary border-primary hover:bg-primary/10"
                          >
                            <Shield className="h-4 w-4 mr-1" />
                            Make Admin
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleCommissionAccess(user.id, !user.can_edit_commission)}
                          className={user.can_edit_commission
                            ? "text-green-700 border-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                            : "text-muted-foreground border-muted-foreground/40 hover:bg-accent"}
                        >
                          <Percent className="h-4 w-4 mr-1" />
                          {user.can_edit_commission ? 'Revoke Commission' : 'Allow Commission'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => approveUser(user.id, false)}
                          className="text-destructive border-destructive hover:bg-destructive/10"
                        >
                          Revoke Access
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        Total users: {filteredUsers.length}
      </div>
    </div>
  );
}
