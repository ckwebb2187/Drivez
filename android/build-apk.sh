#!/usr/bin/env bash
# Builds the Drivez Android app without Gradle (it has no outside libraries).
# Needs the Android SDK (platform 34 + build-tools 34) and keystore.properties.
set -euo pipefail
cd "$(dirname "$0")"
SDK=${ANDROID_HOME:-/opt/android-sdk}
BT=$SDK/build-tools/35.0.0
JAR=$SDK/platforms/android-34/android.jar
VERSION_NAME=$(grep versionName app/build.gradle | grep -o "'[^']*'" | tr -d "'")
VERSION_CODE=$(grep versionCode app/build.gradle | grep -o '[0-9]\+')
SITE=$(grep "'SITE'" app/build.gradle | grep -o 'https://[^\\"]*')
OUT=build/manual; rm -rf "$OUT"; mkdir -p "$OUT"/{gen/app/drivez,classes,res,dex}

cat > "$OUT/gen/app/drivez/BuildConfig.java" <<JAVA
package app.drivez;
public final class BuildConfig {
  public static final String VERSION_NAME = "$VERSION_NAME";
  public static final int VERSION_CODE = $VERSION_CODE;
  public static final String SITE = "$SITE";
}
JAVA

"$BT/aapt2" compile --dir app/src/main/res -o "$OUT/res/res.zip"
"$BT/aapt2" link -I "$JAR" --manifest app/src/main/AndroidManifest.xml --rename-manifest-package app.drivez \
  --min-sdk-version 26 --target-sdk-version 34 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  --java "$OUT/gen" -o "$OUT/unsigned.apk" "$OUT/res/res.zip"
javac --release 8 -nowarn -classpath "$JAR" -d "$OUT/classes" $(find app/src/main/java "$OUT/gen" -name '*.java') 2>&1 | grep -v "^Picked up\|bootstrap\|^warning\|^1 warning" || true
"$BT/d8" --release --min-api 26 --lib "$JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
cp "$OUT/unsigned.apk" "$OUT/with-dex.apk"
(cd "$OUT/dex" && zip -q -j ../with-dex.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/with-dex.apk" "$OUT/aligned.apk"
set -a; . ./keystore.properties; set +a
"$BT/apksigner" sign --ks "$storeFile" --ks-key-alias "$keyAlias" --ks-pass "pass:$storePassword" --key-pass "pass:$keyPassword" --out "$OUT/drivez.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify "$OUT/drivez.apk"
echo "Built $OUT/drivez.apk ($VERSION_NAME / $VERSION_CODE)"
