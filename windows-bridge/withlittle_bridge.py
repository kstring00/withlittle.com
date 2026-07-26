from __future__ import annotations

import argparse
import base64
import ctypes
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from ctypes import wintypes
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

SUPABASE_URL = "https://lfgukrnfuradrgofzxsz.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_VwhWvbGrfWR7jkJY5QKwyw_Ka14_Y-m"
PAIR_URL = "https://withlittle.app/bridge-pair.html"
APP_DATA_KEYS = ["fs-core", "fs-stewardship"]
POLL_SECONDS = 60

APP_DIR = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "WithLittleBridge"
SESSION_PATH = APP_DIR / "session.dat"
LOG_PATH = APP_DIR / "bridge.log"
CONFIG_PATH = APP_DIR / "config.json"

DEFAULT_RESOURCES = (
    Path.home()
    / "OneDrive"
    / "Documentos"
    / "Rainmeter"
    / "Skins"
    / "KyleCommandCenter"
    / "@Resources"
)


class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def log(message: str) -> None:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(f"[{stamp}] {message}\n")


def _blob(data: bytes) -> tuple[DATA_BLOB, Any]:
    buffer = ctypes.create_string_buffer(data)
    return DATA_BLOB(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte))), buffer


def protect(data: bytes) -> bytes:
    in_blob, _ = _blob(data)
    out_blob = DATA_BLOB()
    if not ctypes.windll.crypt32.CryptProtectData(
        ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out_blob.pbData)


def unprotect(data: bytes) -> bytes:
    in_blob, _ = _blob(data)
    out_blob = DATA_BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out_blob.pbData)


def save_session(session: dict[str, Any]) -> None:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(session).encode("utf-8")
    SESSION_PATH.write_bytes(base64.b64encode(protect(payload)))


def load_session() -> dict[str, Any] | None:
    try:
        encrypted = base64.b64decode(SESSION_PATH.read_bytes())
        return json.loads(unprotect(encrypted).decode("utf-8"))
    except Exception:
        return None


def load_config() -> dict[str, Any]:
    config = {
        "resources_dir": str(DEFAULT_RESOURCES),
        "rainmeter_exe": r"C:\Program Files\Rainmeter\Rainmeter.exe",
        "habit_config": r"KyleCommandCenter\HabitMomentum",
        "poll_seconds": POLL_SECONDS,
    }
    if CONFIG_PATH.exists():
        try:
            config.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
        except Exception as exc:
            log(f"Config read failed: {exc}")
    APP_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config, indent=2), encoding="utf-8")
    return config


def api_request(path: str, session: dict[str, Any], method: str = "GET", body: Any = None) -> Any:
    url = SUPABASE_URL + path
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {session['access_token']}",
        "Content-Type": "application/json",
    }
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {details}") from exc


def refresh_session(session: dict[str, Any]) -> dict[str, Any]:
    expires_at = int(session.get("expires_at") or 0)
    if expires_at > int(time.time()) + 120:
        return session
    refresh_token = session.get("refresh_token")
    if not refresh_token:
        raise RuntimeError("No refresh token is available. Pair the bridge again.")
    result = api_request(
        "/auth/v1/token?grant_type=refresh_token",
        {"access_token": SUPABASE_ANON_KEY},
        method="POST",
        body={"refresh_token": refresh_token},
    )
    session.update(
        {
            "access_token": result["access_token"],
            "refresh_token": result.get("refresh_token", refresh_token),
            "expires_at": int(time.time()) + int(result.get("expires_in", 3600)),
        }
    )
    save_session(session)
    return session


def today_key() -> str:
    return date.today().isoformat()


def js_day_index() -> int:
    return (date.today().weekday() + 1) % 7


def fetch_rows(session: dict[str, Any]) -> dict[str, Any]:
    keys = APP_DATA_KEYS + [f"fs-day:{today_key()}"]
    encoded = urllib.parse.quote(",".join(keys), safe=":,-")
    rows = api_request(
        f"/rest/v1/app_data?select=key,data,updated_at&key=in.({encoded})",
        session,
    )
    return {row["key"]: row.get("data") or {} for row in rows or []}


def habit_scheduled(habit: dict[str, Any]) -> bool:
    frequency = habit.get("frequency", "daily")
    if frequency == "daily":
        return True
    if frequency == "weekdays":
        return date.today().weekday() < 5
    if frequency == "weekly":
        return js_day_index() in (habit.get("days") or [])
    return True


def habit_done(habit: dict[str, Any]) -> bool:
    value = (habit.get("log") or {}).get(today_key())
    if isinstance(value, dict):
        return bool(value.get("done") or value.get("completed"))
    return bool(value)


def build_habits(rows: dict[str, Any]) -> list[dict[str, Any]]:
    core = rows.get("fs-core") or {}
    stew = rows.get("fs-stewardship") or {}
    tasks = core.get("tasks") or []
    anchors = [a for a in (core.get("dailyAnchors") or []) if a.get("enabled", True)]
    stew_habits = [h for h in (stew.get("habits") or []) if habit_scheduled(h)]
    linked = {a.get("stewHabitId") for a in anchors if a.get("stewHabitId")}
    result: list[dict[str, Any]] = []

    for anchor in anchors:
        done = False
        linked_id = anchor.get("stewHabitId")
        if linked_id:
            linked_habit = next((h for h in stew_habits if h.get("id") == linked_id), None)
            done = habit_done(linked_habit or {})
        if not done:
            done = any(
                t.get("anchorId") == anchor.get("id")
                and t.get("date") == today_key()
                and t.get("completed")
                for t in tasks
            )
        result.append(
            {
                "id": anchor.get("id"),
                "name": anchor.get("title") or "Untitled habit",
                "done": done,
                "cue": f"{anchor.get('durationMin')} min" if anchor.get("durationMin") else "",
            }
        )

    existing_names = {str(x["name"]).strip().lower() for x in result}
    for habit in stew_habits:
        if habit.get("id") in linked:
            continue
        name = str(habit.get("title") or "Untitled habit").strip()
        if name.lower() in existing_names:
            continue
        result.append(
            {
                "id": habit.get("id"),
                "name": name,
                "done": habit_done(habit),
                "cue": "" if habit.get("targetTime") == "any" else str(habit.get("targetTime") or ""),
            }
        )
    return result[:7]


def build_priorities(rows: dict[str, Any]) -> list[dict[str, Any]]:
    day_data = rows.get(f"fs-day:{today_key()}") or {}
    items = (((day_data.get("faithfulFew") or {}).get("mustDo") or {}).get("items") or [])
    return [
        {"name": str(item.get("text") or "Untitled priority"), "done": bool(item.get("done"))}
        for item in items
        if not item.get("released") and not item.get("anchorId")
    ][:5]


def safe_value(value: Any) -> str:
    return str(value or "").replace("\r", " ").replace("\n", " ").replace("#", "")


def write_habit_inc(resources: Path, habits: list[dict[str, Any]]) -> None:
    done = sum(1 for habit in habits if habit["done"])
    total = len(habits)
    percent = round(done / total * 100) if total else 0
    next_habit = next((habit for habit in habits if not habit["done"]), None)
    lines = [
        "[Variables]",
        f"HabitDate={today_key()}",
        f"HabitCompleted={done}",
        "HabitMissed=0",
        f"HabitTotal={total}",
        f"HabitPercent={percent}",
        f"HabitWeeklyPercent={percent}",
        f"HabitNextAction={safe_value((next_habit or {}).get('cue') or (next_habit or {}).get('name') or 'Today’s habits are complete.')}",
    ]
    for index in range(1, 8):
        habit = habits[index - 1] if index <= total else None
        if habit:
            lines.extend(
                [
                    f"HabitName{index}={safe_value(habit['name'])}",
                    f"HabitStatus{index}={'DONE' if habit['done'] else 'PENDING'}",
                    f"HabitSymbol{index}={'DONE' if habit['done'] else 'NOW'}",
                    f"HabitWindow{index}={safe_value(habit.get('cue'))}",
                ]
            )
        else:
            lines.extend(
                [
                    f"HabitName{index}=",
                    f"HabitStatus{index}=",
                    f"HabitSymbol{index}=",
                    f"HabitWindow{index}=",
                ]
            )
    resources.mkdir(parents=True, exist_ok=True)
    (resources / "HabitCommand.inc").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_daily_inc(resources: Path, priorities: list[dict[str, Any]], habits: list[dict[str, Any]]) -> None:
    completed = sum(1 for item in priorities if item["done"])
    next_item = next((item for item in priorities if not item["done"]), None)
    if next_item is None:
        next_item = next((item for item in habits if not item["done"]), None)
    lines = [
        "[Variables]",
        f"WLDate={today_key()}",
        f"WLPriorityCompleted={completed}",
        f"WLPriorityTotal={len(priorities)}",
        f"WLNextAction={safe_value((next_item or {}).get('name') or 'Everything in front of you is complete.')}",
    ]
    for index in range(1, 6):
        item = priorities[index - 1] if index <= len(priorities) else None
        lines.append(f"WLPriorityName{index}={safe_value((item or {}).get('name'))}")
        lines.append(f"WLPriorityStatus{index}={'DONE' if item and item['done'] else 'PENDING' if item else ''}")
    (resources / "WithLittleDaily.inc").write_text("\n".join(lines) + "\n", encoding="utf-8")


def refresh_rainmeter(config: dict[str, Any]) -> None:
    executable = Path(config["rainmeter_exe"])
    if not executable.exists():
        log(f"Rainmeter not found at {executable}")
        return
    subprocess.run(
        [str(executable), "!Refresh", config["habit_config"]],
        check=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


class PairHandler(BaseHTTPRequestHandler):
    server_version = "WithLittleBridge/0.1"

    def _headers(self, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Content-Type", "application/json")
        self.end_headers()

    def do_OPTIONS(self) -> None:
        self._headers(204)

    def do_POST(self) -> None:
        if self.path != "/pair":
            self._headers(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not payload.get("access_token") or not payload.get("refresh_token"):
                raise ValueError("Missing Supabase session tokens")
            save_session(payload)
            self.server.paired_event.set()  # type: ignore[attr-defined]
            self._headers(200)
            self.wfile.write(b'{"ok":true}')
            log(f"Paired account {payload.get('user', {}).get('email', '')}")
        except Exception as exc:
            self._headers(400)
            self.wfile.write(json.dumps({"ok": False, "error": str(exc)}).encode("utf-8"))

    def log_message(self, format: str, *args: Any) -> None:
        return


def pair_interactively(timeout: int = 300) -> bool:
    paired = threading.Event()
    server = ThreadingHTTPServer(("127.0.0.1", 8765), PairHandler)
    server.paired_event = paired  # type: ignore[attr-defined]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    log("Pairing server started")
    webbrowser.open(PAIR_URL)
    success = paired.wait(timeout)
    server.shutdown()
    server.server_close()
    return success


def sync_once(config: dict[str, Any]) -> None:
    session = load_session()
    if not session:
        raise RuntimeError("Bridge is not paired")
    session = refresh_session(session)
    rows = fetch_rows(session)
    habits = build_habits(rows)
    priorities = build_priorities(rows)
    resources = Path(config["resources_dir"])
    write_habit_inc(resources, habits)
    write_daily_inc(resources, priorities, habits)
    refresh_rainmeter(config)
    log(f"Synced {len(habits)} habits and {len(priorities)} priorities")


def main() -> int:
    parser = argparse.ArgumentParser(description="With Little to Rainmeter bridge")
    parser.add_argument("--pair", action="store_true", help="Pair this Windows computer")
    parser.add_argument("--once", action="store_true", help="Run one sync and exit")
    args = parser.parse_args()
    config = load_config()

    if args.pair or not load_session():
        if not pair_interactively():
            log("Pairing timed out")
            return 1

    if args.once:
        sync_once(config)
        return 0

    while True:
        try:
            sync_once(config)
        except Exception as exc:
            log(f"Sync failed: {exc}")
        time.sleep(max(30, int(config.get("poll_seconds", POLL_SECONDS))))


if __name__ == "__main__":
    raise SystemExit(main())
