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
    # The emulator can still be under severe CPU pressure after unlocking.
    # Wait for three consecutive low-pressure samples before starting WebView.
    pressure_wait=0
    stable_samples=0
    pressure_available=1
    while [ "$pressure_wait" -lt 180 ] && [ "$stable_samples" -lt 3 ]; do
      cpu_pressure=$(adb -s "$device" shell cat /proc/pressure/cpu 2>/dev/null |
        sed -n 's/^some .*avg10=\([0-9.]*\).*/\1/p' | tr -d '\r')
      if [ -z "$cpu_pressure" ]; then
        pressure_available=0
        echo "Android CPU pressure metrics are unavailable; continuing without the idle gate."
        break
      fi
      if [ -n "$cpu_pressure" ] &&
        awk "BEGIN { exit !($cpu_pressure < 35) }"; then
        stable_samples=$((stable_samples + 1))
      else
        stable_samples=0
      fi
      echo "Android CPU pressure avg10=${cpu_pressure:-unavailable}; stable samples=${stable_samples}/3."
      if [ "$stable_samples" -lt 3 ]; then
        sleep 10
        pressure_wait=$((pressure_wait + 10))
      fi
    done
    if [ "$pressure_available" -eq 1 ] && [ "$stable_samples" -lt 3 ]; then
      echo "Android CPU pressure did not settle within 180 seconds; continuing with diagnostics enabled."
    fi
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
{
  echo "=== Android emulator diagnostics ==="
  echo "CPU pressure:"
  adb -s "$device" shell cat /proc/pressure/cpu 2>&1 || true
  echo "Memory pressure:"
  adb -s "$device" shell cat /proc/pressure/memory 2>&1 || true
  echo "I/O pressure:"
  adb -s "$device" shell cat /proc/pressure/io 2>&1 || true
  echo "Last activity ANR:"
  adb -s "$device" shell dumpsys activity lastanr 2>&1 || true
} >> app/build/diagnostics/android-webview-logcat.txt
if [ "$test_status" -ne 0 ]; then
  adb -s "$device" shell dumpsys activity processes 2>&1 |
    grep -E -C 2 'com\.wmdx\.markdownapp|ANR|not responding' \
    >> app/build/diagnostics/android-webview-logcat.txt || true
fi

exit "$test_status"
