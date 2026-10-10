# Source release contents

This release contains the current pink-and-yellow source-first interface and its unchanged local Python backend. The source repository is https://github.com/yumin-beep/verifyfirst . The root task confirmed public source commit `2077ca9` and the public English demo at https://youtu.be/xwB8xJeShIw . This does not establish final competition acceptance.

## Version and evidence boundaries

- 29 recorded backend tests: historical execution, with hashes matching this backend and test source. HTTP tests use a mocked model.
- 10 authored English model cases: actual local Gemma 4 run; nine exact request-kind sets, one retained mismatch. This is not general fraud-detection accuracy.
- 21 historical browser checks: earlier interface only, with intercepted synthetic AI/check responses. The report is retained, not rerun or relabelled as current UI coverage. Older DOM-specific scripts and screenshots are excluded.
- Current UI: actual browser observations with live local model extraction and synthetic text, separately recorded in capture-provenance.json. No real identity check occurred. Export request was observed; downloaded file receipt was not verified.
- Final narrated video: 120.333 seconds, 21 edited cuts from 12 actual screenshots, English captions and local AI-generated F1 narration. The large video and media runtime are excluded; its hash and measured validation summary are in evidence/current-release.json.

## Included images

Exactly two actual screenshots are included, without recolouring, redrawing or cropping in this source package:

- screenshots/message-review.jpg is the unchanged latest 04-request.jpg capture.
- screenshots/record.jpg is the unchanged latest 08-record.jpg capture.

Other screenshot names in capture logs identify original local evidence and hashes; their binary images are intentionally not included.

## Exclusions and integrity

No model weights, local runtime, virtual environment, browser profile, caches, audio files, video files, absolute home paths, account credentials or private messages are included. Synthetic example contacts and the MIT author's requested attribution are retained. SOURCE_HASHES.json maps only relative release paths to source hashes. SHA256SUMS.txt covers all other files in this directory. The application and test source bytes were copied without modification. Public publication and competition submission remain separate actions.
