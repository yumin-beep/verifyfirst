# Tools, sources and licenses

Checked 2026-10-10. The source package contains no model weights, scraped mailbox content, private contacts, external artwork, fonts or third-party source bundle.

| Component | Role and source |
|---|---|
| Python standard library | Local HTTP server, JSON validation, tests and hashing. No pip libraries. [Python documentation](https://docs.python.org/3/) |
| Browser HTML/CSS/JavaScript | DOM text rendering, Fetch, AbortController, local export and pagehide reset. No framework/CDN requirement. |
| shadcn/ui Mail example | The source-first interface references the split reading-area and inspector pattern in the [official v3 Mail example](https://v3.shadcn.com/examples/mail). The app uses newly authored HTML/CSS/JS, without copying template source, branding or assets. No shadcn/ui dependency is bundled. |
| Ollama | Existing locally installed inference runtime. [Source/license](https://github.com/ollama/ollama), [structured outputs](https://docs.ollama.com/capabilities/structured-outputs). Not bundled. |
| Google Gemma 4 | Actual evaluated tag `gemma4:e4b-it-qat`. The [exact Ollama tag](https://ollama.com/library/gemma4:e4b-it-qat) displays Apache License 2.0 and digest prefix `ee6656371218`. [Google's license](https://ai.google.dev/gemma/apache_2). Local metadata matched the full digest in the evaluation JSON. Weights are not included; this app's MIT license does not relicense them. |
| OpenAI Codex | Development assistance, distinct from the local runtime model; disclosed in `AI_CONTRIBUTION.md`. |
| Demo narration (separate media) | Existing local Supertonic F1 English narration, disclosed as AI-generated voice. Narration tooling/weights/audio and video are not app runtime dependencies and are not bundled in the lightweight source package. |
| Synthetic fixtures | Ten newly authored English development examples with fictional situations, reserved example domains or fictional handles; not collected from real victims and not an independent security dataset. |
| FTC Consumer Advice | Background principle: pause and use a contact route obtained outside the incoming message. [How To Avoid a Scam](https://consumer.ftc.gov/articles/how-avoid-scam). Fixed checklist text is a concise application-specific paraphrase, not an FTC service, endorsement or automated legal/financial judgment. |
| ForgeHacks | [Rules](https://forgehacks-2026.devpost.com/rules), [submission requirements](https://forgehacks-2026.devpost.com/), [public track prompts](https://www.forgehacks.dev/), [start announcement](https://forgehacks-2026.devpost.com/updates/46776-forgehacks-is-live-track-prompts-and-your-participant-packet). AI + Cybersecurity is the selected preparation track. |

The creator must comply with each external tool/model license when obtaining or distributing those components. No sponsor credit, paid API, external account creation or model download was performed to build the local prototype.
