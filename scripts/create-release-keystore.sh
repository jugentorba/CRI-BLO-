#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-release-signing}"
mkdir -p "$OUT_DIR"

if ! command -v keytool >/dev/null 2>&1; then
  echo "keytool not found. Install a JDK first." >&2
  exit 1
fi

PASSWORD="$(openssl rand -base64 36 | tr -d '\n/=+' | cut -c1-32)"
KEYSTORE="$OUT_DIR/CRI-BLO-release.jks"

keytool -genkeypair \
  -v \
  -keystore "$KEYSTORE" \
  -storetype PKCS12 \
  -storepass "$PASSWORD" \
  -keypass "$PASSWORD" \
  -alias criblo \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -dname "CN=CRI BLO, OU=Android Release, O=CRI BLO, L=France, C=FR"

keytool -list -v \
  -keystore "$KEYSTORE" \
  -storepass "$PASSWORD" \
  -alias criblo > "$OUT_DIR/certificate.txt"

if base64 --help 2>&1 | grep -q -- "-w"; then
  base64 -w 0 "$KEYSTORE" > "$OUT_DIR/ANDROID_KEYSTORE_BASE64.txt"
else
  base64 "$KEYSTORE" | tr -d '\n' > "$OUT_DIR/ANDROID_KEYSTORE_BASE64.txt"
fi

printf '%s' "$PASSWORD" > "$OUT_DIR/ANDROID_KEY_PASSWORD.txt"

echo
echo "Permanent CRI BLO signing key created."
echo "Keep ALL generated files private."
echo
grep -E "SHA1:|SHA256:" "$OUT_DIR/certificate.txt" || true
echo
echo "GitHub secrets required:"
echo "  ANDROID_KEYSTORE_BASE64  <- contents of ANDROID_KEYSTORE_BASE64.txt"
echo "  ANDROID_KEY_PASSWORD     <- contents of ANDROID_KEY_PASSWORD.txt"
