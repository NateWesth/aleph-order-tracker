
import { supabase } from "@/integrations/supabase/client";

export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  company_code: string | null;
  company_id: string | null;
}

export interface UserRole {
  role: 'admin' | 'user';
}

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  try {
    console.log("Fetching user profile for userId:", userId);
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }

    console.log("User profile fetched successfully:", data);
    return data;
  } catch (error) {
    console.error('Unexpected error fetching user profile:', error);
    return null;
  }
};

export const getUserRole = async (userId: string): Promise<'admin' | 'user'> => {
  try {
    console.log("Fetching user role for userId:", userId);
    
    // First, try to get the role directly from the user_roles table
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user role:', error);
      return 'user'; // Default to user role if there's an error
    }

    if (!data) {
      console.log("No role found for user, defaulting to 'user'");
      return 'user';
    }

    console.log("User role fetched successfully:", data.role);
    return data.role;
  } catch (error) {
    console.error('Unexpected error fetching user role:', error);
    return 'user'; // Default to user role if there's an error
  }
};

export const isUserAdmin = async (userId: string): Promise<boolean> => {
  const role = await getUserRole(userId);
  return role === 'admin';
};
