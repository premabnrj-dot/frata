-- TRUE PROFIT (plan docs/plans/2026-11-12-true-profit-a3.md, owner calls 2026-11-12): in Scale through its plan
-- features, as 0113 did for Delivery Zones (more for the same price); on Launch and Growth an add-on at ₹999/month
-- (addon_prices v1 since 0028), with A3's 14-day self-serve trial.
update plan_versions v set features = array_append(v.features, 'true_profit') from plans p
 where p.id = v.plan_id and p.code = 'scale' and not ('true_profit' = any(v.features));
