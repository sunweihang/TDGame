statusPath = @"d:\Custom\TD\temp\boss-shenshi\fit3-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\fit3-stats.txt"
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
fn bipPos node = (
    local p = undefined
    try (p = node.pos) catch ()
    if p == undefined do try (p = node.transform.position) catch ()
    p
)
fn fmt p = (
    if p == undefined then "none" else ((p.x as string) + " " + (p.y as string) + " " + (p.z as string))
)
try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    resetMaxFile #noPrompt
    biped.createNew 80 280 [0,0,0] arms:true neckLinks:1 spineLinks:3 legLinks:3 tailLinks:0 ponytail1Links:0 ponytail2Links:0 fingers:1 fingerLinks:1 toes:1 toeLinks:1 trianglePelvis:true forearmTwistLinks:0 upperarmTwistLinks:0 thighTwistLinks:0 calfTwistLinks:0 prop1:false prop2:false prop3:false horseLink:false nubs:false
    local root = undefined
    for o in objects where classOf o == Biped_Object and o.parent == undefined do root = o
    local ctrl = root.controller
    ctrl.figureMode = true
    ctrl.height = 280
    local uarm = getNodeByName "Bip001 L UpperArm" exact:true
    note ("before " + (fmt (bipPos uarm)))
    local tm = uarm.transform
    tm.row4 = [85,1,221]
    try (
        biped.setTransform uarm tm false
        note ("matrix " + (fmt (bipPos uarm)))
    ) catch ( note ("matrixERR " + (getCurrentException() as string)) )
    try (
        uarm.pos = [90,2,210]
        note ("pos " + (fmt (bipPos uarm)))
    ) catch ( note ("posERR " + (getCurrentException() as string)) )
    try (
        in coordsys world move uarm ([100,0,200] - (bipPos uarm))
        note ("move " + (fmt (bipPos uarm)))
    ) catch ( note ("moveERR " + (getCurrentException() as string)) )
    local thigh = getNodeByName "Bip001 L Thigh" exact:true
    note ("thigh0 " + (fmt (bipPos thigh)))
    try (
        thigh.pos = [50,-8,105]
        note ("thighPos " + (fmt (bipPos thigh)))
    ) catch ( note ("thighERR " + (getCurrentException() as string)) )
    writeLine statusPath "OK"
) catch (
    note ("ERR " + (getCurrentException() as string))
    writeLine statusPath "FAIL"
)
quitMax quiet:true
