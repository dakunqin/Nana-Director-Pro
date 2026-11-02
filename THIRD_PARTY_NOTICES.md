# Third-party software and models

The project's MIT license applies only to its own code. This is an independent project, not an official release by upstream authors.

## Nana workflow

`server/workflow.mjs` adapts the standard H3 graph from `server.mjs` at upstream commit `9c022d3006047571439f89c0cba4edc19a784ea1`.

- Source: https://github.com/nawusijia/Nana_Animation_auto
- Copyright (c) 2026 Indimor / 娜乌斯嘉
- License: MIT; complete text in `vendor/nana/LICENSE`.
- Changes: separate pure graph builder, user seed, reference binding, conservative base pipeline; optional Sage attention patch omitted to avoid requiring an unverified compiled backend.

## Desktop dependencies

- React / React DOM: MIT, https://github.com/facebook/react
- Electron: MIT plus Chromium and other component licenses distributed with Electron. Preserve `LICENSE.electron.txt` and `LICENSES.chromium.html` in binary distributions. https://github.com/electron/electron
- Lucide: ISC, https://github.com/lucide-icons/lucide
- 7zip-bin: MIT package; bundled 7-Zip executable has its own LGPL/BSD/unRAR terms. Preserve upstream license files. https://github.com/develar/7zip-bin and https://www.7-zip.org/license.txt
- ffmpeg-static: GPL-3.0-or-later package and separate FFmpeg executable. https://github.com/eugeneware/ffmpeg-static

FFmpeg is invoked as a separate process, not linked into the application's own code. The Windows executable reports FFmpeg 6.1.1 from gyan.dev with GPL/version3 enabled; its configuration is available via `ffmpeg -version`. For a public binary distribution, provide the corresponding FFmpeg source and applicable third-party sources/configuration as required, alongside license notices. FFmpeg 6.1.1 source: https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz ; build provenance: https://github.com/eugeneware/ffmpeg-static/releases . Do not describe bundled binaries as MIT-only. The binary build pipeline records tool versions; releases remain previews until licensing materials and validation are complete.

## Downloaded separately; not in the repository or app package

| Component | License / source |
| --- | --- |
| ComfyUI | GPL-3.0, https://github.com/Comfy-Org/ComfyUI |
| Ollama | MIT, https://github.com/ollama/ollama |
| Qwen3 models | Model card and Apache-2.0 terms at https://ollama.com/library/qwen3 and https://huggingface.co/Qwen |
| MiniMax H3 | MiniMax H3 Community License, https://huggingface.co/Comfy-Org/MiniMax-H3 |
| T8 Turbo converted LoRA | Its model card/license, https://huggingface.co/t8star/minimax_h3_fl2v_turbo_4step_v0.1_comfyui_alpha8-T8-convert |
| T8 audio nodes | Repository license, https://github.com/T8mars/comfyui-minimax-h3-audio-T8 |
| Video Helper Suite | Repository license, https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite |
| Comfyroll | Repository license, https://github.com/Suzie1/ComfyUI_Comfyroll_CustomNodes |

Exact revisions, original download URLs, sizes and SHA256 values are recorded in `resources/catalog.json`. Installation leaves upstream license files in downloaded environments. This application does not bypass gated model access or accept model terms on the user's behalf.

- OpenCC-JS: local Simplified/Traditional Chinese conversion, MIT; bundled dictionary notices in vendor/opencc/THIRD_PARTY_LICENSES.md. https://github.com/nk2028/opencc-js
- Babel parser is a development-only dependency used for UI text preparation; it is not required by the running desktop service.

Full license texts for bundled frontend dependencies are retained in `vendor/runtime-licenses`, even when their redundant runtime node_modules directories are removed from the Windows application.
