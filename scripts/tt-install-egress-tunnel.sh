#!/usr/bin/env bash
# Keep an SSH tunnel to your egress machine alive at login (launchd), so the hub's
# IPTV_EGRESS_PROXY=http://127.0.0.1:8888 always has something to talk to.
#
#   EGRESS_SSH_TARGET=user@host[:sshport] in ~/.config/worldmonitor/keys.env (or as $1)
#   bash scripts/tt-install-egress-tunnel.sh install    # writes ~/Library/LaunchAgents/com.worldmonitor.tt-egress-tunnel.plist
#   bash scripts/tt-install-egress-tunnel.sh status
#   bash scripts/tt-install-egress-tunnel.sh test       # exit IP seen through the tunnel vs direct
#   bash scripts/tt-install-egress-tunnel.sh uninstall
#
# Needs key-based SSH (BatchMode): `ssh-copy-id user@host` once. The remote runs
# `node tt-egress-proxy.mjs` (scripts/tt-egress-proxy.mjs, copy it over with scp) on its
# 127.0.0.1:${EGRESS_REMOTE_PORT:-8888}; the tunnel exposes it locally on ${EGRESS_LOCAL_PORT:-8888}.
set -euo pipefail
cd "$(dirname "$0")/.."
KEYS_FILE="${WM_KEYS_FILE:-$HOME/.config/worldmonitor/keys.env}"
if [ -f "$KEYS_FILE" ]; then set -a; . "$KEYS_FILE"; set +a; fi
LABEL="com.worldmonitor.tt-egress-tunnel"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/worldmonitor-hub"
UID_NUM="$(id -u)"
LOCAL_PORT="${EGRESS_LOCAL_PORT:-8888}"
REMOTE_PORT="${EGRESS_REMOTE_PORT:-8888}"
cmd="${1:-install}"
TARGET="${2:-${EGRESS_SSH_TARGET:-}}"

need_target() {
  if [ -z "$TARGET" ]; then
    echo "EGRESS_SSH_TARGET=user@host[:port] is not set (keys.env) and no target was given" >&2; exit 2
  fi
}
ssh_args() {
  local host="$TARGET" port=22
  case "$TARGET" in *:*) host="${TARGET%:*}"; port="${TARGET##*:}";; esac
  printf '%s\n' -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -o StrictHostKeyChecking=accept-new -p "$port" -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" "$host"
}

write_plist() {
  mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
  {
    cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/ssh</string>
PLIST
    while IFS= read -r a; do printf '    <string>%s</string>\n' "$a"; done < <(ssh_args)
    cat <<PLIST
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG_DIR/egress-tunnel.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/egress-tunnel.log</string>
</dict></plist>
PLIST
  } > "$PLIST"
}

case "$cmd" in
  install)
    need_target; write_plist
    launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$UID_NUM" "$PLIST"
    launchctl kickstart -k "gui/$UID_NUM/$LABEL"
    echo "installed $LABEL → local http proxy on 127.0.0.1:${LOCAL_PORT} via ${TARGET##*@}"
    echo "next: IPTV_EGRESS_PROXY=http://127.0.0.1:${LOCAL_PORT} in $KEYS_FILE, then: bash scripts/tt-install-service.sh restart" ;;
  status) launchctl print "gui/$UID_NUM/$LABEL" 2>/dev/null | grep -E "state|pid|last exit" | head -5 || echo "$LABEL not loaded"; tail -3 "$LOG_DIR/egress-tunnel.log" 2>/dev/null || true ;;
  test)
    direct="$(curl -fsS -m 10 https://api.ipify.org 2>/dev/null || echo unknown)"
    via="$(curl -fsS -m 15 -x "http://127.0.0.1:${LOCAL_PORT}" https://api.ipify.org 2>/dev/null || echo "unreachable (tunnel or remote proxy down)")"
    echo "direct exit IP: $direct"; echo "via tunnel:     $via"
    [ "$direct" != "$via" ] && [ "$via" != "${via#unreachable}" ] || { [ "$direct" != "$via" ] || echo "same exit as direct: the tunnel is not changing your region"; } ;;
  uninstall) launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true; rm -f "$PLIST"; echo "removed $LABEL" ;;
  *) echo "usage: $0 install|status|test|uninstall [user@host[:port]]" >&2; exit 2 ;;
esac
