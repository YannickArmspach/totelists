-- Markets stop being attached to individual totes.
--
-- A market is a real shop; every list you write is shopped in the same few of
-- them, so making each tote opt in was bookkeeping with no payoff. Markets are
-- now simply the account's, available to every tote, and tote_markets no
-- longer decides anything.
--
-- Order moves with them: it used to live per tote on tote_markets.sort, and is
-- now one order for the account. Existing rows inherit whichever order they
-- already had (lowest tote_markets.sort wins), so nothing visibly reshuffles.
ALTER TABLE markets ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;

UPDATE markets SET sort = COALESCE(
    (SELECT MIN(tm.sort) FROM tote_markets AS tm WHERE tm.market_id = markets.id),
    0
);

-- tote_markets is left in place, unread: it holds the only record of which
-- tote used which market, and dropping it would make this irreversible.
