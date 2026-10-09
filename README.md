# Claude on G2

An [Even Hub](https://www.evenrealities.com/) app for **Even Realities G2** smart glasses that works like Even AI: hold the temple, ask, let go. Answers come from either of these, and neither needs a paid API key:

- **The Claude iPhone app**, on your own Claude plan, through its built-in **Ask Claude** Shortcuts action.
- **[Groq](https://groq.com)'s free tier**, which is hands-free and works with the phone locked, but isn't Claude.

```
                        ┌─ no Groq key ─▶ upload ─▶ Shortcut: Transcribe Audio ─▶ Ask Claude ─┐
Hold the temple ─▶ G2 mic ─┤                                                                  ├─▶ ntfy.sh/<topic> ─▶ glasses
                        └─ Groq key ─▶ Groq Whisper ─┬─▶ Shortcut: Ask Claude ────────────────┘
                                                     └─▶ Groq chat (streams straight to the glasses)
"Hey Siri, Ask Claude on G2" ─▶ Dictate Text ─▶ Ask Claude ─▶ ntfy.sh/<topic> ─▶ glasses
```

|         | Claude app (Shortcut)                   | Groq answers                                   |
| ------- | --------------------------------------- | ---------------------------------------------- |
| Cost    | Your Claude plan (Free/Pro)             | Free tier (daily limits)                       |
| Phone   | Must be unlocked with the Even app open | Can stay locked in your pocket                 |
| Answers | Appear all at once                      | Stream in word by word, with follow-up context |
| Model   | Claude                                  | Groq's open models (e.g. `openai/gpt-oss-20b`) |

- **Voice in:** the **G2 microphone**: press and hold the temple like Even AI. Or use Siri dictation, the Action Button, Back Tap, or the home screen.
- **Claude in the middle:** the Claude app's [Ask Claude action](https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios) (iOS 18+), signed in to your account.
- **Answer out:** shown on the G2 display, with Markdown removed, word-wrapped using the firmware's own font metrics (`@evenrealities/pretext`), and split into pages.
- **No server of your own:** the Shortcut sends text to the app through a private [ntfy.sh](https://ntfy.sh) topic. Long answers (over 4 KB) also work, because ntfy stores them as an attachment and the app downloads it.

## Glasses controls

It works like **Even AI**: hold the temple, ask, let go.

| Gesture                   | Action                                                                  |
| ------------------------- | ----------------------------------------------------------------------- |
| Press and hold the temple | Listen while held. Let go to send.                                      |
| Double-tap                | Start listening hands-free. Tap, or pause for about 2 seconds, to send. |
| Tap / swipe forward       | Next page                                                               |
| Swipe back                | Previous page                                                           |
| Menu                      | Talk to Claude · First page · New chat                                  |

What you see, in order:

1. **Listening** with a timer and a live sound-level meter.
2. **Thinking...** (animated) while your iPhone transcribes and asks Claude.
3. Your question in the header.
4. The answer, in pages.

When you open the app from the **glasses menu**, it starts listening right away, the same way Even AI does. You can turn this off in Settings.

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

### 2. (Optional, recommended) Add a free Groq key

Create a free key at [console.groq.com](https://console.groq.com) and paste it under **Settings → Groq API key**. Then:

- Your question is transcribed with Groq's `whisper-large-v3-turbo` on the phone, and it shows on the glasses as soon as you let go. Recordings aren't uploaded anywhere else.
- Set **Answers from** to **Groq** for a fully hands-free assistant. Answers stream onto the glasses, follow-ups keep context, and the phone can stay locked.
- **Groq model** lists the chat models your key can use right now, because Groq retires models often.

The free tier has rate limits (roughly 20 transcriptions a minute and a few thousand requests a day; see Groq's rate-limit page). The key is kept in the Even app's storage on your phone and sent only to `api.groq.com`.

### 3. Build the iPhone Shortcuts

You need the **Claude** app from the App Store, signed in, on iOS 18 or later. The app's phone page shows your private address, `https://ntfy.sh/g2-claude-<random>`, with a **Copy** button, plus these same steps.

#### Talk from the glasses: "G2 Voice to Claude"

When you hold the temple (or double-tap), the app records from the G2 mic until you let go (or tap, or pause). It then opens this Shortcut. What it passes in depends on whether you've added a Groq key.

**With a Groq key (recommended).** The app transcribes your question with Groq and passes in the text:

1. Make a shortcut named exactly **G2 Voice to Claude**.
2. **Ask Claude** with **Shortcut Input** as the prompt. You can add "Answer briefly in plain text."
3. **Get Contents of URL**: your address, Method **POST**, Request Body **File** → _Response_.
4. _(Optional)_ **Open App** → **Even**.

**Without a Groq key.** The recording is uploaded as a WAV file to your private topic, and the Shortcut gets the file's URL:

1. Make a shortcut named exactly **G2 Voice to Claude** (you can change the name in the app's Settings).
2. **Get Contents of URL** with URL = **Shortcut Input**. This downloads the recording.
3. **Transcribe Audio** with **Contents of URL** as its input.
4. **Get Contents of URL**: your address, Method **POST**, header `Title` = `question`, Request Body **File** → _Transcription_.
5. **Ask Claude** with _Transcription_ as the prompt. You can add "Answer briefly in plain text."
6. **Get Contents of URL**: your address, Method **POST**, Request Body **File** → _Response_.
7. _(Optional)_ **Open App** → **Even**, to land back in the Even app.

> **Limits of this path.**
>
> - **This is the main difference from Even AI.** iOS only lets an app open a Shortcut while that app is on screen, so your iPhone must be unlocked with the Even app open. Going fully hands-free, with the phone in your pocket, would need the app to call Claude directly with an Anthropic API key. If the Shortcut doesn't start, the phone page shows a **Run Shortcut** button, and after 45 s the glasses tell you to use it.
> - Apple's _Transcribe Audio_ action (used only without a Groq key) has been reported to be unreliable on some iOS versions.
> - Without a Groq key, recordings are uploaded to your private topic on ntfy.sh (a separate `-mic` topic), which deletes attachments automatically after a few hours.

#### Ask with Siri: "Ask Claude on G2"

This path uses the iPhone mic. Try it with your iPhone locked: whether it runs without unlocking depends on the Claude app.

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

| `Title` header       | Effect                                                                  |
| -------------------- | ----------------------------------------------------------------------- |
| _(none)_ or `answer` | Show the text on the glasses (under the last question, if one was sent) |
| `question`           | Show the question in the header with "Asking Claude..."                 |
| `clear`              | Clear the glasses                                                       |

Any Shortcut can send text to your glasses this way, not only Claude.

> **Keep the address private.** Anyone who has it can put text on your glasses. Tap **New** next to _Private topic_ to rotate it, then update the URL in your Shortcut. You can also [self-host ntfy](https://docs.ntfy.sh/install/), set its URL under _ntfy server_, and add that host to the `network` whitelist in `app.json`.

## Development

```bash
npm run dev        # phone UI in a browser (the glasses show "browser preview")
npm test           # unit tests: pagination, inbox parsing, recorder/WAV, Groq errors, glasses paging/gestures
npm run typecheck
npm run build
```

| File              | Purpose                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `src/main.ts`     | Boot, phone UI, routing Shortcut messages to the glasses         |
| `src/glasses.ts`  | G2 page layout (header + body), paging, gestures, menu           |
| `src/inbox.ts`    | ntfy.sh subscription, recording upload, Shortcut links           |
| `src/recorder.ts` | G2 mic recording, end-of-speech detection, WAV encoding          |
| `src/groq.ts`     | Groq Whisper transcription, streaming chat, model list           |
| `src/paginate.ts` | Markdown stripping, pixel-accurate wrapping and paging           |
| `src/settings.ts` | Settings persisted in Even app storage                           |
| `app.json`        | Even Hub manifest (network whitelist: `ntfy.sh`, `api.groq.com`) |

To build with a different default ntfy server (for example a self-hosted one), set `VITE_NTFY_SERVER=https://ntfy.example.com` when you run `npm run build`.

### Testing in the Even Hub simulator

The [official simulator](https://www.npmjs.com/package/@evenrealities/evenhub-simulator) runs the whole app, including the G2 mic. It has an automation API (`--automation-port`) for sending taps and taking screenshots of the glasses. The hold → record → answer loops (Shortcut upload, Groq transcription + Shortcut, and Groq streaming answers with follow-ups) were tested this way with local stand-ins for ntfy and Groq. Pace any fake microphone in real time (for example a PulseAudio null sink): an unclocked audio source floods the webview with frames.

## Notes and limits

- The app must be open on the glasses to receive messages. The Even app keeps it alive in the background.
- Claude answers appear in full once the Claude app finishes, because Shortcuts can't stream partial text. Groq answers stream.
- Groq's free models aren't Claude, and Groq's free-tier limits and model line-up can change.
- How the Ask Claude action behaves (for example whether it opens the Claude app) is controlled by the Claude app and iOS.
