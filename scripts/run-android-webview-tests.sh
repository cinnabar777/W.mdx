#!/bin/sh

device="emulator-${EMULATOR_PORT:-5554}"
diagnostics_dir="app/build/diagnostics"
runner_log="$diagnostics_dir/android-webview-logcat.txt"
mkdir -p "$diagnostics_dir"
: > "$runner_log"

log() {
  printf '%s\n' "$*" | tee -a "$runner_log"
}

read_cpu_counters() {
  adb -s "$device" shell cat /proc/stat 2>/dev/null |
    awk 'NR == 1 {
      total = $2 + $3 + $4 + $5 + $6 + $7 + $8 + $9
      idle = $5 + $6
      print total, idle
      exit
    }' | tr -d '\r'
}

wait_for_cpu_idle() {
  phase="$1"
  idle_wait=0
  stable_samples=0
  before=$(read_cpu_counters)
  if [ -z "$before" ]; then
    log "Android /proc/stat counters are unavailable; allowing 60 seconds for $phase to settle."
    sleep 60
    return
  fi

  while [ "$idle_wait" -lt 180 ] && [ "$stable_samples" -lt 3 ]; do
    sleep 5
    after=$(read_cpu_counters)
    if [ -z "$after" ]; then
      log "Android /proc/stat counters became unavailable during $phase; allowing 60 seconds to settle."
      sleep 60
      break
    fi

    cpu_busy=$(awk -v before="$before" -v after="$after" '
      BEGIN {
        split(before, start, " ")
        split(after, finish, " ")
        total = finish[1] - start[1]
        idle = finish[2] - start[2]
        if (total <= 0 || idle < 0) exit 1
        printf "%.1f", 100 * (total - idle) / total
      }')
    if [ -z "$cpu_busy" ]; then
      log "Could not calculate Android CPU usage during $phase; allowing 60 seconds to settle."
      sleep 60
      break
    fi

    if awk "BEGIN { exit !($cpu_busy < 70) }"; then
      stable_samples=$((stable_samples + 1))
    else
      stable_samples=0
    fi
    log "Android CPU busy after $phase=${cpu_busy}%; stable samples=${stable_samples}/3."
    before="$after"
    idle_wait=$((idle_wait + 5))
  done

  if [ "$stable_samples" -lt 3 ]; then
    log "Android CPU usage did not settle after $phase within 180 seconds; continuing with diagnostics enabled."
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
    log "Installing app and instrumentation APKs."
    ./gradlew installDebug installDebugAndroidTest --stacktrace --console=plain --max-workers=1
    test_status=$?
    log "APK installation exit status: $test_status"
    if [ "$test_status" -eq 0 ]; then
      wait_for_cpu_idle "APK installation"
      warmup_output=$(timeout 90s adb -s "$device" shell am start -W \
        -n com.wmdx.markdownapp.debug/.DocumentDispatchActivity 2>&1)
      warmup_status=$?
      log "Android app warm-up (exit $warmup_status):"
      log "$warmup_output"
      if [ "$warmup_status" -eq 0 ]; then
        # Wait through first-run WebView/provider initialization before instrumentation.
        sleep 15
        app_pid=$(adb -s "$device" shell pidof com.wmdx.markdownapp.debug 2>/dev/null |
          tr -d '\r')
        if [ -n "$app_pid" ]; then
          log "WebView warm-up app process is alive (pid $app_pid); waiting for Android CPU idle."
          wait_for_cpu_idle "WebView warm-up"
          log "Starting Android WebView instrumentation."
          ./gradlew connectedDebugAndroidTest \
            -x installDebug -x installDebugAndroidTest \
            --stacktrace --console=plain --max-workers=1
          test_status=$?
          reported_tests=0
          for test_report in app/build/outputs/androidTest-results/connected/debug/TEST-*.xml; do
            [ -f "$test_report" ] || continue
            report_tests=$(sed -n '1s/.*tests="\([0-9][0-9]*\)".*/\1/p' "$test_report")
            reported_tests=$((reported_tests + ${report_tests:-0}))
          done
          log "Android instrumentation XML reports $reported_tests test(s)."
          if [ "$reported_tests" -eq 0 ]; then
            log "Android instrumentation did not execute any tests; treating this as a failure."
            test_status=1
          fi
        else
          log "The app process did not survive the WebView warm-up."
          test_status=1
        fi
      else
        log "The app launcher could not complete its WebView warm-up."
        test_status=1
      fi
    fi
  else
    log "Android user $user_id did not reach RUNNING_UNLOCKED within 180 seconds."
    test_status=1
  fi
else
  log "Emulator boot did not complete."
  test_status=1
fi

log "=== Android device logcat ==="
adb -s "$device" logcat -d -t 3000 \
  >> "$runner_log" 2>&1 || true
{
  echo "=== Android emulator diagnostics ==="
  echo "CPU pressure:"
  adb -s "$device" shell cat /proc/pressure/cpu 2>&1 || true
  echo "CPU counters from /proc/stat:"
  adb -s "$device" shell cat /proc/stat 2>&1 | head -n 1 || true
  echo "Memory pressure:"
  adb -s "$device" shell cat /proc/pressure/memory 2>&1 || true
  echo "I/O pressure:"
  adb -s "$device" shell cat /proc/pressure/io 2>&1 || true
  echo "Last activity ANR:"
  adb -s "$device" shell dumpsys activity lastanr 2>&1 || true
} >> "$runner_log"
if [ "$test_status" -ne 0 ]; then
  adb -s "$device" shell dumpsys activity processes 2>&1 |
    grep -E -C 2 'com\.wmdx\.markdownapp|ANR|not responding' \
    >> "$runner_log" || true
fi

exit "$test_status"
