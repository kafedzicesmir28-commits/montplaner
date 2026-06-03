-- Store logistics: Lieferung Frische (L) weekdays.
-- Weekday encoding: 0=Sun, 1=Mon, ... 6=Sat.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS fresh_delivery_days int[] NOT NULL DEFAULT '{}';
