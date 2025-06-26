
-- Check what companies exist and their exact codes
SELECT id, name, code, LENGTH(code) as code_length 
FROM companies 
WHERE UPPER(code) LIKE '%TR1BET%' OR UPPER(code) LIKE '%TR%';

-- Also check for any whitespace or special characters
SELECT id, name, code, ascii(substring(code, 1, 1)) as first_char_ascii
FROM companies 
ORDER BY created_at DESC 
LIMIT 5;
