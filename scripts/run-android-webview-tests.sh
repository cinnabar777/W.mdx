#!/bin/sh

device="emulator-${EMULATOR_PORT:-5554}"

wait_for_cpu_pressure() {
  phase="$1"
  pressure_wait=0
  stable_samples=0
  pressure_available=1
  while [ "$pressure_wait" -lt 180 ] && [ "$stable_samples" -lt 3 ]; do
    cpu_pressure=$(adb -s "$device" shell cat /proc/pressure/cpu 2>/dev/null |
      sed -n 's/^some .*avg10=\([0-9.]*\).*/\1/p' | tr -d '\r')
    if [ -z "$cpu_pressure" ]; then
      pressure_available=0
      echo "Android CPU pressure metrics are unavailable; skipping the $phase idle gate."
      break
    fi
    if awk "BEGIN { exit !($cpu_pressure < 35) }"; then
      stable_samples=$((stable_samples + 1))
    else
      stable_samples=0
    fi
    echo "Android CPU pressure after $phase avg10=$cpu_pressure; stable samples=${stable_samples}/3."
    if [ "$stable_samples" -lt 3 ]; then
      sleep 10
      pressure_wait=$((pressure_wait + 10))
    fi
  done
  if [ "$pressure_available" -eq 1 ] && [ "$stable_samples" -lt 3 ]; then
    echo "Android CPU pressure did not settle after $phase within 180 seconds; continuing with diagnostics enabled."
  fi
}

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
    # Let app/package installation and Android startup settle before opening WebView.
    ./gradlew installDebug installDebugAndroidTest --stacktrace --console=plain --max-workers=1
    test_status=$?
    if [ "$test_status" -eq 0 ]; then
      wait_for_cpu_pressure "APK installation"
      warmup_output=$(timeout 90s adb -s "$device" shell am start -W \
        -n com.wmdx.markdownapp.debug/.DocumentDispatchActivity 2>&1)
      warmup_status=$?
      echo "Android app warm-up (exit $warmup_status):"
      echo "$warmup_output"
      if [ "$warmup_status" -eq 0 ]; then
        # Wait through first-run WebView/provider initialization before instrumentation.
        sleep 15
        app_pid=$(adb -s "$device" shell pidof com.wmdx.markdownapp.debug 2>/dev/null |
          tr -d '\r')
        if [ -n "$app_pid" ]; then
          ./gradlew connectedDebugAndroidTest \
            -x installDebug -x installDebugAndroidTest \
            --stacktrace --console=plain --max-workers=1
          test_status=$?
        else
          echo "The app process did not survive the WebView warm-up."
          test_status=1
        fi
      else
        echo "The app launcher could not complete its WebView warm-up."
        test_status=1
      fi
    fi
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
