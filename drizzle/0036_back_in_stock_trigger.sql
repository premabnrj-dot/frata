-- =============================================================================
-- BACK IN STOCK, themes T2 (plan § T2 review, architecture-reviewer 2026-11-08). Hand-written.
--
-- variants.sold_out_at and variants.restocked_at are kept by the database alone: every stock path is an update of
-- variants.stock (placement, cancel, switch, the product form), so one trigger is the one write point. Whatever the
-- app sends for either column is replaced by what the trigger derives.
--   sold_out_at  := now()  when stock goes from > 0 to 0
--   restocked_at := now()  when stock goes from 0 to > 0, the variant stops selling at 0 (when_out = 'stop': a
--                           pre-order or made-to-order variant was never "out"), and it had been sold out ≥ 24 h
--                           (a cancel returning the piece a COD order just took is not "back").
-- Security invoker, search_path '': it only edits NEW; it reads nothing.
-- =============================================================================
create or replace function app_variant_stock_times() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.sold_out_at := null; new.restocked_at := null;
    return new;
  end if;
  new.sold_out_at := old.sold_out_at; new.restocked_at := old.restocked_at;
  if old.stock > 0 and new.stock = 0 then new.sold_out_at := now(); end if;
  if old.stock = 0 and new.stock > 0 and old.when_out = 'stop'
     and old.sold_out_at is not null and old.sold_out_at <= now() - interval '24 hours' then
    new.restocked_at := now();
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app_variant_stock_times() from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_variant_stock_times() to frata_app;
--> statement-breakpoint
create trigger variants_stock_times before insert or update on variants for each row execute function app_variant_stock_times();
--> statement-breakpoint
-- Variants sold out today (stop when out) count as sold out from now: if they come back after a day, they are back.
update variants set sold_out_at = now() where stock = 0 and when_out = 'stop' and archived_at is null;
