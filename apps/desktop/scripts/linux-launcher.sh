#!/bin/sh
# 454 Workshop on Linux: starts the app, without Chromium's sandbox only where the sandbox can't work.
# Put in place of the program by scripts/after-pack.js; the program itself is beside it, as <name>-bin.
#
# An AppImage can't give Chromium's sandbox helper the special permission it needs (its files are mounted
# read-only, without it), so Chromium falls back to a kernel feature, unprivileged user namespaces. Ubuntu 24.04
# and later (and Mint 22) restrict that to programs AppArmor has a profile for, which an AppImage hasn't; some
# systems switch it off; and Chromium won't run sandboxed as root at all. In those cases the app would quit at
# once ("The SUID sandbox helper binary was found, but is not configured correctly"), so it starts with
# --no-sandbox, as the usual advice is to do by hand. Its windows only ever show the app's own pages, from
# inside the AppImage; links anywhere else open in the web browser. This has to happen here, before the
# program starts: Chromium sets up its sandbox before any of the app's own code runs.
HERE=$(dirname "$(readlink -f "$0")")
PROC=${P454_PROC:-/proc}                       # tests only: stand-ins for /proc and the user id
USERID=${P454_UID:-$(id -u)}
NS=
if [ -n "$APPIMAGE" ] || [ -n "$P454_PROC" ]; then
  if [ "$USERID" = 0 ]; then NS=--no-sandbox
  elif [ "$(cat "$PROC/sys/kernel/apparmor_restrict_unprivileged_userns" 2>/dev/null)" = 1 ]; then NS=--no-sandbox
  elif [ "$(cat "$PROC/sys/kernel/unprivileged_userns_clone" 2>/dev/null)" = 0 ]; then NS=--no-sandbox
  fi
fi
exec "$HERE/@NAME@-bin" $NS "$@"
