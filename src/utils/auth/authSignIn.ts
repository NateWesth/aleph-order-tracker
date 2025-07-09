
import { supabase } from "@/integrations/supabase/client";
import { getUserProfile, getUserRole } from "./index";

export const signInUser = async (email: string, password: string) => {
  console.log("Attempting to sign in user with email:", email);
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Sign in error:", error);
    throw error;
  }

  if (!data.user) {
    throw new Error("No user data returned from sign in");
  }

  console.log("User signed in successfully:", data.user.id);
  return data;
};

export const validateUserRole = (actualRole: 'admin' | 'user', expectedUserType: string) => {
  console.log("Validating user role - actual:", actualRole, "expected:", expectedUserType);
  
  if (expectedUserType === "admin" && actualRole !== "admin") {
    throw new Error("Access denied. Admin privileges required.");
  }
  
  if (expectedUserType === "client" && actualRole === "admin") {
    throw new Error("Admin users cannot log in as clients. Please use the admin login.");
  }
  
  console.log("Role validation passed");
};

export const validateCompanyAssociation = async (userId: string, accessCode: string, userType: string) => {
  if (userType !== "client") {
    return; // Only validate for client users
  }
  
  console.log("Validating company association for user:", userId, "with code:", accessCode);
  
  // Get user profile to check company association
  const profile = await getUserProfile(userId);
  
  if (!profile) {
    throw new Error("Unable to verify user profile. Please try again.");
  }
  
  // Check if user's company code matches the provided access code
  if (profile.company_code !== accessCode) {
    throw new Error("Your account is not associated with the provided company code. Please contact your administrator.");
  }
  
  console.log("Company association validated successfully");
};
