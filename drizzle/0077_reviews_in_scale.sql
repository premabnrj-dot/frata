-- Reviews (owner, 2026-11-09): in the Scale plan; an add-on on Growth only (registry addOnFor). As 0075 did for GST,
-- the current Scale version lists it. The module is still "next", so nothing changes for a shop until R1 ships.
update plan_versions v set features = array_append(v.features, 'reviews') from plans p
 where p.id = v.plan_id and p.code = 'scale' and not ('reviews' = any(v.features));
