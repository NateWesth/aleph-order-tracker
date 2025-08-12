
import { supabase } from "@/integrations/supabase/client";

export interface FormData {
  email: string;
  password: string;
  userType: string;
  accessCode: string;
}

export const validateAccessCode = async (formData: FormData) => {
  if (formData.userType === "admin") {
    if (!formData.accessCode.trim()) {
      throw new Error("Admin access code is required.");
    }
    
    if (formData.accessCode !== "ALEPH7901") {
      throw new Error("Invalid admin access code.");
    }
  } else {
    if (!formData.accessCode.trim()) {
      throw new Error("Company code is required.");
    }
    
    // Validate company code exists using secure function
    const { data: isValidCode, error: companyError } = await supabase
      .rpc('validate_company_code', { company_code: formData.accessCode });

    if (companyError) {
      console.error('Company validation error:', companyError);
      throw new Error("Unable to validate company code. Please try again.");
    }

    if (!isValidCode) {
      throw new Error("Invalid company code. Please check with your company administrator.");
    }
  }
};
