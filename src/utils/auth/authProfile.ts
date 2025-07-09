
import { supabase } from "@/integrations/supabase/client";
import { UserProfile } from "./authTypes";

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
