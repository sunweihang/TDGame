statusPath = @"d:\Custom\TD\temp\boss-shenshi\bip-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\bip-stats.txt"
fn writeLine path text = (
    local f = createFile path
    if f != undefined do (
        format "%" (text as string) to:f
        format "\n" to:f
        close f
    )
)
fn note s = (
    local f = openFile statsPath mode:"a"
    if f == undefined then f = createFile statsPath
    if f != undefined do (
        format "%" (s as string) to:f
        format "\n" to:f
        close f
    )
)
try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    resetMaxFile #noPrompt
    local names = getPropNames biped
    note ("count " + (names.count as string))
    for n in names do note ("biprop " + (n as string))
    local made = biped.createNew 80 280 [0,0,0]
    local root = undefined
    for o in objects where classOf o == Biped_Object and o.parent == undefined do root = o
    note ("root " + root.name + " class " + ((classOf root.controller) as string))
    local cnames = getPropNames root.controller
    for n in cnames do note ("ctrl " + (n as string))
    try (
        root.controller.figureMode = true
        note "figureMode prop set"
    ) catch (
        note ("figprop " + (getCurrentException() as string))
    )
    writeLine statusPath "OK"
) catch (
    note ("ERR " + (getCurrentException() as string))
    writeLine statusPath "FAIL"
)
quitMax quiet:true
