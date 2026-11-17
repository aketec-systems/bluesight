# Bluesight protocol

Two roads, one set of keys:

- **Bluetooth (free):** phones close to each other (about 30 m) discover each other, swap signed cards, like, match and chat directly. No internet involved.
- **Internet (metered):** one batched `POST /v1/sync` carries everything both ways. Used for people around town, for browsing a city you picked (such as home), and for chatting with matches who aren't nearby.

All formats are big-endian. Code lives in `packages/protocol` and is shared by the app and the server.

## Keys

| Key | Type | Lifetime | Used for |
|---|---|---|---|
| Identity | X25519 | per install | end-to-end encryption with matches (`nacl.box.before` → shared key) |
| Recognition key | 16 random bytes | per install | lets your matches spot your rotating cards |
| Session | Ed25519 (→ X25519 via ed2curve) | 1 day | signs your card; encrypts likes and match handshakes with strangers |
| Server sign key | Ed25519 | server | signs nearby passes; public half shipped to phones |
| Server pass secret | 32 bytes | server | encrypts account ids inside passes |

Session id: `sid = SHA-512("sid" ‖ session pk)[0..8]`.

## Bluetooth GATT

Only the 128-bit service UUID is advertised (21 of 31 bytes). No name, no identifiers.

| Characteristic | UUID | Ops | Content |
|---|---|---|---|
| Service | `a9bea750-f935-4078-b5d8-95cba1596cd9` | advertised | |
| Card | `a9bea751-…` | read | signed card, ≤ 512 bytes (long reads by offset) |
| Inbox | `a9bea752-…` | write with response | envelope frames |
| Photo | `a9bea753-…` | write, read | write `u16 start`, then each read at offset 0 returns the next chunk |

Android central requests MTU 517; iOS negotiates its own (often 185). Writes are framed to fit.

### Card (v1)

```
u8   version = 1
u8   flags                bit0 photo, bit1 pass
32   session sign pk
8    recognition tag      SHA-512("rt" ‖ recKey ‖ sid)[0..8]
u8   age (years)
u8   gender | intent << 4
u32  vibes bitmask        (order of VIBES in profile.ts is part of the format)
s8   name                 ≤ 30 bytes UTF-8
s8   bio                  ≤ 140 bytes
b8   thumbhash            ≤ 40 bytes
[u16 photo length, 4-byte photo hash]   if photo
[92  nearby pass]                        if pass
64   Ed25519 signature over ("bls-card" ‖ everything above)
```
Worst case is 423 bytes; a typical verified card with a photo is about 290. "Show me" preferences, birthday and phone number are never on the card.

A match recognises you when `SHA-512("rt" ‖ yourRecKey ‖ card.sid)[0..8] == card.rtag`. To anyone without your recognition key the tag is random and changes daily.

### Nearby pass

```
u32  expiry (unix seconds)
24   secretbox(account id 8 bytes, nonce = SHA-512("pass-nonce" ‖ session pk)[0..24], server secret)
64   server Ed25519 signature over ("bls-pass" ‖ session pk ‖ expiry ‖ encrypted id)
```
Phones verify it offline ("Verified" badge). Only the server can open it, which is how a report about a stranger you met nearby reaches their account. Passes are fetched a few days ahead (`POST /v1/passes`), one per day.

### Envelopes (inbox)

`head = version << 4 | type`

| Type | Layout | Size |
|---|---|---|
| LIKE (1) | head ‖ sender session pk ‖ box(to sid 8, ts u32) | 85 |
| MATCH (2) | head ‖ sender session pk ‖ box(to sid 8, identity pk 32, recKey 16, account id 8, ts u32) | 141 |
| MSG (3) | head ‖ tag 8 ‖ secretbox(msg id 8, ts u32, kind u8, data) | 62 + text |
| UNMATCH (4) | head ‖ tag 8 ‖ secretbox(ts u32) | 53 |

`box` = X25519 + XSalsa20-Poly1305 with session keys (nonce ‖ ciphertext). `tag = SHA-512("mt" ‖ shared key ‖ nonce)[0..8]` lets the receiver find the match without a stable identifier on the air. Timestamps more than 12 hours off are rejected. Message kinds: 0 text (≤ 440 bytes), 1 keys (your recognition key, sent after an internet match).

Handshake: A likes B → LIKE. When a phone receives a LIKE from someone it already liked, it sends MATCH. A match is confirmed when you receive a valid MATCH from someone you liked; you reply with your own MATCH if you haven't yet. Both sides end up with each other's identity key and recognition key.

### Frames

```
u8 seq   u8 index   u8 count   payload
```
Envelopes are split to the link's write size (≥ 20 bytes) and reassembled per sender. Incomplete envelopes are dropped after 15 s.

### Photo chunks

Read returns `u16 index ‖ u16 count ‖ ≤ 480 bytes`. Photos over Bluetooth are the 320 px JPEG (~12–20 KB), checked against the 4-byte hash on the card.

## Internet API

MessagePack bodies (`content-type: application/msgpack`), bearer token auth.

| Endpoint | Body | Returns |
|---|---|---|
| `GET /v1/info` | | `{v, spk}` server pass key |
| `POST /v1/auth/start` | `{ph}` | `{ok, dev?}` (dev code only when `BLS_DEV=1`) |
| `POST /v1/auth/verify` | `{ph, code}` | `{tk, uid, spk}` |
| `POST /v1/sync` | `{c, ops[]}` | `{c, acks[], errs?, ch[], more?}` |
| `POST /v1/deck` | `{n?, la?, lo?, aw?}` | `{cards[]}` |
| `POST /v1/photo` | `{v: 's'|'f', img, th?}` | `{p}` photo key |
| `GET /p/:key/:v` | | JPEG, `cache-control: immutable` |
| `POST /v1/passes` | `{pks[]}` (≤ 7) | `{ps[]}` |

### Sync ops

Every op has a client `id`; the server applies each op at most once (`processed_ops`), so retries on flaky networks are safe.

| `k` | Fields | Effect |
|---|---|---|
| `me` | `n dob g sm amin amax i v b r li? pk` | profile + identity key (18+ enforced); `li` = where they live, ≤ 30 bytes |
| `loc` | `la lo aw?` | location, snapped to a 0.02° grid (~2 km); `aw: 1` = a city they chose to search, not where they are |
| `sw` | `to l` | swipe; mutual like creates a match |
| `nl` | `to` | "we matched over Bluetooth"; both claims create the online match |
| `msg` | `m b` | relay a sealed chat payload (server can't read it) |
| `um` | `m` | unmatch |
| `blk` | `to` | block (also closes any match) |
| `rep` | `to?` or `card?`, `r note? ev?` | report; a card's pass resolves the account |

### Changes

| `k` | Fields |
|---|---|
| `m` | `m src at u{id n a g i v b li th p ps pk}` new match |
| `x` | `m f b at` message (sealed) |
| `um` | `m` match closed |

### Deck and searching another city

`la lo` is either the phone's coarse location or the centre of a city picked from the app's built-in list, both rounded to the 2 km grid. `aw: 1` marks the second case. The server stores the point and the flag, then returns people within the searcher's radius who pass both sides' age and gender filters.

Each card is `{u n a g i v b li? th? p? ps? d aw?}`. `d` is a distance bucket ("Under 3 km") except for people browsing from elsewhere: their card says `d: "Not in town"` and `aw: 1`, so nobody looks closer than they are. `aw: 0` with no `la lo` means "back to near me, location unknown": the server clears the stored point, the person stops appearing in the other city, and their deck is empty until the phone sends a location.

## Measured sizes (server tests)

| What | Body bytes |
|---|---|
| Deck of 20 people | 3,420 |
| Empty sync | 14 |
| Sync carrying one message | 139 |

Add ~400 bytes of HTTP headers per request. TLS adds more on a cold connection, so the app batches: swipes wait a few seconds, everything else rides the next sync.
