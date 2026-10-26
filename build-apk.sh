#!/usr/bin/env bash
# Builds the Home Base TV launcher without Gradle (it has no outside libraries).
# Needs: SDK=<dir with build-tools/ and platform/android.jar>, the bundled page in app/src/main/assets/tv.html,
# and keystore.properties (storeFile, storePassword, keyAlias, keyPassword). The key is not in git.
set -euo pipefail
cd "$(dirname "$0")"
SDK=${SDK:-/opt/hbtv-sdk}
BT=$SDK/build-tools
JAR=$SDK/platform/android.jar
VERSION_NAME=${VERSION_NAME:-1.0}
VERSION_CODE=${VERSION_CODE:-1}
OUT=build; rm -rf "$OUT"; mkdir -p "$OUT"/{gen,classes,res,dex}
M=app/src/main
"$BT/aapt2" compile --dir $M/res -o "$OUT/res/res.zip"
"$BT/aapt2" link -I "$JAR" --manifest $M/AndroidManifest.xml -A $M/assets \
  --min-sdk-version 26 --target-sdk-version 34 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  --java "$OUT/gen" -o "$OUT/unsigned.apk" "$OUT/res/res.zip"
javac --release 8 -Xlint:-options -nowarn -encoding UTF-8 -classpath "$JAR" -d "$OUT/classes" $(find $M/java "$OUT/gen" -name '*.java') 2>&1 | grep -v "^Picked up" || true
test -f "$OUT/classes/app/homebase/tv/HomeActivity.class"
java -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --release --min-api 26 --lib "$JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class') 2>&1 | grep -v "^Picked up" || true
cp "$OUT/unsigned.apk" "$OUT/with-dex.apk"
if command -v zip >/dev/null; then (cd "$OUT/dex" && zip -q -j ../with-dex.apk classes.dex)
else python -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'a',zipfile.ZIP_DEFLATED); z.write(sys.argv[2],'classes.dex'); z.close()" "$OUT/with-dex.apk" "$OUT/dex/classes.dex"; fi
"$BT/zipalign" -f -p 4 "$OUT/with-dex.apk" "$OUT/aligned.apk"
set -a; . ./keystore.properties; set +a
java -jar "$BT/lib/apksigner.jar" sign --ks "$storeFile" --ks-key-alias "$keyAlias" --ks-pass "pass:$storePassword" --key-pass "pass:$keyPassword" --out "$OUT/HomeBaseTV.apk" "$OUT/aligned.apk" 2>&1 | grep -v "^Picked up" || true
java -jar "$BT/lib/apksigner.jar" verify --print-certs "$OUT/HomeBaseTV.apk" 2>&1 | grep -v "^Picked up" | head -3
echo "Built $OUT/HomeBaseTV.apk ($VERSION_NAME / $VERSION_CODE)"
