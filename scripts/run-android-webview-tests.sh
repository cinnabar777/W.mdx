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
  user_id=$(adb -s "$device" shell am get-current-user 2>/dev/null | tr -d '\r')
  unlock_wait=0
  unlocked=0
  while [ "$unlock_wait" -lt 180 ]; do
    unlock_state=$(adb -s "$device" shell cmd user is-user-unlocked "$user_id" 2>/dev/null | tr -d '\r')
    if [ "$unlock_state" = "true" ]; then
      unlocked=1
      break
    fi
    if adb -s "$device" shell dumpsys user 2>/dev/null | grep -q 'RUNNING_UNLOCKED'; then
      unlocked=1
      break
    fi
    sleep 1
    unlock_wait=$((unlock_wait + 1))
  done

  if [ "$unlocked" -eq 1 ]; then
    # boot_completed can precede user unlock and provider initialization.
    # Avoid launching the WebView process while Android is still unlocking.
    sleep 15
    ./gradlew connectedDebugAndroidTest --stacktrace --console=plain --max-workers=1
    test_status=$?
  else
    echo "Android user $user_id did not reach RUNNING_UNLOCKED within 180 seconds."
    test_status=1
  fi
else
  test_status=1
fi

mkdir -p app/build/diagnostics
adb -s "$device" logcat -d -t 3000 \
  > app/build/diagnostics/android-webview-logcat.txt 2>&1 || true

exit "$test_status"
