statusPath = @"d:\Custom\TD\temp\boss-shenshi\fit2-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\fit2-stats.txt"
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
    if node == undefined then return undefined
    local p = undefined
    try (p = node.pos) catch ()
    if p == undefined do try (p = node.transform.position) catch ()
    if p == undefined do try (p = biped.getTransform node #pos) catch ()
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
    biped.createNew 90 400 [0,0,0] arms:true neckLinks:1 spineLinks:3 legLinks:3 tailLinks:0 ponytail1Links:0 ponytail2Links:0 fingers:1 fingerLinks:1 toes:1 toeLinks:1 trianglePelvis:true forearmTwistLinks:0 upperarmTwistLinks:0 thighTwistLinks:0 calfTwistLinks:0 prop1:false prop2:false prop3:false horseLink:false nubs:false
    local root = undefined
    for o in objects where classOf o == Biped_Object and o.parent == undefined do root = o
    local ctrl = root.controller
    ctrl.figureMode = true
    ctrl.rubberBandMode = true
    ctrl.height = 400
    fn bn part = ( getNodeByName ("Bip001 " + part) exact:true )
    for part in #("Pelvis","Head","L UpperArm","L Forearm","L Hand","L Thigh","L Calf","L Foot") do note ("base " + part + " " + (fmt (bipPos (bn part))))
    local hand = bn "L Hand"
    local goal = [140,5,90]
    for i = 1 to 12 do (
        local p = bipPos hand
        local step = p + (goal - p) * 0.45
        biped.setTransform hand #pos step false
        note ("hand " + (i as string) + " " + (fmt (bipPos hand)))
    )
    note ("uarm " + (fmt (bipPos (bn "L UpperArm"))))
    note ("farm " + (fmt (bipPos (bn "L Forearm"))))
    local foot = bn "L Foot"
    local fgoal = [48,-8,22]
    for i = 1 to 8 do (
        local p = bipPos foot
        biped.setTransform foot #pos (p + (fgoal - p) * 0.5) false
    )
    note ("foot " + (fmt (bipPos foot)))
    note ("thigh2 " + (fmt (bipPos (bn "L Thigh"))))
    note ("calf2 " + (fmt (bipPos (bn "L Calf"))))
    local calf = bn "L Calf"
    biped.setTransform calf #pos [50,10,63] false
    note ("calf3 " + (fmt (bipPos calf)))
    note ("foot3 " + (fmt (bipPos foot)))
    writeLine statusPath "OK"
) catch (
    note ("ERR " + (getCurrentException() as string))
    writeLine statusPath "FAIL"
)
quitMax quiet:true
