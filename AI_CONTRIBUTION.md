# AI contribution disclosure

New preparation work began 2026-10-10 KST, during the ForgeHacks event window.

OpenAI Codex assisted with the project concept and scope, full initial backend/domain/UI implementation, synthetic examples, tests, actual test execution, documentation, official-rule research and code review. A separate Codex agent authored the deterministic domain tests and ten synthetic fixtures; that is an additional automated review, not an independent human study. The participant has not been represented as manually typing this code or already understanding every implementation detail.

The product's runtime AI is the already installed **Gemma 4 `gemma4:e4b-it-qat` via local Ollama**. It extracts candidate claims, requested actions and contact details from input. Deterministic application code validates exact source quotes, applies allowlisted categories and builds fixed independent-verification checks. The model cannot mark those checks confirmed.

The ten evaluation inputs and expected action types were written before the recorded run. They are synthetic development examples selected by the developers. No real messages, victim interviews, observed financial loss, customer adoption or measured prevention benefit are claimed. The 9/10 exact request-set result and the one unmatched case are retained without relabelling the expected answer after execution.

The application was implemented in a new directory. Existing Python/Ollama/model installations and prior familiarity with source-grounded local tools were used; no earlier competition application's source files were copied into this codebase. Common techniques such as HTTP serving, JSON schemas and source quotation validation are not claimed as original research.

Codex also assisted with the later source-first interface, the user-selected pink/yellow palette application, actual browser operation with synthetic inputs, English demo writing, crop selection, video assembly and technical media checks. The 120.333-second demo uses actual screenshots and AI-generated English Supertonic F1 narration; it is explicitly labelled as an edited demonstration. Those agent-operated UI checks do not establish participant comprehension or participant-authored manual coding.

Current actual UI observations are recorded in `evidence/pink-yellow-video/capture-provenance.json`. Final participant review, code publication and final submission status must still be recorded separately when actually performed. Automated test success does not establish participant comprehension, a safe sender, or accepted competition submission.
