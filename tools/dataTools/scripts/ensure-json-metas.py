#!/usr/bin/env python3
"""为 Cocos resources 下的 json 补齐 .meta（已存在则跳过）。"""
import json
import sys
import uuid
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: ensure-json-metas.py <dir>", file=sys.stderr)
        return 2
    root = Path(sys.argv[1])
    if not root.is_dir():
        print(f"missing dir: {root}", file=sys.stderr)
        return 1
    folder_meta = root.parent / f"{root.name}.meta"
    if not folder_meta.exists():
        folder_meta.write_text(
            json.dumps(
                {
                    "ver": "1.2.0",
                    "importer": "directory",
                    "imported": True,
                    "uuid": str(uuid.uuid4()),
                    "files": [],
                    "subMetas": {},
                    "userData": {},
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print("wrote", folder_meta)
    config_dir = root.parent
    if config_dir.name == "config":
        config_meta = config_dir.parent / "config.meta"
        if not config_meta.exists():
            config_meta.write_text(
                json.dumps(
                    {
                        "ver": "1.2.0",
                        "importer": "directory",
                        "imported": True,
                        "uuid": str(uuid.uuid4()),
                        "files": [],
                        "subMetas": {},
                        "userData": {},
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
            print("wrote", config_meta)
    for p in sorted(root.glob("*.json")):
        m = p.with_suffix(".json.meta")
        if m.exists():
            continue
        m.write_text(
            json.dumps(
                {
                    "ver": "2.0.1",
                    "importer": "json",
                    "imported": True,
                    "uuid": str(uuid.uuid4()),
                    "files": [".json"],
                    "subMetas": {},
                    "userData": {},
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print("wrote", m)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
