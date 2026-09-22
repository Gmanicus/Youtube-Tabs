#!/usr/bin/env bash
set -euo pipefail

output="${1:-Youtube-Tabs.zip}"
files=(
    manifest.json
    icon.png
    iro.min.js
    blob-service.js
    tabs.css
    youtube-tabs.js
    help.html
)

for file in "${files[@]}"; do
    if [[ ! -f "$file" ]]; then
        printf 'Missing required file: %s\n' "$file" >&2
        exit 1
    fi
done

node -e 'JSON.parse(require("fs").readFileSync("manifest.json"));' 
mkdir -p "$(dirname "$output")"
rm -f "$output"
zip -q "$output" "${files[@]}"

printf 'Created %s with:\n' "$output"
zipinfo -1 "$output"
