-- 1D·7 (architecture review): the queue's work tabs read OPEN orders only (openSql in
-- src/lib/db/order-predicates.ts says the same columns, in the same words, so the planner matches it). A shop's
-- history (packed, shipped, delivered, returned, cancelled) stays out of every tab count and list.
create index if not exists orders_open_idx on orders (tenant_id, placed_at desc)
  where packed_at is null and shipped_at is null and ndr_at is null and delivered_at is null
    and cancelled_at is null and rto_initiated_at is null and rto_delivered_at is null;
