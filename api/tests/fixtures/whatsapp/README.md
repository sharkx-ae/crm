# WhatsApp fixtures (F3a)

**These are NOT recordings from Meta.** They are hand-built from the payload shapes in Meta's documentation, with fake
ids, fake phone numbers (`+1 555 010 xxxx`) and made-up message text. They exist so the signature, storage and
connect tests can run before Meta access exists.

They will be replaced by scrubbed recordings from the first real deliveries (plan §9.5, T4 and T10). Until then, do not
treat them as evidence of what Meta really sends.

- `webhooks/*.json`: stored and signed as raw bytes (never re-serialised). `messages-arabic.json` uses escaped unicode
  (`\uXXXX`) on purpose: re-serialising it changes the bytes, so a signature over the re-serialised body must fail.
- `signature-vector.json`: `{ secret, bodyFile, header }`, the header computed once with an independent HMAC.
- `graph/*.json`: Graph API response shapes for the Graph client tests.
- `.gitattributes` marks the folder `-text` so Windows checkouts keep the exact bytes.
