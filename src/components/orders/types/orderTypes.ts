

export interface OrderWithCompany {
  id: string;
  order_number: string;
  description?: string | null;
  status: string | null;
  total_amount?: number | null;
  created_at: string;
  updated_at: string;
  completed_date?: string;
  company_id?: string | null;
  user_id?: string;
  progress_stage?: string;
  items?: Array<{id: string, name: string, quantity: number}>;
  companyName: string;
}

