

## Rep Commission Calculator

Build a new "Commission" tab in the admin dashboard that reads Zoho invoices, maps them to reps via a manual rep-to-company assignment, and calculates commission per rep based on individual commission rates.

### Database changes

1. **New `reps` table** — stores sales reps with their commission percentage
   - `id` (uuid, PK)
   - `name` (text)
   - `commission_rate` (numeric) — e.g. 5.0 for 5%
   - `email` (text, nullable)
   - `created_at`, `updated_at`
   - RLS: admin-only management, authenticated read

2. **New `rep_company_assignments` table** — links reps to companies
   - `id` (uuid, PK)
   - `rep_id` (uuid, FK → reps)
   - `company_id` (uuid, FK → companies)
   - `created_at`
   - Unique constraint on (rep_id, company_id)
   - RLS: admin-only management, authenticated read

### Edge function: `rep-commission-data`

- Accepts a date range (month/custom) and optional rep_id filter
- Fetches Zoho invoices for the period via the Zoho Books API (`/invoices` endpoint with `date` filters)
- Matches each invoice's customer to local companies (using existing Zoho contact matching logic)
- Looks up which rep owns each company via `rep_company_assignments`
- Calculates commission: `invoice_total * rep.commission_rate / 100`
- Returns per-rep summary: total invoiced, commission earned, invoice count, plus line-item breakdown
- Resource-aware: paginated Zoho fetch, limited to the selected date range

### Frontend: `CommissionPage.tsx`

- **Rep management section**: Add/edit/delete reps with name, email, commission rate; assign companies to each rep via multi-select
- **Commission report section**:
  - Month picker (defaults to current month)
  - Per-rep cards showing: total invoiced amount, commission rate, commission earned, number of invoices
  - Expandable detail rows showing individual invoices
  - Summary totals at the bottom
  - Export to CSV button

### Admin Dashboard integration

- Add a new nav item `{ id: "commission", label: "Commission", icon: Percent, badge: 0 }` to the `navItems` array
- Render `<CommissionPage />` when `activeView === "commission"`

### Technical details

- Edge function uses same auth pattern (`getAuthHeaders`) and Zoho token refresh as existing functions
- Zoho invoice endpoint: `GET /books/v3/invoices?organization_id={org}&date_start={start}&date_end={end}&per_page=200`
- Company matching: case-insensitive name match + Zoho customer_id lookup (existing pattern)
- Commission rate stored per-rep, not per-company, keeping the model simple

