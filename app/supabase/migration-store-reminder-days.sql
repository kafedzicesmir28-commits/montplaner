-- Store logistics weekday configuration for planner labels.
-- B=order_days, LB=delivery_days, BF=fresh_order_days, L=fresh_delivery_days (see migration-store-logistics-fresh-delivery.sql).
-- Weekday encoding: 0=Sun, 1=Mon, ... 6=Sat.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS order_days int[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS delivery_days int[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fresh_order_days int[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fresh_delivery_days int[] NOT NULL DEFAULT '{}';
