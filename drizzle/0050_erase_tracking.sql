-- =============================================================================
-- ABANDONED ORDERS ERASED BEFORE ANALYTICS A·1 (security review 2026-11-08). Hand-written, one-off.
-- The daily erase (src/lib/orders/erase.ts) now also strips the attribution's click ids and referring site from an
-- abandoned online order's `checkout`; orders erased before it never will be again (erased_at is set), so this strips
-- them once. The keys are domains/analytics/attribution.ts ERASED_KEYS as of 2026-11-08 (a frozen snapshot). utm tags stay.
-- =============================================================================
update orders
   set checkout = jsonb_set(checkout, '{attribution}', (checkout->'attribution') - array['fbclid','gclid','gbraid','wbraid','gad_source','srsltid','ref_host','fbc','fbp']::text[])
 where erased_at is not null and jsonb_typeof(checkout->'attribution') = 'object';
