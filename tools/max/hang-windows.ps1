Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class HangWin {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hWnd, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  public static List<string> List(uint pid) {
    var lines = new List<string>();
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p != pid) return true;
      var title = new StringBuilder(400);
      var cls = new StringBuilder(200);
      GetWindowText(h, title, title.Capacity);
      GetClassName(h, cls, cls.Capacity);
      lines.Add("ROOT vis=" + IsWindowVisible(h) + " class=" + cls + " title=" + title);
      EnumChildWindows(h, (c, l2) => {
        var ct = new StringBuilder(300);
        var cc = new StringBuilder(200);
        GetWindowText(c, ct, ct.Capacity);
        GetClassName(c, cc, cc.Capacity);
        if (ct.Length > 0) lines.Add("  child class=" + cc + " title=" + ct);
        return true;
      }, IntPtr.Zero);
      return true;
    }, IntPtr.Zero);
    return lines;
  }
}
'@
$lines = [HangWin]::List(42372)
Write-Output ("count=" + $lines.Count)
foreach ($line in $lines) { Write-Output $line }
