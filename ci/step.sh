#!/usr/bin/env bash
#
# Run one pipeline step, capture what it printed, and record how it went —
# without failing the build here.
#
# Cloud Build has no `if: always()`. A step that fails stops the build dead, so
# a reporting step placed last would be exactly the step that never runs on the
# one occasion it matters. The way around it is for every step to swallow its
# own exit code into a file and always exit clean, leaving ci/report.sh to
# decide at the end whether the build failed — which it does by exiting non-zero
# itself, so a red build still reads as red in the console.
#
# Usage: ci/step.sh <name> <script> [args...]
set -uo pipefail

NAME="${1:?step name is required}"
shift

mkdir -p /workspace/logs /workspace/status

# pipefail is set, so this is the step's status and not tee's.
bash "$@" 2>&1 | tee "/workspace/logs/${NAME}.log"
status="${PIPESTATUS[0]}"

printf '%s' "$status" > "/workspace/status/${NAME}"

if [[ "$status" -ne 0 ]]; then
  echo "--- step '${NAME}' failed with exit code ${status}; continuing so the run can be reported"
fi

# Always clean: ci/report.sh is what turns a recorded failure back into a
# failed build.
exit 0
