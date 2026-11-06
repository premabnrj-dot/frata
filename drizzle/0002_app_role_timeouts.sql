-- Every query has a deadline (from Ekatan's baseline): a runaway query or a
-- held lock fails in seconds instead of holding a pooled connection until
-- Vercel kills the function. A migration that needs longer sets
-- SET LOCAL statement_timeout in its own transaction (it runs as postgres anyway).
alter role frata_app set statement_timeout = '20s';
--> statement-breakpoint
alter role frata_app set lock_timeout = '10s';
--> statement-breakpoint
alter role frata_app set idle_in_transaction_session_timeout = '30s';
