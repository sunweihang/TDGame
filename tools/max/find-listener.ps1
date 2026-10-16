Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class MaxUi {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hWnd, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  public static IntPtr FindMain(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p != pid) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, sb.Capacity);
      if (sb.ToString().IndexOf("Autodesk 3ds Max", StringComparison.Ordinal) >= 0) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static List<string> Dump(IntPtr root) {
    var lines = new List<string>();
    EnumChildWindows(root, (h, l) => {
      var cls = new StringBuilder(256);
      var title = new StringBuilder(200);
      GetClassName(h, cls, cls.Capacity);
      GetWindowText(h, title, title.Capacity);
      string c = cls.ToString();
      string t = title.ToString();
      bool keep = c.IndexOf("Scintilla", StringComparison.OrdinalIgnoreCase) >= 0
        || c.IndexOf("Edit", StringComparison.OrdinalIgnoreCase) >= 0
        || c.IndexOf("MXS", StringComparison.OrdinalIgnoreCase) >= 0
        || c.IndexOf("Rich", StringComparison.OrdinalIgnoreCase) >= 0
        || t.IndexOf("MAXScript", StringComparison.OrdinalIgnoreCase) >= 0
        || t.IndexOf("Listener", StringComparison.OrdinalIgnoreCase) >= 0;
      if (keep) lines.Add(h.ToInt64() + " vis=" + IsWindowVisible(h) + " class=" + c + " title=" + t);
      return true;
    }, IntPtr.Zero);
    return lines;
  }
}
'@
$main = [MaxUi]::FindMain(58220)
Write-Output ("MAIN=" + $main)
[MaxUi]::Dump($main)
