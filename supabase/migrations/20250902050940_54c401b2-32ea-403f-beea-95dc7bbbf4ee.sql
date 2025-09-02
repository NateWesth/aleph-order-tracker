-- Fix the data inconsistency - update the company code to match profile codes
UPDATE companies 
SET code = '4VUN8Y', updated_at = now()
WHERE id = '5bec4af2-895a-421a-86bc-996fbcf65cc7';