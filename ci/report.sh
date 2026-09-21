#!/usr/bin/env bash
#
# Summarise the run at the end of the build log, then decide the build's verdict.
#
# This posts nothing anywhere. Pulling a build log into GitHub is a separate
# workflow's job; all this does is make the log worth pulling — a run that failed
# in step two should say so in its last twenty lines, not leave the reader
# scrolling a Docker build to find out.
#
# It is also what makes the build's status honest. Every real step runs under
# ci/step.sh, which swallows its exit code so that this step always runs; the
# recorded statuses below are what turn a failure back into a failed build.
set -uo pipefail

: "${MODE:?MODE must be preview or apply}"
: "${SHA:?SHA must be the commit being built}"
: "${BUILD_ID:?BUILD_ID must be set}"
: "${GOOGLE_PROJECT:?GOOGLE_PROJECT must be set}"

EXPECTED_STEPS="${EXPECTED_STEPS:-image pulumi}"

echo
echo "================================================================"
echo " ${MODE} · ${SHA} · build ${BUILD_ID}"
echo "================================================================"

failed=()
for name in $EXPECTED_STEPS; do
  path="/workspace/status/${name}"
  if [[ ! -f "$path" ]]; then
    # No status file means the step never ran, which happens when an earlier one
    # failed. That is not a pass, and reporting it as one would be the single
    # most misleading thing this script could do.
    printf '  %-10s did not run\n' "$name"
    failed+=("$name")
    continue
  fi
  code="$(cat "$path")"
  if [[ "$code" == "0" ]]; then
    printf '  %-10s passed\n' "$name"
  else
    printf '  %-10s FAILED (exit %s)\n' "$name" "$code"
    failed+=("$name")
  fi
done
echo "================================================================"

if [[ ${#failed[@]} -eq 0 ]]; then
  echo "All steps succeeded."
  exit 0
fi

# The tail, not the head: a failure's useful end is the last thing printed, and
# a log re-read from the front is how a real error gets buried under npm's
# install chatter. The full output of every step is above this summary anyway —
# this is the part worth reading first.
for name in "${failed[@]}"; do
  log="/workspace/logs/${name}.log"
  [[ -f "$log" ]] || continue
  echo
  echo "---- last 80 lines of '${name}' ------------------------------"
  tail -n 80 "$log"
  echo "---- end of '${name}' ----------------------------------------"
done

echo
echo "Build failed in: ${failed[*]}"
exit 1
