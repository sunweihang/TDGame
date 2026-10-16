Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class MaxScan {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hWnd, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  public static List<string> All(uint pid) {
    var roots = new List<IntPtr>();
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid) roots.Add(h);
      return true;
    }, IntPtr.Zero);
    var lines = new List<string>();
    foreach (var root in roots) {
      var title = new StringBuilder(300);
      var cls = new StringBuilder(200);
      GetWindowText(root, title, title.Capacity);
      GetClassName(root, cls, cls.Capacity);
      RECT rr; GetWindowRect(root, out rr);
      string rt = title.ToString();
      if (rt.Length > 0) lines.Add("ROOT " + root.ToInt64() + " vis=" + IsWindowVisible(root) + " " + (rr.R-rr.L) + "x" + (rr.B-rr.T) + " class=" + cls + " title=" + rt);
      EnumChildWindows(root, (h, l) => {
        var c = new StringBuilder(200);
        GetClassName(h, c, c.Capacity);
        if (c.ToString() != "MXS_Scintilla") return true;
        RECT r; GetWindowRect(h, out r);
        lines.Add("  SCI " + h.ToInt64() + " vis=" + IsWindowVisible(h) + " " + (r.R-r.L) + "x" + (r.B-r.T) + " y=" + r.T + " parent=" + root.ToInt64());
        return true;
      }, IntPtr.Zero);
    }
    return lines;
  }
}
'@
$lines = [MaxScan]::All(58220)
Write-Output ("count=" + $lines.Count)
foreach ($line in $lines) { Write-Output $line }
