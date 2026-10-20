logPath = @"d:\Custom\TD\temp\mg2-listener.txt"
statusPath = @"d:\Custom\TD\temp\mg2-compile-status.txt"
fn writeLine path text = (
    local f = createFile path
    if f != undefined do (
        format "%\n" text to:f
        close f
    )
)
try (
    writeLine statusPath "RUNNING"
    openLog logPath
    local ok = fileIn @"d:\Custom\TD\tools\max\split-mg2.ms"
    format "fileIn=%\n" ok
    flushLog()
    closeLog()
    writeLine statusPath ("DONE " + (ok as string))
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    format "EX %\n" msg
    try (flushLog()) catch ()
    try (closeLog()) catch ()
    writeLine statusPath ("FAIL " + msg)
)
quitMax quiet:true