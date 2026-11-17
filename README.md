# Bluesight

A dating app for the diaspora, built for places where mobile data is expensive. Meet people near you, or set your search to a city back home and start matching before you land.

When people are close by (a party, church, campus, a market, a club), phones find each other over **Bluetooth**: swipe, match and chat without using any data. The internet is optional. It's used to browse people around town or in another city, and to keep chatting with matches from anywhere. Even then everything travels in one small batched request.

```
 Nearby (Bluetooth, free)                  Around, here or back home (internet, metered)
 ┌──────────┐  card · like · match · chat  ┌──────────┐      one POST /v1/sync
 │  phone A │ ◀──────────────────────────▶ │  phone B │ ───▶ { your changes, their changes }
 └──────────┘      ~30 m, no internet       └──────────┘      ~0.4 KB when nothing's new
```

## What uses data, and how much

| Action | Road | Cost |
|---|---|---|
| Seeing everyone nearby, their cards and photos | Bluetooth | 0 |
| Liking, matching, chatting with someone nearby | Bluetooth | 0 |
| A deck of 20 people around town, or in a city you picked | internet | ~3.8 KB |
| Picking a city to search | on the phone | 0 (the city list is built in) |
| Their photo, only when you tap it (Lite mode) | internet | ~12–20 KB |
| A message to a match who isn't nearby | internet | ~0.1 KB + one sync |
| Checking for news when nothing's new | internet | ~0.4 KB |

Numbers come from the server tests (`npm test`). The app shows a live data receipt under **Me**, with a monthly limit. Three modes:

- **Zero**: Bluetooth only. Nothing touches mobile data.
- **Lite** (default): syncs a few times an hour and right after you send a message. Photos load when you tap.
- **Full**: syncs every couple of minutes and loads photos automatically. The 800 px photo upload always waits for Wi-Fi.

## Search back home

Most people on Bluesight have two places: where they live now and where home is. Under **Around → Change** (or **Me → Search location**) you pick **Near me** or any city from a built-in list of African, Caribbean and diaspora cities. The list ships with the app, so choosing one costs no data and needs no map service.

- The deck then comes from that city's centre, rounded to the same 2 km grid as any location.
- People there see you as **Not in town**, never a distance, plus **Lives in Maryland, USA** if you've filled that in. No one is misled about how close you are.
- Switching back to **Near me** stops showing you in that city. If your phone can't share a location yet, you simply see no one until it can.
- Matches made this way chat over the internet as usual, and when you land and they're near you, the same match carries on over Bluetooth for free.

## Repo

```
packages/protocol   shared wire formats + crypto (cards, envelopes, passes, frames)  ← tested
server/             Node 22 + Fastify + SQLite, MessagePack API                     ← tested
mobile/             Expo (React Native) app for Android, iOS and a web preview
mobile/modules/nearby-ble   native Bluetooth peripheral (Kotlin + Swift)
docs/PROTOCOL.md    byte-level spec of everything above
.github/workflows/android-apk.yml   builds an installable APK on GitHub
```

## Run it

Needs Node 22+.

```bash
npm install
npm test                 # protocol + server tests
```

### Server

```bash
BLS_DEV=1 npm run server      # http://localhost:8080, SMS codes printed to the log and returned to the app
```

Production, on any small VPS:

```bash
DATA_DIR=/var/lib/bluesight PORT=8080 \
SMS_WEBHOOK_URL=https://your-sms-adapter/send SMS_WEBHOOK_TOKEN=… \
npm run server:start
```

- `DATA_DIR` holds `bluesight.db` (SQLite), `photos/` and `server-keys.json`. **Back up `server-keys.json`**: it signs the nearby passes every phone checks.
- SMS goes out as `POST {to, text}` to `SMS_WEBHOOK_URL`; point it at a small adapter for whichever local gateway is cheapest.
- Put it behind Caddy or nginx for HTTPS, with compression on. Use an ECDSA certificate (Let's Encrypt's default with Caddy): the TLS handshake is the biggest hidden data cost on a fresh connection.

```
api.example.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8080
}
```

### App

```bash
cd mobile
npx expo start --web                      # web preview: simulated people nearby + built-in demo server (try Around → Change)
EXPO_PUBLIC_API_URL=https://api.example.com npx expo run:android   # real Bluetooth on a phone
```

Bluetooth needs a **development or release build**; it doesn't work in Expo Go. To try Nearby with one phone, turn on **Me → Practice mode**, which adds simulated people next to real ones.

| Variable | Meaning |
|---|---|
| `EXPO_PUBLIC_API_URL` | your server. Without it the app runs Bluetooth-only (no accounts, no Around) |
| `EXPO_PUBLIC_DEMO=1` | use the in-app demo server and simulated people nearby (default for web builds without an API URL) |

### Install on an Android phone without a computer

Push this repo to GitHub, then open **Actions → Android APK → Run workflow**. When it finishes, the APK is attached to the **latest-apk** release; open that page on the phone and install it. Set a repository variable `EXPO_PUBLIC_API_URL` to point the build at your server. The APK is signed with a debug key, which is fine for testing; for the Play Store, create an upload key or use EAS Build.

## How Nearby works

1. Each phone advertises one Bluetooth service UUID, nothing else.
2. Phones that see it connect and read the **card**: name, age, vibes, bio, a 25-byte colour preview (thumbhash) and a signature. Then they pull the 12–20 KB photo in chunks.
3. A like is a small encrypted envelope written into the other phone's inbox. When both have liked, they swap long-term keys and it's a match.
4. Chat messages are sealed once with the match's shared key. If the match is in range they go over Bluetooth; otherwise they ride the next sync. The server only ever relays ciphertext.

Full details in [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Privacy and safety

- **Who you want to see stays on your phone.** Filtering happens on each phone, so orientation is never broadcast. That matters in places where it can put people at risk.
- **Bluetooth identity rotates daily.** A match can still recognise you (recognition key); a stranger's scanner sees a new ID each day. Turn off **Visible** and nothing is sent at all.
- **Verified cards without exposing identity.** A card can carry a server-signed pass. Phones verify it offline; only the server can open it. So a report about a stranger you met nearby still reaches their account.
- **18+ enforced** on the phone and on the server.
- **Location is rounded to ~2 km** on the phone before it's sent, and again on the server. Distances are shown as buckets ("Under 3 km"). Someone browsing from another city shows as "Not in town".
- **Photos are re-encoded on the phone** (drops EXIF/GPS), and the server strips any metadata segments again.
- Block, report and unmatch work offline and sync later. Three reports from different people hide an account until someone reviews it.

## Status

Working and tested:

- `packages/protocol`: 13 tests (cards, tamper detection, passes, handshake, message routing across 50 matches, framing at 20-byte MTUs, photo chunks, UTF-8 edge cases).
- `server`: 8 integration tests (auth lockout, 18+, two-sided preferences, mutual-like matches, encrypted relay, retry safety, Bluetooth match linking, pass-based reports, EXIF stripping, payload sizes, searching a city back home).
- `mobile`: type-checks; the web build was driven end to end in a headless browser: onboarding, discovery, like, match, Bluetooth chat with replies, phone verification, Around deck, switching the search to another city, photo-on-tap, data receipt.

Not yet run on hardware:

- The native Bluetooth module (`mobile/modules/nearby-ble`) is written against the Android and iOS APIs and is picked up by Expo autolinking and prebuild, but hasn't been compiled or tested on phones yet. Test with two Android phones first. Most people in the target markets use Android, and Android can advertise more reliably.
- iOS only advertises while the app is open (Apple's rule). Nearby is built for the app being open while you're out; Android background mode (a foreground service) is on the roadmap.

## Roadmap

- Trip dates on your card ("Home Dec 18 to Jan 6") so people back home know when you land
- More cities, plus search by region for smaller towns

- Android foreground service so you stay visible with the phone in your pocket
- Push notifications (FCM data messages) to replace timed syncs
- Relay over Bluetooth (phones pass cards along) to cover a whole venue
- Venue check-ins and events
- Moderation console for reports
- Safety-number check between matches
