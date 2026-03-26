-- Add 10 Sample Employees
-- Run this SQL in your Supabase SQL Editor

INSERT INTO employees (name) VALUES
  ('Max Mustermann'),
  ('Anna Schmidt'),
  ('Thomas Müller'),
  ('Sarah Weber'),
  ('Michael Fischer'),
  ('Julia Wagner'),
  ('David Becker'),
  ('Lisa Schulz'),
  ('Daniel Hoffmann'),
  ('Maria Koch')
ON CONFLICT DO NOTHING;

-- Verify the employees were added
SELECT id, name, created_at FROM employees ORDER BY name;
