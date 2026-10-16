Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class MaxSend {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hWnd, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll", EntryPoint="SendMessageA", CharSet=CharSet.Ansi)]
  public static extern IntPtr SendText(IntPtr hWnd, int msg, IntPtr wParam, string lParam);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
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
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
  public static IntPtr[] Scintillas(IntPtr root) {
    var list = new System.Collections.Generic.List<IntPtr>();
    EnumChildWindows(root, (h, l) => {
      var cls = new StringBuilder(256);
      GetClassName(h, cls, cls.Capacity);
      if (cls.ToString() == "MXS_Scintilla") list.Add(h);
      return true;
    }, IntPtr.Zero);
    return list.ToArray();
  }
}
'@
$main = [MaxSend]::FindMain(58220)
$panes = [MaxSend]::Scintillas($main)
$best = [IntPtr]::Zero
$bestH = 99999
foreach ($h in $panes) {
  $r = New-Object MaxSend+RECT
  [void][MaxSend]::GetWindowRect($h, [ref]$r)
  $height = $r.B - $r.T
  Write-Output ("pane " + $h + " y=" + $r.T + " h=" + $height + " x=" + $r.L + " w=" + ($r.R - $r.L))
  if ($height -gt 0 -and $height -lt $bestH) { $bestH = $height; $best = $h }
}
Write-Output ("INPUT=" + $best + " h=" + $bestH)
$cmd = 'fileIn @"d:\Custom\TD\tools\max\build-mountains.ms"'
[void][MaxSend]::SendText($best, 2181, [IntPtr]::Zero, $cmd)
[void][MaxSend]::PostMessage($best, 0x0100, [IntPtr]13, [IntPtr]::Zero)
[void][MaxSend]::PostMessage($best, 0x0101, [IntPtr]13, [IntPtr]::Zero)
Write-Output "posted"
