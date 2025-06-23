
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
    // Query user_roles table directly with proper error handling
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

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

    console.log('User role found:', roleData.role);
    return roleData.role;
  } catch (error) {
    console.error('Unexpected error in getUserRole:', error);
    // Always return a default role instead of throwing
    return "user";
  }
};

export const validateUserRole = (actualRole: string, selectedUserType: string) => {
  console.log("Role verification:", { actualRole, selectedUserType });
  
  // Fix the validation logic - if user selected "admin" in login form, 
  // we expect their role in database to be "admin"
  // if user selected "client" in login form, we expect their role to be "user"
  if (selectedUserType === "admin" && actualRole !== "admin") {
    throw new Error(`You are registered as a client user but trying to login as admin. Please select the correct user type.`);
  }
  
  if (selectedUserType === "client" && actualRole !== "user") {
    throw new Error(`You are registered as an admin user but trying to login as client. Please select the correct user type.`);
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
