# Livestreaming

Open standards in, adaptive HLS out. What runs where, and why.

**Control plane:** [`stream-control.service.ts`](../../src/infrastructure/services/social/stream-control.service.ts)
· **HTTP:** [`stream.endpoint.ts`](../../src/features/community/stream.endpoint.ts)

---

## Topology

```
  OBS / ffmpeg / phone            MediaMTX (MIT)                    viewer
 ┌──────────────────┐          ┌──────────────────┐          ┌────────────────┐
 │ RTMP :1935       │────────▶ │                  │ ───────▶ │ LL-HLS (hls.js)│
 │ SRT  :8890       │────────▶ │  ingest ▸ ffmpeg │ ───────▶ │ HLS  (Safari)  │
 │ WHIP (WebRTC)    │────────▶ │  ▸ package       │ ───────▶ │ WHEP (WebRTC)  │
 └──────────────────┘          └────────┬─────────┘          └────────────────┘
                                        │ HTTP hooks
                                        ▼
                               ┌──────────────────┐
                               │  Gaddr backend   │  authorise · start · end
                               │  (control plane) │  keys · settings · chat
                               └──────────────────┘
```

**Media never passes through the Node process.** It could not: 512 MB of RAM
and 0.1 vCPU is not a transcoder. MediaMTX handles ingest and packaging;
ffmpeg, which it invokes, handles the transcode ladder.

## Why MediaMTX

MIT licensed, a single static binary, no runtime dependencies, and it speaks
every ingest protocol we want plus every playback protocol we want. The
alternatives each fail one of those: nginx-rtmp is RTMP-only and unmaintained,
Ant Media's useful half is commercial, and rolling our own means implementing
LL-HLS partial segments.

**Nothing here is MediaMTX-specific except the URLs**, which come from config.
The integration surface is three HTTP callbacks. Any compliant server works.

## Ingest

| Protocol | Port | Use |
|---|---|---|
| RTMP | 1935 | OBS, Streamlabs, everything. The safe default. |
| SRT | 8890 | Lossy networks — recovers where RTMP stalls. Broadcast hardware. |
| WHIP | 443 | Browser and phone, sub-second, no plugin. |

All three are open standards. There is no proprietary ingest, and no path that
requires our own encoder.

## Playback

LL-HLS by default with plain HLS as the fallback, plus WHEP for sub-second
where latency matters more than reach.

Client side: Safari plays `.m3u8` natively; everywhere else needs Media Source
Extensions, which `hls.js` (Apache-2.0) provides. It is **lazily imported**, so
its ~150 kB does not land on pages that merely link to a stream.

## Transcode ladder

Three renditions plus passthrough — 1080p60 / 720p / 480p. That covers desktop,
mobile on wifi, and mobile on cellular, which is the distribution that actually
exists. More rungs cost CPU per concurrent stream for diminishing benefit.

Bitrates follow the H.264 recommendations the major platforms publish. Live
encodes with `-preset veryfast -tune zerolatency`: roughly 10% worse bitrate
efficiency, in exchange for the latency LL-HLS needs.

Editable per channel via `PATCH /community/stream/settings`.

## Authorisation

MediaMTX calls `POST /community/stream/hooks/authorise` before accepting a
publisher. That callback is **the only thing between an open ingest port and
anyone broadcasting on anyone's channel**, so:

- it **fails closed** on every unexpected condition, including an exception;
- the shared secret is compared in **constant time** — a plain `!==` leaks it a
  byte at a time to anyone who can measure the response, and the media server
  is reachable from the network;
- the ingest key is stored **encrypted** (AES-256-GCM via `cryptoUtils`) and
  compared after decryption;
- the protocol is checked against the channel's `allowedIngest`.

Keys are long-lived, so OBS keeps working between streams, and rotatable
without losing the channel or its URL.

## One-click OBS

`obsDeepLink` is an `obs://addservice?...` URL that pre-fills the custom-service
fields. Where the handler is not registered — it is not on every install — the
UI falls back to copy-and-paste, which is **always visible**, never behind a
disclosure. The deep link is an accelerator, not the only route.

The stream key is masked until explicitly revealed. A key on screen during a
stream is how channels get hijacked live, on camera.

## Simulcast

Per-channel targets, each with an ingest URL and a key, encrypted at rest.

Two read paths, deliberately named differently: `listTargetsAsync` never
returns keys (there is no legitimate reason to read one back, and every reason
not to log it), while `getRestreamTargetsAsync` decrypts them for the
restreamer process only. Splitting them means an endpoint that meant to list
targets for the UI cannot accidentally reach the decrypting one.

## Lifecycle

`started` creates a `StreamSession` and emits an event; the listener publishes a
`live` post so a broadcast appears in the feed rather than only on a page nobody
visits. `ended` closes the session and **archives that post** — leaving a "live
now" card up after the broadcast ends is the single most annoying thing a
streaming feature does.

VOD and clips are queued ffmpeg jobs. Cutting 120 seconds out of a six-hour VOD
is not something to do inside a request.

## Chat

Persisted rather than fire-and-forget, so moderation has evidence, late joiners
get scrollback, and the VOD can replay the conversation in sync via
`offsetSeconds`.

Moderation checks run cheapest-first: is chat on, is the sender sanctioned, does
the channel require a follow, does the message contain a blocked term. A banned
user costs one query, not four. Expired timeouts are excluded by the query
itself, so an expired sanction cannot keep someone muted through a caller
forgetting to check.

## Configuration

All optional. A deployment with no media server still serves the feed, and the
UI reports streaming as unconfigured rather than handing out URLs that point
nowhere.

| Variable | Purpose |
|---|---|
| `MEDIA_SERVER_HOST` | Ingest hostname |
| `MEDIA_SERVER_RTMP_PORT` | Default 1935 |
| `MEDIA_SERVER_SRT_PORT` | Default 8890 |
| `MEDIA_SERVER_PLAYBACK_BASE_URL` | Public HTTPS base for HLS/LL-HLS/WHEP |
| `MEDIA_SERVER_WEBHOOK_SECRET` | Shared secret for the three callbacks |

## What competitors do that we deliberately do not

Researched before building; recorded so the choices are revisitable.

- **Kick** halves a partner's payout for every hour they simulcast elsewhere.
  We do not penalise simulcast. A creator's audience is theirs.
- **Twitch** ranks its directory by concurrent viewers, which is a
  rich-get-richer loop. Ours goes through the same recommender as the feed, so
  a small channel on a matching topic can surface.
- **YouTube** turns a stream into an indexed VOD the moment it ends — the one
  thing worth copying outright, and why `recordVod` defaults on and a clip
  becomes a normal post.
