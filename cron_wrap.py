"""
Cron failure notifier — wraps every scheduled job so a crash is never silent.

The bs4 incident: a missing dependency killed cron_research at IMPORT time for
days, and the only symptom was "no drafts arrived." This wrapper runs the real
job as a subprocess (so even import-time crashes are caught), passes its output
through to the cron log unchanged, and on a non-zero exit posts the tail of the
output to the Slack approval channel.

Usage (deploy/crontab):
  /app/.venv/bin/python /app/cron_wrap.py research /app/.venv/bin/python /app/cron_research.py

Deliberately dependency-free (urllib, not slack_sdk): the notifier must not be
killable by the same broken-dependency class of failure it exists to report.
"""

import json
import os
import subprocess
import sys
import urllib.request


def _notify_slack(name: str, code: int, tail: str) -> None:
    token = os.getenv("SLACK_BOT_TOKEN")
    channel = os.getenv("SLACK_CHANNEL_ID")
    if not token or not channel:
        print(f"[cron-wrap] (no Slack env — failure of '{name}' not notified)")
        return
    # Exit 2 = degraded (some optional work failed); 1/other = dead run (issue #10).
    if code == 2:
        header = f":warning: *Cron job `{name}` ran DEGRADED* (exit 2 — some phases failed, some succeeded)"
    else:
        header = f":rotating_light: *Cron job `{name}` FAILED* (exit {code})"
    text = (
        f"{header}\n"
        f"```{tail.strip()[-1400:] or '(no output)'}```\n"
        f"_It will retry on its next schedule; check `fly logs` for the full run._"
    )
    body = json.dumps({"channel": channel, "text": text}).encode()
    req = urllib.request.Request(
        "https://slack.com/api/chat.postMessage",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=utf-8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            ok = json.loads(resp.read().decode()).get("ok")
            print(f"[cron-wrap] Slack alert for '{name}': {'sent' if ok else 'API returned not-ok'}")
    except Exception as e:
        print(f"[cron-wrap] Slack alert failed (non-fatal): {e}")


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: cron_wrap.py <job-name> <command...>", file=sys.stderr)
        return 2
    name, cmd = sys.argv[1], sys.argv[2:]

    proc = subprocess.run(cmd, capture_output=True, text=True)
    # Pass output through so the normal cron log stays identical.
    if proc.stdout:
        sys.stdout.write(proc.stdout)
    if proc.stderr:
        sys.stderr.write(proc.stderr)

    if proc.returncode != 0:
        _notify_slack(name, proc.returncode, (proc.stdout or "") + (proc.stderr or ""))
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
