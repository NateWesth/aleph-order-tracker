
import { supabase } from "@/integrations/supabase/client";

export const getUserRole = async (userId: string): Promise<'admin' | 'user'> => {
  try {
    console.log("=== GETTING USER ROLE ===");
    console.log("Fetching user role for userId:", userId);
    
    // Test direct query to user_roles table with new simplified policy
    console.log("Testing direct query to user_roles table...");
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('❌ Direct query error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error details:', error.details);
      console.error('Error hint:', error.hint);
      
      // For the specific admin user, return admin as fallback
      if (userId === '77dc6c73-f21e-4564-a188-b66f95f4393e') {
        console.log("✅ Returning admin role for known admin user due to error");
        return 'admin';
      }
      return 'user';
    }

    if (!data) {
      console.log("⚠️ No role record found in database for user:", userId);
      
      // Check if this is the known admin user
      if (userId === '77dc6c73-f21e-4564-a188-b66f95f4393e') {
        console.log("🔧 This is the known admin user but no role record exists");
        console.log("🔧 We should create an admin role record for this user");
        
        // Try to insert admin role for this user
        try {
          const { data: insertData, error: insertError } = await supabase
            .from('user_roles')
            .insert([{ user_id: userId, role: 'admin' }])
            .select()
            .single();
            
          if (insertError) {
            console.error("❌ Failed to create admin role:", insertError);
            return 'admin'; // Return admin anyway since we know this user
          } else {
            console.log("✅ Successfully created admin role:", insertData);
            return 'admin';
          }
        } catch (insertErr) {
          console.error("❌ Exception creating admin role:", insertErr);
          return 'admin'; // Return admin anyway since we know this user
        }
      }
      
      return 'user';
    }

    console.log("✅ User role found successfully:", data.role);
    console.log("=== USER ROLE FETCH COMPLETE ===");
    return data.role;
  } catch (error) {
    console.error('❌ Unexpected error in getUserRole:', error);
    
    // Final fallback for known admin user
    if (userId === '77dc6c73-f21e-4564-a188-b66f95f4393e') {
      console.log("✅ Returning admin role for known admin user due to exception");
      return 'admin';
    }
    
    return 'user';
  }
};

export const isUserAdmin = async (userId: string): Promise<boolean> => {
  const role = await getUserRole(userId);
  return role === 'admin';
};
