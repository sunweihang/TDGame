#!/usr/bin/env python3
"""Write the 3-choice Luban workbooks, then export with tools\\dataTools\\export.bat.

kind:  1 plant, 2 upgrade, 3 stat
stat:  0 none, 1 atk, 2 def, 3 hp, 4 speed, 5 crit, 6 gold, 7 range
rarity: 0 common, 1 rare, 2 epic
Plant titles may contain {name}. A plant always uses the first id of the line.
turret_id 0 rolls a line; a later id still plants that line's level 1.
Tiers are comma-separated turret ids, lowest level first.
"""
from __future__ import annotations

from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[3]
DATAS = ROOT / "config" / "luban" / "Datas"

# id, name, tiers, plant_weight, icon
LINES = [
    (1, "机枪", "10010,10011,10012", 100, "ui/ability/icon-attack"),
    (2, "喷火", "10005,10006,10007", 100, "ui/ability/icon-attack"),
    (3, "冰炮", "10008,10009,10013", 100, "ui/ability/icon-swift"),
    (4, "电磁", "10014,10015,10016", 100, "ui/ability/icon-swift"),
    (5, "激光", "10000", 40, "ui/ability/icon-attack"),
    (6, "旧式机枪", "10001", 15, "ui/ability/icon-attack"),
    (7, "双管", "10002", 25, "ui/ability/icon-attack"),
    (8, "九管", "10004", 25, "ui/ability/icon-attack"),
]

# id, kind, weight, rarity, title, desc, cost, icon, stat, value, percent, max_stack, turret_id
CARDS = [
    (1, 1, 100, 1, "种植·{name}", "点选空底座种下{name}", 80, "ui/ability/icon-attack", 0, 0, False, 0, 0),
    (2, 2, 80, 2, "升级炮塔", "点选一座炮塔，升到下一级", 150, "ui/ability/icon-swift", 0, 0, False, 0, 0),
    (3, 3, 100, 0, "攻击强化", "全体伤害 +15%", 50, "ui/ability/icon-attack", 1, 15, True, 8, 0),
    (4, 3, 100, 0, "防御强化", "城门受伤 -12%", 50, "ui/ability/icon-gold", 2, 12, True, 6, 0),
    (5, 3, 90, 0, "城门加固", "城门生命 +4000", 60, "ui/ability/icon-gold", 3, 4000, False, 6, 0),
    (6, 3, 70, 1, "迅捷射击", "射速 +12%", 120, "ui/ability/icon-swift", 4, 12, True, 5, 0),
    (7, 3, 60, 1, "暴击强化", "暴击率 +8%", 140, "ui/ability/icon-swift", 5, 8, True, 5, 0),
    (8, 3, 50, 2, "金币加成", "击杀金币 +25%", 180, "ui/ability/icon-gold", 6, 25, True, 4, 0),
    (9, 3, 55, 1, "射程扩展", "炮塔射程 +15%", 120, "ui/ability/icon-attack", 7, 15, True, 4, 0),
    (10, 3, 40, 2, "强攻", "全体伤害 +28%", 220, "ui/ability/icon-attack", 1, 28, True, 3, 0),
]

# id, offer_count, reroll_gold, free_reroll, distinct_kind
RULES = [
    (1, 3, 40, 1, True),
]


def _wb(rows: list[tuple]) -> openpyxl.Workbook:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "build"
    for row in rows:
        ws.append(list(row))
    return wb


def write_table(path: Path, header: list[tuple], data: list[tuple]) -> None:
    rows = list(header)
    for item in data:
        rows.append((None,) + tuple(item))
    DATAS.mkdir(parents=True, exist_ok=True)
    _wb(rows).save(path)
    print("wrote", path, "rows", len(data))


def write_schema() -> None:
    DATAS.mkdir(parents=True, exist_ok=True)
    _wb(
        [
            (
                "##var",
                "full_name",
                "value_type",
                "read_schema_from_file",
                "input",
                "index",
                "mode",
                "group",
                "comment",
                "tags",
                "output",
            ),
            ("##", "全名", "记录类名", "从excel读定义", "文件列表", "表id字段", "模式", "分组", "注释", None, "输出文件名"),
            ("##", None, None, "false取已有定义，true从excel读", "可逗号分隔", "空则取首字段", "one|map|list", "c|s|e", None, None, "默认 module_name"),
            (None, "TbPickRule", "CPickRule", True, "pick_rule.xlsx", "id", "map", "c", "三选一规则", None, None),
            (None, "TbTurretLine", "CTurretLine", True, "turret_line.xlsx", "id", "map", "c", "炮塔升级链", None, None),
            (None, "TbPickCard", "CPickCard", True, "pick_card.xlsx", "id", "map", "c", "三选一卡池", None, None),
        ]
    ).save(DATAS / "__tables__.xlsx")
    _wb(
        [
            ("##var", "full_name", "parent", "valueType", "alias", "sep", "comment", "tags", "group", "*fields", None, None, None, None, None, None),
            ("##var", None, None, None, None, None, None, None, None, "name", "alias", "type", "group", "comment", "tags", "variants"),
            ("##", "全名", "父类", "是否值类型", "别名", "分割符", None, None, None, "字段名", "别名", "类型", "分组", "注释", None, None),
        ]
    ).save(DATAS / "__beans__.xlsx")
    _wb(
        [
            ("##var", "full_name", "flags", "unique", "group", "comment", "tags", "*items", None, None, None, None),
            ("##var", None, None, None, None, None, None, "name", "alias", "value", "comment", "tags"),
            ("##", "全名", "是否标志类", "枚举项是否唯一", None, None, None, "枚举名", "别名", "值", "注释", None),
        ]
    ).save(DATAS / "__enums__.xlsx")
    print("wrote schema books")


def main() -> int:
    write_schema()
    write_table(
        DATAS / "pick_rule.xlsx",
        [
            ("##var", "id", "offer_count", "reroll_gold", "free_reroll", "distinct_kind"),
            ("##", None, None, None, None, None),
            ("##type", "int", "int", "int", "int", "bool"),
            ("##group", "c", "c", "c", "c", "c"),
            ("##", "编号", "每次张数", "换一换金币", "免费换次数", "优先不同种类"),
        ],
        RULES,
    )
    write_table(
        DATAS / "turret_line.xlsx",
        [
            ("##var", "id", "name", "tiers", "plant_weight", "icon"),
            ("##", None, None, None, None, None),
            ("##type", "int", "string", "string", "int", "string"),
            ("##group", "c", "c", "c", "c", "c"),
            ("##", "编号", "名称", "等级链", "种植权重", "图标"),
        ],
        LINES,
    )
    write_table(
        DATAS / "pick_card.xlsx",
        [
            (
                "##var",
                "id",
                "kind",
                "weight",
                "rarity",
                "title",
                "desc",
                "cost",
                "icon",
                "stat",
                "value",
                "percent",
                "max_stack",
                "turret_id",
            ),
            ("##",) + (None,) * 13,
            (
                "##type",
                "int",
                "int",
                "int",
                "int",
                "string",
                "string",
                "int",
                "string",
                "int",
                "int",
                "bool",
                "int",
                "int",
            ),
            ("##group",) + ("c",) * 13,
            (
                "##",
                "编号",
                "种类",
                "权重",
                "稀有度",
                "标题",
                "描述",
                "金币",
                "图标",
                "属性",
                "数值",
                "百分比",
                "叠加上限",
                "指定炮塔",
            ),
        ],
        CARDS,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
