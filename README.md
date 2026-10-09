# Claude on G2

An [Even Hub](https://www.evenrealities.com/) app that shows Claude on **Even Realities G2** smart glasses. You ask from your iPhone with **Shortcuts / Siri**, and the answer streams onto the glasses display.

```
"Hey Siri, Ask Claude"          iPhone Shortcut                  Even app (this Even Hub app)      G2 glasses
  dictate question  ──────▶  POST text to ntfy.sh/<topic>  ──▶  receives it over SSE,       ──▶  answer streams in,
                                                                 streams answer from Claude        paged to fit the HUD
```

- **Voice in:** iPhone Shortcut with Siri dictation, the Action Button, Back Tap, or the home screen.
- **Answer out:** streamed onto the G2 HUD, word-wrapped with the firmware's own font metrics (`@evenrealities/pretext`) and split into pages.
- **Follow-ups:** recent questions are sent along, so "and in Celsius?" works. Double-tap for a new chat.
- **No server of your own:** the Shortcut and the app talk through a private [ntfy.sh](https://ntfy.sh) topic. The app calls the Claude API directly with your own API key.

## Glasses controls

| Gesture | Action |
| --- | --- |
| Tap / swipe forward | Next page |
| Swipe back | Previous page |
| Double-tap | New chat |
| Long-press (menu) | New chat · Ask again · Stop answer |

The header shows the question, a status (`thinking`, `...` while streaming), and the page number (`2/3`).

## Setup

### 1. Install the app on your phone

Requirements: Even app **2.2.10+**, Node.js 20 or 22+.

```bash
npm install
npm run dev        # Vite dev server on your LAN
npm run qr         # QR code for dev mode; scan it in the Even app
```

To install it permanently, build a package and upload it on the Even Hub developer site:

```bash
npm run pack       # -> claude-on-g2.ehpk
```

Before you publish, change `package_id` in `app.json` to an ID you own.

### 2. Add your API key

Open the app's phone page in the Even app. Under **Settings**, paste an Anthropic API key (create one at [console.anthropic.com](https://console.anthropic.com)). You can also pick:

- **Model:** Claude Opus 5.5 (default), Sonnet 5.5, or Haiku 5.5 (fastest)
- **Effort:** `low` is the default because it gives quick replies on the go
- **Follow-up memory:** how many past Q&A pairs to send with each question
- **Instructions for Claude:** the system prompt (by default: short plain-text answers sized for the HUD)

The key is kept only in the Even app's storage on your phone and is sent only to `api.anthropic.com`.

### 3. Build the iPhone Shortcut

The app's phone page shows your personal Shortcut URL, `https://ntfy.sh/g2-claude-<random>`, with a **Copy** button.

1. Open **Shortcuts**, tap **+**, and name the shortcut **Ask Claude**.
2. Add **Dictate Text** (or **Ask for Input** to type).
3. Add **Get Contents of URL**:
   - URL: your Shortcut URL
   - Method: **POST**
   - Request Body: **File** → the _Dictated Text_ variable
4. _(Optional)_ Add a header `Title`:
   - `new`: start a fresh conversation for this question
   - `show`: show the text on the glasses as-is, with no Claude call. Use this if you already have a Shortcut that gets text from somewhere else (for example the Claude iOS app's own Shortcuts action) and just want to read the result on the glasses.
5. Say **"Hey Siri, Ask Claude"**, or put the shortcut on the Action Button or Back Tap.

Press **Send test message** in the app to check the connection without building the Shortcut first.

> **Keep the topic private.** Anyone who knows it can send questions to your glasses, and those questions use your API key. Tap **New** next to _Shortcut topic_ to rotate it, then update the URL in your Shortcut. For more control you can [self-host ntfy](https://docs.ntfy.sh/install/), set its URL under _ntfy server_, and add that host to the `network` whitelist in `app.json`.

## Development

```bash
npm run dev        # phone UI in a browser (the glasses show "browser preview")
npm test           # unit tests: pagination, inbox parsing, glasses paging/gestures
npm run typecheck
npm run build
```

| File | Purpose |
| --- | --- |
| `src/main.ts` | Boot, phone UI, ask flow |
| `src/glasses.ts` | G2 page layout (header + body), paging, gestures, menu |
| `src/claude.ts` | Streaming Claude API calls with conversation history |
| `src/inbox.ts` | ntfy.sh subscription that receives Shortcut messages |
| `src/paginate.ts` | Markdown stripping, pixel-accurate wrapping and paging |
| `src/settings.ts` | Settings persisted in Even app storage |
| `app.json` | Even Hub manifest (network whitelist: `api.anthropic.com`, `ntfy.sh`) |

## Notes and limits

- The app must be open on the glasses to receive Shortcut messages. The Even app keeps it alive in the background.
- ntfy.sh messages are limited to 4 KB. That is plenty for questions, but very long `show` texts may be cut off.
- API usage is billed to your Anthropic account.
