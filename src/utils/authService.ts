
import { supabase } from "@/integrations/supabase/client";
import { FormData } from "./authValidation";

export const signInUser = async (email: string, password: string) => {
  console.log("Attempting to sign in user with email:", email);
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Auth sign in error:', error);
    throw error;
  }

  return data;
};

export const getUserRole = async (userId: string) => {
  console.log("Fetching user role for:", userId);

  try {
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    console.log("User role query result:", { roleData, roleError });

    if (roleError) {
      console.error('Error fetching user role:', roleError);
      
      // If it's a policy error, the user might not have proper access
      if (roleError.code === '42501' || roleError.message.includes('policy')) {
        console.log('Policy error detected, assigning default role');
        return "user";
      }
      
      // For other database errors, assign default role instead of throwing
      console.log('Database error detected, assigning default role');
      return "user";
    }

    if (!roleData) {
      console.log('No role found for user, assigning default role "user"');
      
      // Try to create a default role for the user
      try {
        const { error: insertError } = await supabase
          .from('user_roles')
          .insert([{ user_id: userId, role: 'user' }]);
        
        if (insertError) {
          console.error('Error creating default role:', insertError);
        } else {
          console.log('Default role created successfully');
        }
      } catch (insertErr) {
        console.error('Failed to insert default role:', insertErr);
      }
      
      return "user";
    }

    console.log('User role found:', roleData.role);
    return roleData.role;
  } catch (error) {
    console.error('Unexpected error in getUserRole:', error);
    // Always return a default role instead of throwing
    return "user";
  }
};

export const validateUserRole = (actualRole: string, selectedUserType: string) => {
  // Map the selected user type to the expected role
  const selectedRole = selectedUserType === "admin" ? "admin" : "user";
  
  console.log("Role verification:", { actualRole, selectedRole, selectedUserType });
  
  if (actualRole !== selectedRole) {
    const displayRole = actualRole === "user" ? "client" : actualRole;
    const displaySelected = selectedUserType === "client" ? "client" : selectedUserType;
    throw new Error(`You are registered as a ${displayRole} user but trying to login as ${displaySelected}. Please select the correct user type.`);
  }

  return actualRole;
};

export const validateCompanyAssociation = async (userId: string, accessCode: string, userType: string) => {
  if (userType === "client") {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company_code')
      .eq('id', userId)
      .maybeSingle();

    console.log("Profile query result:", { profile, profileError });

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      throw new Error("Unable to verify company association. Please contact support.");
    }

    if (!profile || profile.company_code !== accessCode) {
      throw new Error("You don't belong to the company associated with this code.");
    }
  }
};

export const getErrorMessage = (error: any) => {
  let errorMessage = "An unexpected error occurred. Please try again.";
  
  if (error.message) {
    if (error.message.includes("Invalid login credentials")) {
      errorMessage = "Invalid email or password. Please check your credentials and try again.";
    } else if (error.message.includes("Email not confirmed")) {
      errorMessage = "Please check your email and confirm your account before logging in.";
    } else {
      errorMessage = error.message;
    }
  }
  
  return errorMessage;
};
