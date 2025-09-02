-- Fix the data inconsistency between company code and profile company codes
-- Update the company code to match what users have in their profiles
UPDATE companies 
SET code = '4VUN8Y', updated_at = now()
WHERE code = '4VUNY8' AND name = 'Lwandle RNS Holdings';