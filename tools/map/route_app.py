"""Desktop tool: draw a route on the battlefield and write the road image."""

from __future__ import annotations

import json
import shutil
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox

import cv2
import numpy as np
from PIL import Image, ImageTk

import paint_route


def project_root():
    starts = []
    if getattr(sys, "frozen", False):
        starts.append(Path(sys.executable).resolve().parent)
    starts.append(Path.cwd())
    starts.append(Path(__file__).resolve().parent)
    seen = set()
    for start in starts:
        for folder in [start, *start.parents]:
            key = str(folder)
            if key in seen:
                continue
            seen.add(key)
            if (folder / "assets" / "textures" / "ground" / "battlefield.jpg").is_file():
                return folder
    return None


def battlefield_path(root):
    if root is None:
        return None
    return root / "assets" / "textures" / "ground" / "battlefield.jpg"


def plain_path(root):
    if root is None:
        return None
    path = root / "tools" / "map" / "battlefield-plain.jpg"
    return path if path.is_file() else None


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("战场路线")
        self.configure(bg="#1c1c1c")
        self.root = project_root()
        self.base_path = battlefield_path(self.root)
        self.save_path = self.base_path
        self.base = None
        self.sketch_path = None
        self.strokes = []
        self.current = None
        self.scale = 1.0
        self.photo = None
        self._busy = False

        self.canvas = tk.Canvas(self, bg="#111111", highlightthickness=0, cursor="crosshair")
        self.canvas.grid(row=0, column=0, sticky="nsew")
        side = tk.Frame(self, bg="#1c1c1c", padx=14, pady=14)
        side.grid(row=0, column=1, sticky="ns")
        self.columnconfigure(0, weight=1)
        self.rowconfigure(0, weight=1)

        tk.Label(side, text="战场路线", fg="#f2f2f2", bg="#1c1c1c", font=("Microsoft YaHei UI", 16, "bold")).pack(anchor="w")
        tk.Label(
            side,
            text="按住左键画出怪要走的中心线。\n分叉从主路上连出去。线要细，路宽会自动加上。",
            fg="#c8c8c8",
            bg="#1c1c1c",
            justify="left",
            font=("Microsoft YaHei UI", 10),
        ).pack(anchor="w", pady=(8, 14))

        self._button(side, "生成路线", self.generate, primary=True)
        row = tk.Frame(side, bg="#1c1c1c")
        row.pack(fill="x", pady=(8, 0))
        self._button(row, "撤销", self.undo).pack(side="left")
        self._button(row, "清空", self.clear_strokes).pack(side="left", padx=(8, 0))
        self._button(side, "打开红线图", self.open_sketch).pack(fill="x", pady=(8, 0))
        self._button(side, "打开战场图", self.open_base).pack(fill="x", pady=(8, 0))
        self._button(side, "还原无路原图", self.restore_plain).pack(fill="x", pady=(8, 0))

        tk.Label(side, text="刷怪落点", fg="#f2f2f2", bg="#1c1c1c", font=("Microsoft YaHei UI", 11, "bold")).pack(anchor="w", pady=(18, 6))
        self.report = tk.Text(side, width=32, height=16, bg="#111111", fg="#e6e6e6", relief="flat", font=("Consolas", 10), wrap="word")
        self.report.pack(fill="both", expand=True)
        self.report.configure(state="disabled")

        self.status = tk.StringVar(value="")
        tk.Label(self, textvariable=self.status, fg="#bdbdbd", bg="#1c1c1c", anchor="w", font=("Microsoft YaHei UI", 9)).grid(row=1, column=0, columnspan=2, sticky="ew", padx=8, pady=4)

        self.canvas.bind("<ButtonPress-1>", self.down)
        self.canvas.bind("<B1-Motion>", self.move)
        self.canvas.bind("<ButtonRelease-1>", self.up)

        if self.base_path and self.base_path.is_file():
            self.load_base(self.base_path)
        else:
            self.status.set("没有找到战场图，请先打开一张。")
            self.after(200, self.open_base)

    def _button(self, parent, text, command, primary=False):
        bg = "#d85a2a" if primary else "#2e2e2e"
        fg = "#ffffff"
        button = tk.Button(
            parent,
            text=text,
            command=command,
            bg=bg,
            fg=fg,
            activebackground="#f07a45" if primary else "#3a3a3a",
            activeforeground="#ffffff",
            relief="flat",
            font=("Microsoft YaHei UI", 11, "bold" if primary else "normal"),
            padx=10,
            pady=8 if primary else 4,
        )
        if primary:
            button.pack(fill="x")
        return button

    def set_report(self, text):
        self.report.configure(state="normal")
        self.report.delete("1.0", "end")
        self.report.insert("1.0", text)
        self.report.configure(state="disabled")

    def load_base(self, path, save_path=None):
        self.base_path = Path(path)
        self.save_path = Path(save_path) if save_path is not None else self.base_path
        self.base = Image.open(self.base_path).convert("RGB")
        self.sketch_path = None
        self.strokes = []
        self.current = None
        self.show_image(self.base)
        self.status.set(str(self.base_path))
        self.set_report("画完线后点「生成路线」。")

    def show_image(self, image):
        max_w, max_h = 540, 900
        scale = min(max_w / image.size[0], max_h / image.size[1], 1.0)
        self.scale = scale
        disp_w = max(1, int(image.size[0] * scale))
        disp_h = max(1, int(image.size[1] * scale))
        shown = image.resize((disp_w, disp_h), Image.Resampling.BILINEAR)
        self.photo = ImageTk.PhotoImage(shown)
        self.canvas.configure(width=disp_w, height=disp_h)
        self.canvas.delete("all")
        self.canvas.create_image(0, 0, image=self.photo, anchor="nw", tags="photo")
        self.geometry("{0}x{1}".format(disp_w + 300, disp_h + 36))

    def image_point(self, event):
        if self.base is None:
            return None
        x = min(max(event.x / self.scale, 0), self.base.size[0] - 1)
        y = min(max(event.y / self.scale, 0), self.base.size[1] - 1)
        return x, y

    def down(self, event):
        if self._busy or self.base is None or self.sketch_path is not None:
            return
        point = self.image_point(event)
        if point is None:
            return
        self.current = [point]
        self.strokes.append(self.current)

    def move(self, event):
        if self.current is None:
            return
        point = self.image_point(event)
        if point is None:
            return
        prev = self.current[-1]
        if abs(point[0] - prev[0]) + abs(point[1] - prev[1]) < 1.5:
            return
        self.current.append(point)
        self.canvas.create_line(
            prev[0] * self.scale,
            prev[1] * self.scale,
            point[0] * self.scale,
            point[1] * self.scale,
            fill="#ff3355",
            width=3,
            capstyle="round",
            tags="stroke",
        )

    def up(self, event):
        self.current = None

    def undo(self):
        if self.sketch_path is not None:
            self.sketch_path = None
            if self.base is not None:
                self.show_image(self.base)
            self.status.set("已取消红线图，可以在战场上画。")
            return
        if not self.strokes:
            return
        self.strokes.pop()
        self.redraw_strokes()

    def clear_strokes(self):
        self.strokes = []
        self.current = None
        self.sketch_path = None
        if self.base is not None:
            self.show_image(self.base)

    def redraw_strokes(self):
        if self.base is None:
            return
        self.show_image(self.base)
        for stroke in self.strokes:
            if len(stroke) < 2:
                continue
            flat = []
            for x, y in stroke:
                flat.extend((x * self.scale, y * self.scale))
            self.canvas.create_line(*flat, fill="#ff3355", width=3, capstyle="round", joinstyle="round", tags="stroke")

    def open_base(self):
        path = filedialog.askopenfilename(title="打开战场图", filetypes=[("图片", "*.jpg *.jpeg *.png")])
        if path:
            self.load_base(path)

    def open_sketch(self):
        if self.base is None:
            messagebox.showinfo("战场路线", "先打开战场图。红线要画在这张图上。")
            return
        path = filedialog.askopenfilename(title="打开画了红线的图", filetypes=[("图片", "*.jpg *.jpeg *.png")])
        if not path:
            return
        self.sketch_path = Path(path)
        self.strokes = []
        sketch = Image.open(self.sketch_path).convert("RGB")
        self.show_image(sketch)
        self.status.set("将用这张红线图生成：" + str(self.sketch_path))

    def restore_plain(self):
        path = plain_path(self.root)
        if path is None:
            messagebox.showinfo("战场路线", "没有找到无路原图 tools/map/battlefield-plain.jpg。")
            return
        game = battlefield_path(self.root)
        self.load_base(path, save_path=game or path)
        self.status.set("已载入无路原图。生成后写入战场图。")

    def sketch_image(self):
        if self.sketch_path is not None:
            return Image.open(self.sketch_path).convert("RGB")
        canvas = np.asarray(self.base).copy()
        drawn = 0
        for stroke in self.strokes:
            if len(stroke) < 2:
                continue
            pts = np.round(np.array(stroke)).astype(np.int32)
            cv2.polylines(canvas, [pts], False, (235, 42, 58), 6, cv2.LINE_8)
            drawn += 1
        if drawn == 0:
            return None
        return Image.fromarray(canvas)

    def generate(self):
        if self._busy or self.base is None:
            return
        sketch = self.sketch_image()
        if sketch is None:
            messagebox.showinfo("战场路线", "先在图上画出路线，或打开一张画了红线的图。")
            return
        self._busy = True
        self.status.set("正在生成路线…")
        base = self.base.copy()
        target = self.save_path

        def work():
            try:
                painted, _rgba, doc, summary = paint_route.build_route(sketch, base)
            except SystemExit as exc:
                self.after(0, lambda: self.fail(str(exc)))
                return
            except Exception as exc:
                self.after(0, lambda: self.fail(str(exc)))
                return
            self.after(0, lambda: self.finish(painted, doc, summary, target))

        threading.Thread(target=work, daemon=True).start()

    def fail(self, message):
        self._busy = False
        self.status.set("生成失败")
        messagebox.showerror("战场路线", message or "没能从红线里找出路线。")

    def finish(self, painted, doc, summary, target):
        self._busy = False
        if target is None:
            save = filedialog.asksaveasfilename(title="保存战场图", defaultextension=".jpg", filetypes=[("JPEG", "*.jpg")])
            if not save:
                self.status.set("已生成，但没有选择保存位置。")
                self.base = painted
                self.show_image(painted)
                return
            target = Path(save)
        elif target.is_file():
            if self.root is not None and target == battlefield_path(self.root):
                backup = self.root / "tools" / "map" / "work" / "battlefield-before.jpg"
                backup.parent.mkdir(parents=True, exist_ok=True)
            else:
                backup = target.with_name(target.stem + "-before" + target.suffix)
            shutil.copyfile(target, backup)
        painted.save(target, quality=94, subsampling=1)
        route_file = target.with_name("route.json")
        if self.root is not None and target == battlefield_path(self.root):
            route_file = self.root / "tools" / "map" / "work" / "route.json"
            route_file.parent.mkdir(parents=True, exist_ok=True)
        doc["base"] = str(target)
        route_file.write_text(json.dumps(doc, indent=2), encoding="utf-8")
        self.base_path = target
        self.base = painted
        self.sketch_path = None
        self.strokes = []
        self.show_image(painted)
        lines = ["已写入", str(target), "", "坐标 route.json", str(route_file), ""]
        for branch in summary["branches"]:
            spot = branch["planeEnd"] or branch["end"]
            lines.append("{0}  ({1}, {2})".format(branch["name"], spot["x"], spot["z"]))
        self.set_report("\n".join(lines))
        self.status.set("路线已写入战场图。")


def main():
    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()
