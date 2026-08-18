import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
        <section className="user-approval-lane rounded-[28px] border border-warning/25 bg-warning/10 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-warning/15">
                <Clock className="h-5 w-5 text-warning" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-warning">Access queue</p>
                <h2 className="font-display text-lg font-semibold">Pending approval</h2>
              </div>
            </div>
            <Badge variant="outline" className="rounded-full border-warning/30 bg-background/70 px-3 py-1">
              {pendingUsers.length} waiting
            </Badge>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {pendingUsers.map((user) => (
              <article key={user.id} className="rounded-2xl border border-warning/20 bg-card/95 p-4 shadow-soft">
                <div className="flex items-start gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-warning/12 text-warning">
                    <User className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold">{user.full_name || 'N/A'}</h3>
                    <p className="text-sm text-muted-foreground">{user.position || 'No position supplied'}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(user.created_at).toLocaleDateString()}</span>
                </div>
                <div className="my-4 grid gap-2 rounded-2xl bg-muted/45 p-3 text-sm sm:grid-cols-2">
                  <span className="truncate">{user.email}</span>
                  <span className="truncate text-muted-foreground sm:text-right">{user.phone || 'No phone'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" onClick={() => approveUser(user.id, true)} className="bg-green-600 hover:bg-green-700">
                    <Check className="mr-1 h-4 w-4" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => approveUser(user.id, false)} className="border-destructive/35 text-destructive hover:bg-destructive/10">
                    <X className="mr-1 h-4 w-4" /> Reject
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Active Users Section */}
      <section className="user-directory-space">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Team directory</p>
            <h2 className="text-xl font-semibold">Active people</h2>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1">{approvedUsers.length} members</Badge>
        </div>
        {approvedUsers.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-border bg-card/60 py-16 text-center text-muted-foreground">No active users found.</div>
        ) : (
          <div className="user-directory-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {approvedUsers.map((user) => (
              <article key={user.id} className="group flex min-h-[300px] flex-col overflow-hidden rounded-[26px] border border-border/70 bg-card shadow-soft transition-all hover:-translate-y-1 hover:shadow-elevated">
                <div className="relative border-b border-border/60 bg-gradient-to-br from-primary/12 via-primary/5 to-transparent p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                      <User className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-lg font-semibold">{user.full_name || 'N/A'}</h3>
                      <p className="truncate text-sm text-muted-foreground">{user.position || 'Team member'}</p>
                    </div>
                    {user.role === 'admin' ? (
                      <Badge className="rounded-full bg-primary"><Shield className="mr-1 h-3 w-3" />Admin</Badge>
                    ) : (
                      <Badge variant="secondary" className="rounded-full">User</Badge>
                    )}
                  </div>
                </div>
                <div className="grid flex-1 gap-3 p-5">
                  <div className="rounded-2xl bg-muted/45 p-3">
                    <p className="truncate text-sm font-medium">{user.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.phone || 'No phone number'}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Company</p>
                      <p className="font-medium">{user.company_name}</p>
                    </div>
                    {user.company_code && <Badge variant="outline" className="rounded-full">{user.company_code}</Badge>}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
                    {user.can_edit_commission && <Badge variant="outline" className="border-green-600/50 text-green-700 dark:text-green-400"><Percent className="mr-1 h-3 w-3" />Commission</Badge>}
                  </div>
                </div>
                <div className="grid gap-2 border-t border-border/60 bg-muted/20 p-4 sm:grid-cols-2">
                  <Button size="sm" variant="outline" onClick={() => updateUserRole(user.id, user.role === 'admin' ? 'user' : 'admin')}>
                    {user.role === 'admin' ? <UserCog className="mr-1 h-4 w-4" /> : <Shield className="mr-1 h-4 w-4" />}
                    {user.role === 'admin' ? 'Make User' : 'Make Admin'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggleCommissionAccess(user.id, !user.can_edit_commission)}>
                    <Percent className="mr-1 h-4 w-4" /> {user.can_edit_commission ? 'Remove Commission' : 'Allow Commission'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => approveUser(user.id, false)} className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:col-span-2">
                    Revoke access
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="text-sm text-muted-foreground">
        Total users: {filteredUsers.length}
      </div>
    </div>
  );
}
