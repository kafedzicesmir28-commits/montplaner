-- Seed Data: Employees, Stores, and Shifts
-- Run this SQL in your Supabase SQL Editor after running schema.sql

-- Add 10 Employees
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

-- Add Sample Stores
INSERT INTO stores (name) VALUES
  ('Hauptfiliale / Glavna prodavnica'),
  ('Nebenfiliale Nord / Podružnica Sjever'),
  ('Nebenfiliale Süd / Podružnica Jug')
ON CONFLICT DO NOTHING;

-- Add Sample Shifts
INSERT INTO shifts (name, start_time, end_time, break_minutes) VALUES
  ('Frühschicht / Rana smjena', '06:00', '14:00', 30),
  ('Spätschicht / Kasna smjena', '14:00', '22:00', 30),
  ('Nachtschicht / Noćna smjena', '22:00', '06:00', 30),
  ('Vormittag / Jutro', '08:00', '12:00', 0),
  ('Nachmittag / Popodne', '13:00', '17:00', 0)
ON CONFLICT DO NOTHING;

-- Verify the data
SELECT 'Employees:' as type, COUNT(*) as count FROM employees
UNION ALL
SELECT 'Stores:', COUNT(*) FROM stores
UNION ALL
SELECT 'Shifts:', COUNT(*) FROM shifts;
