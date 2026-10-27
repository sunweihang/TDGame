#!/usr/bin/env python3
"""为 Cocos assets 下的 .ts 补齐 .meta（已存在则跳过，避免 UUID 漂移）。"""
import json
import sys
import uuid
from pathlib import Path


def _dir_meta(folder: Path) -> None:
    meta = folder.parent / f"{folder.name}.meta"
    if meta.exists():
        return
    meta.write_text(
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
    print("wrote", meta)


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: ensure-ts-metas.py <dir>", file=sys.stderr)
        return 2
    root = Path(sys.argv[1])
    if not root.is_dir():
        print(f"missing dir: {root}", file=sys.stderr)
        return 1
    _dir_meta(root)
    if root.name == "luban":
        _dir_meta(root.parent)
    for p in sorted(root.glob("*.ts")):
        m = Path(str(p) + ".meta")
        if m.exists():
            continue
        m.write_text(
            json.dumps(
                {
                    "ver": "4.0.24",
                    "importer": "typescript",
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
        print("wrote", m)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
