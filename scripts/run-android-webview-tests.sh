#!/bin/sh

./gradlew connectedDebugAndroidTest --stacktrace --console=plain
test_status=$?

mkdir -p app/build/diagnostics
adb -s "emulator-${EMULATOR_PORT}" logcat -d -t 3000 \
  > app/build/diagnostics/android-webview-logcat.txt 2>&1 || true

exit "$test_status"
