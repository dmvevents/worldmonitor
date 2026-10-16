#!/usr/bin/env bash
# Install / remove the launchd user agent that keeps the hub running at login.
#   bash scripts/tt-install-service.sh install     # writes ~/Library/LaunchAgents/com.worldmonitor.tt-hub.plist and starts it
#   bash scripts/tt-install-service.sh restart
#   bash scripts/tt-install-service.sh status
#   bash scripts/tt-install-service.sh uninstall
set -euo pipefail
cd "$(dirname "$0")/.."
LABEL="com.worldmonitor.tt-hub"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/worldmonitor-hub"
REPO="$PWD"
UID_NUM="$(id -u)"
cmd="${1:-install}"

write_plist() {
  mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>$REPO/scripts/tt-hub-serve.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
    <key>HUB_PORT</key><string>${HUB_PORT:-3100}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>$LOG_DIR/hub.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/hub.log</string>
</dict></plist>
PLIST
}

case "$cmd" in
  install)
    write_plist
    launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$UID_NUM" "$PLIST"
    launchctl kickstart -k "gui/$UID_NUM/$LABEL"
    echo "installed $LABEL → http://127.0.0.1:${HUB_PORT:-3100}/dashboard ; logs: $LOG_DIR/hub.log" ;;
  restart) launchctl kickstart -k "gui/$UID_NUM/$LABEL"; echo "restarted $LABEL" ;;
  status) launchctl print "gui/$UID_NUM/$LABEL" 2>/dev/null | grep -E "state|pid|last exit" | head -5 || echo "$LABEL not loaded"; tail -5 "$LOG_DIR/hub.log" 2>/dev/null ;;
  uninstall) launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true; rm -f "$PLIST"; echo "removed $LABEL" ;;
  *) echo "usage: $0 install|restart|status|uninstall" >&2; exit 2 ;;
esac
