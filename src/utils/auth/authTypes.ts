
export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  company_code: string | null;
  company_id: string | null;
}

export interface UserRole {
  role: 'admin' | 'user';
}

export interface FormData {
  email: string;
  password: string;
  userType: string;
  accessCode: string;
}
