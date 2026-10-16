statusPath = @"d:\Custom\TD\temp\creature-optimize\export-fixed-status.txt"
outPath = @"d:\Custom\TD\temp\creature-optimize\fantasy_creature_optimized.fbx"
fn writeLine path text = (
    local f = createFile path
    if f != undefined do (
        format "%\n" text to:f
        close f
    )
)
try (
    writeLine statusPath "RUNNING"
    local geos = for o in geometry where (superClassOf o == GeometryClass) collect o
    select geos
    try (FBXExporterSetParam "Animation" false) catch ()
    try (FBXExporterSetParam "Cameras" false) catch ()
    try (FBXExporterSetParam "Lights" false) catch ()
    try (FBXExporterSetParam "EmbedTextures" true) catch ()
    try (FBXExporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXExporterSetParam "UpAxis" "Y") catch ()
    local exported = exportFile outPath #noPrompt selectedOnly:true using:FBXEXP
    writeLine statusPath ("OK " + (exported as string))
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    writeLine statusPath ("FAIL " + msg)
)
