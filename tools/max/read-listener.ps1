Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class ReadSci {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hWnd, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll", EntryPoint="SendMessageW")] public static extern IntPtr SendMsg(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", EntryPoint="SendMessageA", CharSet=CharSet.Ansi)] public static extern IntPtr SendText(IntPtr hWnd, int msg, IntPtr wParam, StringBuilder lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public static List<string> Read(uint pid) {
    var roots = new List<IntPtr>();
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid) roots.Add(h);
      return true;
    }, IntPtr.Zero);
    var lines = new List<string>();
    foreach (var root in roots) {
      var title = new StringBuilder(300);
      GetWindowText(root, title, title.Capacity);
      EnumChildWindows(root, (h, l) => {
        var cls = new StringBuilder(200);
        GetClassName(h, cls, cls.Capacity);
        if (cls.ToString() != "MXS_Scintilla") return true;
        RECT r; GetWindowRect(h, out r);
        int len = (int)SendMsg(h, 2006, IntPtr.Zero, IntPtr.Zero);
        var sb = new StringBuilder(Math.Max(len + 8, 16));
        SendText(h, 2182, (IntPtr)(sb.Capacity), sb);
        string text = sb.ToString();
        if (text.Length > 400) text = text.Substring(0, 400);
        lines.Add("SCI " + h.ToInt64() + " " + (r.R-r.L) + "x" + (r.B-r.T) + " len=" + len + " parentTitle=" + title);
        if (text.Length > 0) lines.Add(text.Replace("\r", "\\r").Replace("\n", " | "));
        return true;
      }, IntPtr.Zero);
    }
    return lines;
  }
}
'@
$lines = [ReadSci]::Read(63688)
Write-Output ("count=" + $lines.Count)
foreach ($line in $lines) { Write-Output $line }
