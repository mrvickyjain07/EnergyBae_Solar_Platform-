-- supabase/migrations/0013_wire_prices_manually_edited.sql
-- Tracks whether an "upload" row's price was hand-edited afterwards, so the
-- office can tell "upload" (as imported) apart from "upload (edited)" (price
-- since overridden by hand) in the Wire Prices list — without touching
-- `source`, which stays the row's actual origin, or `manual_override`, which
-- is a separate "protect from future uploads" lock.
alter table wire_prices add column if not exists manually_edited boolean not null default false;
