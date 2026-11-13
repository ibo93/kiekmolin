-- iPhone-App (Xcode/Capacitor): Mitteilungen laufen dort NICHT über Web-Push,
-- sondern über Apple (APNs). Ein Abo ist dann nur ein Geräte-Token.
--   art = 'web'  → endpoint + p256dh + auth (wie bisher)
--   art = 'apns' → endpoint = Geräte-Token (hex), keine Schlüssel
alter table push_abos add column art text not null default 'web' check (art in ('web', 'apns'));
alter table push_abos alter column p256dh drop not null;
alter table push_abos alter column auth drop not null;
-- Ein Web-Abo ohne Schlüssel wäre ein stiller Ausfall: es läge da und käme nie an.
alter table push_abos add constraint push_web_hat_schluessel
  check (art <> 'web' or (p256dh is not null and auth is not null));
