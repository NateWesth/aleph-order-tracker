
export const getErrorMessage = (error: any): string => {
  console.log("Processing error message for:", error);
  
  if (error?.message) {
    // Handle specific Supabase auth errors
    if (error.message.includes('Invalid login credentials')) {
      return 'Invalid email or password. Please check your credentials and try again.';
    }
    
    if (error.message.includes('Email not confirmed')) {
      return 'Please check your email and click the confirmation link before signing in.';
    }
    
    if (error.message.includes('Too many requests')) {
      return 'Too many login attempts. Please wait a moment and try again.';
    }
    
    return error.message;
  }
  
  return 'An unexpected error occurred. Please try again.';
};
