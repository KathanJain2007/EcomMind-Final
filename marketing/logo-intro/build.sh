#!/bin/zsh
# Renders the intro end to end: frames (Chrome) + audio (numpy) -> src/assets/intro/*.mp4 (AVFoundation).
# Needs macOS, Google Chrome, Node 22+, and python3 with numpy. To swap the logo, edit LOGO in scene.html.
set -euo pipefail
here=${0:A:h}
out="$here/../../src/assets/intro"
work=${WORK_DIR:-$(mktemp -d)}
mkdir -p "$work/frames-portrait" "$work/frames-landscape" "$out"

node "$here/render.mjs" "$work/frames-portrait" --fps 60
node "$here/render.mjs" "$work/frames-landscape" --landscape --fps 60
python3 "$here/audio.py" "$work/audio.wav"
afconvert -f m4af -d aac -b 192000 -s 3 "$work/audio.wav" "$work/audio.m4a"
swiftc -swift-version 5 -suppress-warnings -O "$here/encode.swift" -o "$work/encode"
"$work/encode" "$work/frames-portrait" 60 "$work/audio.m4a" "$out/ecommind-intro-portrait.mp4" 1080 1920
"$work/encode" "$work/frames-landscape" 60 "$work/audio.m4a" "$out/ecommind-intro-landscape.mp4" 1920 1080
