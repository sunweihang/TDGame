statusPath = @"d:\Custom\TD\temp\boss-shenshi\sweep-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\sweep-stats.txt"
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
    try (p = node.transform.position) catch ()
    p
)
fn fmt p = (
    if p == undefined then "none" else ((p.x as string) + " " + (p.y as string) + " " + (p.z as string))
)
try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    for pair in #([120,260],[160,300],[200,320],[240,340],[280,360],[100,352]) do (
        resetMaxFile #noPrompt
        biped.createNew pair[1] pair[2] [0,0,0] arms:true neckLinks:1 spineLinks:3 legLinks:3 tailLinks:0 ponytail1Links:0 ponytail2Links:0 fingers:1 fingerLinks:1 toes:1 toeLinks:1 trianglePelvis:true forearmTwistLinks:0 upperarmTwistLinks:0 thighTwistLinks:0 calfTwistLinks:0 prop1:false prop2:false prop3:false horseLink:false nubs:false
        local root = undefined
        for o in objects where classOf o == Biped_Object and o.parent == undefined do root = o
        local ctrl = root.controller
        ctrl.figureMode = true
        ctrl.height = pair[2]
        fn bn part = ( getNodeByName ("Bip001 " + part) exact:true )
        note ("SIZE " + (pair as string))
        for part in #("Pelvis","Head","L UpperArm","L Hand","L Thigh","L Calf","L Foot") do (
            note ("  " + part + " " + (fmt (bipPos (bn part))))
        )
    )
    writeLine statusPath "OK"
) catch (
    note ("ERR " + (getCurrentException() as string))
    writeLine statusPath "FAIL"
)
quitMax quiet:true
