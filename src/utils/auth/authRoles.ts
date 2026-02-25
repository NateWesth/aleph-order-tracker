
import { supabase } from "@/integrations/supabase/client";

export const getUserRole = async (userId: string): Promise<'admin' | 'user'> => {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user role:', error);
      return 'user';
    }

    return data?.role || 'user';
  } catch (error) {
    console.error('Unexpected error in getUserRole:', error);
    return 'user';
  }
};

export const isUserAdmin = async (userId: string): Promise<boolean> => {
  const role = await getUserRole(userId);
  return role === 'admin';
};
