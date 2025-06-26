
-- Check all companies in the database
SELECT id, name, code, created_at 
FROM companies 
ORDER BY created_at DESC;

-- Also check the exact structure of any existing company codes
SELECT code, LENGTH(code) as code_length, 
       encode(code::bytea, 'hex') as hex_representation
FROM companies;
