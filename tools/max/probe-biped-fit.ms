statusPath = @"d:\Custom\TD\temp\boss-shenshi\fit-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\fit-stats.txt"
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
    local made = biped.createNew 80 280 [0,0,0] arms:true neckLinks:1 spineLinks:3 legLinks:3 tailLinks:0 ponytail1Links:0 ponytail2Links:0 fingers:1 fingerLinks:1 toes:1 toeLinks:1 trianglePelvis:true forearmTwistLinks:0 upperarmTwistLinks:0 thighTwistLinks:0 calfTwistLinks:0 prop1:false prop2:false prop3:false horseLink:false nubs:false
    local root = undefined
    for o in objects where classOf o == Biped_Object and o.parent == undefined do root = o
    local ctrl = root.controller
    ctrl.figureMode = true
    ctrl.rubberBandMode = true
    ctrl.height = 280
    fn bn part = ( getNodeByName ("Bip001 " + part) exact:true )
    for part in #("Pelvis","Spine","Spine1","Spine2","Neck","Head","L Clavicle","L UpperArm","L Forearm","L Hand","L Finger0","L Thigh","L Calf","L Foot","L Toe0") do (
        local nd = bn part
        note ("base " + part + " " + (fmt (bipPos nd)))
    )
    local thigh = bn "L Thigh"
    local calf = bn "L Calf"
    local baseCalf = bipPos calf
    for sc in #([2,1,1],[1,2,1],[1,1,2],[0.4,1,1],[1,0.4,1],[1,1,0.4]) do (
        biped.setTransform thigh #scale sc false
        note ("scale " + (sc as string) + " calf " + (fmt (bipPos calf)) + " d " + ((distance (bipPos calf) baseCalf) as string))
        biped.setTransform thigh #scale [1,1,1] false
    )
    local hand = bn "L Hand"
    biped.setTransform hand #pos [140,5,80] false
    note ("handNow " + (fmt (bipPos hand)))
    note ("uarm " + (fmt (bipPos (bn "L UpperArm"))))
    note ("farm " + (fmt (bipPos (bn "L Forearm"))))
    local foot = bn "L Foot"
    biped.setTransform foot #pos [45,-5,20] false
    note ("footNow " + (fmt (bipPos foot)))
    note ("thigh " + (fmt (bipPos thigh)))
    note ("calf " + (fmt (bipPos calf)))
    writeLine statusPath "OK"
) catch (
    note ("ERR " + (getCurrentException() as string))
    writeLine statusPath "FAIL"
)
quitMax quiet:true
