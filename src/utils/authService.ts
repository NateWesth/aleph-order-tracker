
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
    // Use the new security definer function to get user role safely
    const { data: roleData, error: roleError } = await supabase
      .rpc('get_user_role_simple', { user_uuid: userId });

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
  console.log("=== ROLE VALIDATION DEBUG ===");
  console.log("Actual role from database:", actualRole);
  console.log("Selected user type from login form:", selectedUserType);
  
  // The login form has options: "admin" and "client"
  // The database stores roles as: "admin" and "user"
  // Registration form sends user_type as: "admin" or "user"
  
  // Validation logic:
  // If user selected "admin" in login -> expect "admin" role in DB
  // If user selected "client" in login -> expect "user" role in DB
  
  if (selectedUserType === "admin") {
    if (actualRole !== "admin") {
      console.log("ERROR: User selected admin but has role:", actualRole);
      throw new Error(`Access denied. You are registered as a client user but trying to login as admin. Please select "Client User" instead.`);
    }
    console.log("✓ Admin validation passed");
  } else if (selectedUserType === "client") {
    if (actualRole !== "user") {
      console.log("ERROR: User selected client but has role:", actualRole);
      throw new Error(`Access denied. You are registered as an admin user but trying to login as client. Please select "Admin User" instead.`);
    }
    console.log("✓ Client validation passed");
  } else {
    console.log("ERROR: Unknown user type selected:", selectedUserType);
    throw new Error(`Invalid user type selected: ${selectedUserType}`);
  }

  console.log("=== ROLE VALIDATION SUCCESS ===");
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
