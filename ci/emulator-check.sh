#!/usr/bin/env bash
# Installs the app on an Android TV emulator, walks through it and takes screenshots.
set -x
mkdir -p shots
shot() { adb exec-out screencap -p > "shots/$1.png"; }
adb install -r HomeBaseTV.apk
adb shell am start -n app.homebase.tv/.HomeActivity
sleep 8; shot 01-first-run
adb shell input text demo
adb shell input keyevent KEYCODE_ENTER
sleep 10; shot 02-home
adb shell input keyevent KEYCODE_DPAD_RIGHT; sleep 1
adb shell input keyevent KEYCODE_DPAD_RIGHT; sleep 2; shot 03-focus
# The Home button override
adb shell settings put secure enabled_accessibility_services app.homebase.tv/app.homebase.tv.HomeButtonService
adb shell settings put secure accessibility_enabled 1
sleep 4
adb shell input keyevent KEYCODE_HOME; sleep 8; shot 04-after-home-button
adb shell dumpsys activity activities | grep -E "ResumedActivity" > shots/top-after-home.txt
# The screensaver
adb shell settings put secure screensaver_components app.homebase.tv/app.homebase.tv.HomeDream
adb shell settings put secure screensaver_enabled 1
adb shell am start -n com.android.systemui/.Somnambulator; sleep 14; shot 05-screensaver
adb shell input keyevent KEYCODE_DPAD_CENTER; sleep 3
# Long press OK on the third tile moves it to the front
adb shell am start -n app.homebase.tv/.HomeActivity; sleep 4
adb shell input keyevent KEYCODE_DPAD_RIGHT; adb shell input keyevent KEYCODE_DPAD_RIGHT; sleep 1
adb shell input keyevent --longpress KEYCODE_DPAD_CENTER; sleep 3; shot 06-moved
# 2.0: the Style panel opens from the remote's menu button and follows the arrows; the small buttons sit bottom right
adb shell am start -n app.homebase.tv/.HomeActivity; sleep 4
adb shell input keyevent KEYCODE_MENU; sleep 3; shot 07-style-open
adb shell input keyevent KEYCODE_DPAD_DOWN; sleep 1; adb shell input keyevent KEYCODE_DPAD_DOWN; sleep 1; shot 08-style-moved
adb shell input keyevent KEYCODE_DPAD_RIGHT; sleep 2; shot 09-style-changed
adb shell input keyevent KEYCODE_BACK; sleep 2; shot 10-style-closed
adb shell input keyevent KEYCODE_DPAD_DOWN; sleep 2; shot 11-corner-buttons
adb shell dumpsys package app.homebase.tv | grep -E "versionName|versionCode" > shots/version.txt
adb logcat -d > shots/logcat.txt
adb logcat -d -b crash > shots/crash.txt
exit 0
