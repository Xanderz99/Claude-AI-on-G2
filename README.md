# Claude on G2

An [Even Hub](https://www.evenrealities.com/) app that puts answers from the **Claude iPhone app** onto **Even Realities G2** smart glasses, using **Shortcuts / Siri**. You don't need an API key: answers come from your own Claude account through the Claude app's built-in **Ask Claude** Shortcuts action.

```
"Hey Siri, Ask Claude on G2"
        │
        ▼
 iPhone Shortcut ── Ask Claude (Claude app) ── POST answer to ntfy.sh/<topic> ──▶ this Even Hub app ──▶ G2 glasses
```

- **Voice in:** Siri dictation, the Action Button, Back Tap, or the home screen.
- **Claude in the middle:** the Claude app's [Ask Claude action](https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios) (iOS 18+), signed in to your account.
- **Answer out:** shown on the G2 display, with Markdown removed, word-wrapped using the firmware's own font metrics (`@evenrealities/pretext`), and split into pages.
- **No server of your own:** the Shortcut sends text to the app through a private [ntfy.sh](https://ntfy.sh) topic. Long answers (over 4 KB) also work, because ntfy stores them as an attachment and the app downloads it.

## Glasses controls

| Gesture | Action |
| --- | --- |
| Tap / swipe forward | Next page |
| Swipe back | Previous page |
| Double-tap | Clear |
| Long-press (menu) | First page · Clear |

The header shows your question (if the Shortcut sent it), a `thinking` status while Claude works, and the page number (`2/3`).

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

### 2. Build the iPhone Shortcut

You need the **Claude** app from the App Store, signed in, on iOS 18 or later. The app's phone page shows your private address, `https://ntfy.sh/g2-claude-<random>`, with a **Copy** button.

1. Open **Shortcuts**, tap **+**, and name the shortcut **Ask Claude on G2**. A different name from Claude's own "Ask Claude" keeps Siri from mixing them up.
2. Add **Dictate Text** (or **Ask for Input** to type).
3. _(Optional: shows your question on the glasses while Claude thinks.)_ Add **Get Contents of URL**:
   - URL: your address
   - Method: **POST**
   - Headers: `Title` = `question`
   - Request Body: **File** → _Dictated Text_
4. Add the Claude app's **Ask Claude** action, with _Dictated Text_ as the prompt. Adding "Answer briefly in plain text." gives answers that fit the small display.
5. Add **Get Contents of URL** again:
   - URL: your address
   - Method: **POST**
   - Request Body: **File** → _Response_ (the output of Ask Claude)
6. With the app open on your glasses, say **"Hey Siri, Ask Claude on G2"**, or put the shortcut on the Action Button or Back Tap.

Press **Send test message** on the app's phone page to check the connection before you build the Shortcut.

#### What the app does with each message

| `Title` header | Effect |
| --- | --- |
| _(none)_ or `answer` | Show the text on the glasses (under the last question, if one was sent) |
| `question` | Show the question in the header with "Asking Claude..." |
| `clear` | Clear the glasses |

Any Shortcut can send text to your glasses this way, not only Claude.

> **Keep the address private.** Anyone who has it can put text on your glasses. Tap **New** next to _Private topic_ to rotate it, then update the URL in your Shortcut. You can also [self-host ntfy](https://docs.ntfy.sh/install/), set its URL under _ntfy server_, and add that host to the `network` whitelist in `app.json`.

## Development

```bash
npm run dev        # phone UI in a browser (the glasses show "browser preview")
npm test           # unit tests: pagination, inbox parsing, glasses paging/gestures
npm run typecheck
npm run build
```

| File | Purpose |
| --- | --- |
| `src/main.ts` | Boot, phone UI, routing Shortcut messages to the glasses |
| `src/glasses.ts` | G2 page layout (header + body), paging, gestures, menu |
| `src/inbox.ts` | ntfy.sh subscription that receives Shortcut messages |
| `src/paginate.ts` | Markdown stripping, pixel-accurate wrapping and paging |
| `src/settings.ts` | Settings persisted in Even app storage |
| `app.json` | Even Hub manifest (network whitelist: `ntfy.sh`) |

## Notes and limits

- The app must be open on the glasses to receive messages. The Even app keeps it alive in the background.
- Answers appear in full once the Claude app finishes. Shortcuts can't stream partial text.
- How the Ask Claude action behaves (for example whether it opens the Claude app) is controlled by the Claude app and iOS.
