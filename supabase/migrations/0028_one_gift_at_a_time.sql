-- Little gifts: one at a time. While a gift is still wrapped, the sender can't
-- send another to the same person (the app shows it as waiting instead); they
-- can take it back, or send a new one once it has been unwrapped.

create unique index gifts_one_wrapped on public.gifts (from_profile, to_profile) where opened_at is null;
