statusPath = @"d:\Custom\TD\temp\boss-shenshi\syntax-status.txt"
fn writeLine path text = (
    local f = createFile path
    if f != undefined do (
        format "%" (text as string) to:f
        format "\n" to:f
        close f
    )
)
try (
    openLog @"d:\Custom\TD\temp\boss-shenshi\listener.log" mode:"w"
    local r = fileIn @"d:\Custom\TD\tools\max\skin-boss-shenshi.ms"
    writeLine statusPath ("FILEIN " + (r as string))
    closeLog()
) catch (
    writeLine statusPath ("ERR " + (getCurrentException() as string))
    try (
        local f = createFile @"d:\Custom\TD\temp\boss-shenshi\syntax-stack.txt"
        format "%" (getCurrentExceptionStackTrace() as string) to:f
        close f
    ) catch ()
    try (closeLog()) catch ()
)
quitMax quiet:true
