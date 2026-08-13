
import { supabase } from "@/integrations/supabase/client";
import { getUserProfile, getUserRole } from "./index";

export const signInUser = async (email: string, password: string) => {
  
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

  return data;
};

export const validateUserRole = (actualRole: 'admin' | 'user', expectedUserType: string) => {
  
  if (expectedUserType === "admin" && actualRole !== "admin") {
    throw new Error("Access denied. Admin privileges required.");
  }
  
  if (expectedUserType === "user" && actualRole === "admin") {
    throw new Error("Admin users cannot log in as regular users. Please use the admin login.");
  }
  
};

export const validateCompanyAssociation = async (userId: string, accessCode: string, userType: string) => {
  if (userType !== "user") {
    return; // Only validate for regular users
  }
  
  
  // Get user profile to check company association
  const profile = await getUserProfile(userId);
  
  if (!profile) {
    throw new Error("Unable to verify user profile. Please try again.");
  }
  
  // Check if user's company code matches the provided access code (case-insensitive)
  if (profile.company_code?.trim().toUpperCase() !== accessCode.trim().toUpperCase()) {
    throw new Error("Your account is not associated with the provided company code. Please contact your administrator.");
  }
  
};
