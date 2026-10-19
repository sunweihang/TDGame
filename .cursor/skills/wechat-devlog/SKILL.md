---
name: wechat-devlog
description: >-
  Write the next 从零到一 3D塔防 WeChat article as paste-ready HTML plus a short
  digest. Use when the user says 公众号, 微信文章, Day 稿, 摘要, 导入公众号,
  or asks to turn today's work into docs/wechat.
---

# WeChat devlog

Series title: `从零到一实战3D塔防微信小游戏 DayN`.
Files live in `docs/wechat/dayN.html`. Day3 is the layout source. The next article is the next integer. Do not skip or reuse a number.

## Write the day

1. Read the latest `docs/wechat/day*.html` and this skill.
2. Collect what landed today from `git log` and the finished behavior. Leave in-progress work out. A withdrawn experiment gets one sentence only when that withdrawal is part of the day.
3. Choose three goals. Each goal is a title plus one sentence. The three chapters use the same three goals, in the same order.
4. Write professional Chinese. Use 已完成、校正、撤回. Do not use 糊、难看、往上窜、搞啥, or other spoken wording.
5. Copy `docs/wechat/day3.html` to `docs/wechat/dayN.html` and replace the text. Keep the visual system. Do not invent a new layout, and do not put the design in a `<style>` block.
6. Count the digest with `node -e`. Keep it near 50 characters and never over 120.
7. Reply with the absolute html path and the digest on its own line. Tell the user to open the file in Chrome or Edge and copy the rendered page. Copying the source drops the formatting.

## Article shape

- Top bar, `DAY N` badge, kicker `从零到一 · 3D 塔防`, title, gold rule.
- One opening paragraph: what the previous day finished, then what this day adds.
- `今日目标`: three separate cards, numbered 01, 02, 03.
- Three chapters. Each chapter is a dark bar, a green scope note, then gold-ruled subsections.
- A `配图` slot only where a screenshot belongs. Captions state what the picture shows. Do not generate the picture.
- Close with the dark `最终效果` video slot, the open-source block, and `关于作者`.
- Open-source URL: `https://github.com/sunweihang/TDGame`.
- Do not mention skills, checks, or agent transcripts.

## Paste-safe layout

WeChat keeps inline `style` and drops stylesheets, tables, flex, grid, and positioned elements. Day3 already follows this. Preserve it:

- Tags: `section`, `p`, `span`, `a`.
- Properties: `color`, `background`, `font-size`, `font-weight`, `margin`, `padding`, `border`, `border-radius`, `text-align`, `line-height`, `letter-spacing`.
- Colors: teal `#0f6e62`, gold `#e0b56a`, ink `#1c1915`, body `#3f3a34`, card `#f7f5f0`, note `#f3faf7`, video `#14312c`.

## Digest

The digest is for the 公众号摘要 box. It is not the opening paragraph.

Match this shape, including the day number:

```
Day3 已完成机枪炮塔 10001、等距种塔与战斗反馈。可选激光炮或机枪种下，受击后显示血条与伤害数字。
```

Two sentences. First sentence: DayN 已完成 A、B 与 C. Second sentence: what the player sees. The account already sets 原创, author `AI独游大魔玩`, and 快捷转载. Do not repeat those in the html.
