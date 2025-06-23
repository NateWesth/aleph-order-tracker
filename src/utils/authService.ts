
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

  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  console.log("User role query result:", { roleData, roleError });

  if (roleError) {
    console.error('Error fetching user role:', roleError);
    throw new Error("Unable to verify user role. Please contact support.");
  }

  if (!roleData) {
    console.error('No role found for user:', userId);
    // Assign a default role if no role is found
    console.log('Assigning default role "user" for user:', userId);
    return "user";
  }

  return roleData.role;
};

export const validateUserRole = (actualRole: string, selectedUserType: string) => {
  const selectedRole = selectedUserType === "admin" ? "admin" : "user";
  
  console.log("Role verification:", { actualRole, selectedRole });
  
  if (actualRole !== selectedRole) {
    throw new Error(`You are registered as a ${actualRole} user but trying to login as ${selectedUserType}. Please select the correct user type.`);
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
