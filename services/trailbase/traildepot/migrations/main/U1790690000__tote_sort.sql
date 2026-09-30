-- Totes get a chosen order, like markets.
--
-- They were listed by id, which for uuid v7 means creation order — fine until
-- you have a weekly shop, a hardware list and a holiday list and want the one
-- you actually use first.
--
-- Existing rows are numbered in the order they already appeared, so nothing
-- moves on the first load.
ALTER TABLE totes ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;

UPDATE totes SET sort = (SELECT COUNT(*) FROM totes AS other WHERE other.id <= totes.id);
