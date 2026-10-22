# Drivez Android app

A small wrapper that opens the Drivez site and adds what a web page can't do:
reading what's playing on the phone (media sessions, via "notification access")
and play/pause/skip controls. The web app talks to it through `window.DrivezNative`.

Build (no Gradle needed, the app has no outside libraries):

    ./build-apk.sh        # needs Android SDK platform 34 + build-tools 35, and keystore.properties

Then copy `build/manual/drivez.apk` to `../public/drivez.apk`, bump `versionCode`/`versionName`
in `app/build.gradle` and `../public/android-version.json`, and deploy the site.
The signing key (`drivez-release.jks` + `keystore.properties`) is not in git. Updates must be
signed with the same key, or the old app has to be uninstalled first.
