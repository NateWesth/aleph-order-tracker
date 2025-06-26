
-- Let's see what companies exist and their exact codes
SELECT id, name, code, LENGTH(code) as code_length, ASCII(SUBSTRING(code, 1, 1)) as first_char_ascii
FROM companies 
WHERE code LIKE '%TR1BET%' OR code LIKE '%TR%';
