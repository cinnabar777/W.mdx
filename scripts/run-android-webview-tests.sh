#!/bin/sh

device="emulator-${EMULATOR_PORT:-5554}"
adb -s "$device" wait-for-device
boot_wait=0
booted=1
while [ "$(adb -s "$device" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != "1" ]; do
  if [ "$boot_wait" -ge 120 ]; then
    echo "Emulator did not report sys.boot_completed=1 within 120 seconds."
    booted=0
    break
  fi
  sleep 1
  boot_wait=$((boot_wait + 1))
done

if [ "$booted" -eq 1 ]; then
  # The API 35 CI image continues first-boot provider work after boot_completed.
  # Give those services time to settle before starting the instrumented app.
  sleep 15
  ./gradlew connectedDebugAndroidTest --stacktrace --console=plain --max-workers=1
  test_status=$?
else
  test_status=1
fi

mkdir -p app/build/diagnostics
adb -s "$device" logcat -d -t 3000 \
  > app/build/diagnostics/android-webview-logcat.txt 2>&1 || true

exit "$test_status"
