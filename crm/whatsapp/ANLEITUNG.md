# WhatsApp automatisch ins CRM

Kunde schreibt dir auf WhatsApp → die Nachricht landet im CRM → je nach
Einstellung antwortet das System selbst.

Deine Nummer bleibt deine Nummer. Kein Sperrrisiko: das ist der Weg,
den Meta selbst vorgesehen hat (**Coexistence**, seit Mai 2025).

---

## Was du machen musst

### 1. Auf die WhatsApp Business App wechseln

Kostenlos im App Store. Beim Einrichten bietet sie an, deine bestehenden
Chats und deine Nummer zu übernehmen — annehmen. Danach ist alles wie
vorher, nur mit ein paar Extras (Labels, Schnellantworten).

*Wichtig: erst ein Backup deiner Chats machen.*

### 2. Meta-Business-Konto anlegen und verifizieren

business.facebook.com → Unternehmen anlegen. Du brauchst:

- Firmenname, Anschrift, Telefonnummer
- Gewerbeanmeldung oder Handelsregisterauszug als Nachweis
- eine Website (kiekmolin.de oder deine Agenturseite reicht)

**Die Prüfung dauert ein paar Tage.** Das ist der lange Teil, da wartest
du auf Meta. Fang früh damit an.

### 3. Coexistence einschalten

Über einen Anbieter (BSP) oder direkt bei Meta. Dabei wird deine Nummer
zusätzlich an die Cloud API angebunden — die App läuft weiter, beide
Seiten bleiben synchron.

Danach hast du zwei Angaben, die du brauchst:

- **Phone Number ID** (nicht die Telefonnummer selbst)
- einen **dauerhaften Zugangsschlüssel** (Permanent Access Token)

---

## Was ich vorbereitet habe

### Tabellen anlegen

`supabase/tabellen.sql` → im Supabase-SQL-Editor einfügen → **Run**.

Legt zwei Tabellen an:

- `wa_nachrichten` — jede eingehende und gesendete Nachricht
- `wa_einstellungen` — die Stufe und die Bremsen

Geschützt wie beim Sync: schreiben darf nur der Empfänger, lesen nur dein
angemeldetes CRM.

### Empfänger bereitstellen

`supabase/webhook.ts` → als Edge Function hochladen:

```bash
supabase functions deploy wa-webhook --no-verify-jwt
```

Danach im Supabase-Dashboard unter **Edge Functions → Secrets** eintragen:

| Name | Was |
|---|---|
| `WA_TOKEN` | dauerhafter Zugangsschlüssel von Meta |
| `WA_NUMMER_ID` | Phone Number ID |
| `WA_APP_SECRET` | App-Geheimnis, für die Signaturprüfung |
| `WA_VERIFY_TOKEN` | denkst du dir aus, brauchst du gleich nochmal |
| `ANTHROPIC_API_KEY` | dein Claude-Schlüssel |

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` setzt Supabase selbst.

### Bei Meta eintragen

Im Meta-Entwicklerkonto unter **WhatsApp → Configuration → Webhook**:

- **Callback URL**: `https://<dein-projekt>.supabase.co/functions/v1/wa-webhook`
- **Verify Token**: dasselbe Wort wie in `WA_VERIFY_TOKEN`
- Abonnieren: **messages**

---

## Die drei Stufen

Stellst du in `wa_einstellungen` ein (`stufe` 1, 2 oder 3).
Startwert ist 1, und `aktiv` steht auf `false` — es passiert erst was,
wenn du es einschaltest.

| Stufe | Was das System tut |
|---|---|
| **1 – Melden** | Antwortet einmal mit „hab ich gesehen, melde mich gleich". Kein Inhalt, keine Zusage. |
| **2 – Beantworten** | Beantwortet, was zweifelsfrei feststeht: Stand eines Auftrags, Rechnungsnummer, Erreichbarkeit. Alles andere wird Entwurf. |
| **3 – Voll** | Antwortet auf alles selbst. |

## Die Bremsen — gelten auf jeder Stufe

Nachgeprüft mit 27 Tests, sie halten auch auf Stufe 3:

- **Nie ein Preis, der nicht in deinen Daten steht.** Stattdessen: „Ich
  schau mir das an und melde mich mit einem Preis."
- **Nie eine Terminzusage.**
- **Reklamation, Mahnung, Anwalt, Kündigung, Anzeige** → das System
  schweigt und markiert die Nachricht für dich.
- **Sprachnachrichten und Bilder** werden nicht beantwortet, nur abgelegt.
- **Nachts (20:00–07:00)** wird nur gemeldet, nie inhaltlich geantwortet.
- **Höchstens eine Meldung pro Kunde in vier Stunden** — sonst schreibt
  das System bei fünf Nachrichten hintereinander fünfmal zurück.

Die gesperrten Wörter stehen in `wa_einstellungen.gesperrte_woerter` und
lassen sich erweitern.

## Wie es antwortet

Kurz, „Moin", duzend, keine Emojis, zwei bis drei Sätze — wie unter
Handwerkern. Erkennt das System die Nummer als Stammkunde, kennt es
Firma, laufende Aufträge und offene Rechnungen und bezieht sich darauf.

Weiß es etwas nicht sicher, sagt es das und kündigt deine Rückmeldung an.
Lieber nichts sagen als etwas Falsches.

---

## Reihenfolge zum Ausprobieren

1. Tabellen anlegen (geht sofort, unabhängig von Meta)
2. Warten auf die Meta-Verifizierung
3. Empfänger hochladen, Secrets setzen, Webhook eintragen
4. `aktiv` auf `true`, **Stufe 1**
5. Von einer anderen Nummer aus testen
6. Ein paar Tage mitlesen. Passt es, auf **Stufe 2** hoch.
7. Stufe 3 erst, wenn du den Entwürfen wirklich vertraust.
