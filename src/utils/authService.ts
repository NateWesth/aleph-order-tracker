
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
    // Use the security definer function to avoid RLS recursion issues
    const { data: roleData, error: roleError } = await supabase.rpc('get_user_role', {
      user_uuid: userId
    });

    console.log("User role query result:", { roleData, roleError });

    if (roleError) {
      console.error('Error fetching user role:', roleError);
      
      // For any database errors, assign default role instead of throwing
      console.log('Database error detected, assigning default role');
      return "user";
    }

    if (!roleData) {
      console.log('No role found for user, assigning default role "user"');
      return "user";
    }

    console.log('User role found:', roleData);
    return roleData;
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
