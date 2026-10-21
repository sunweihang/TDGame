statusPath = @"d:\Custom\TD\temp\boss-shenshi\fit11-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\fit11-stats.txt"
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
    try (p = node.transform.position) catch ()
    p
)
fn fmt p = (
    if p == undefined then "none" else ((p.x as string) + " " + (p.y as string) + " " + (p.z as string))
)
fn bn part = (
    getNodeByName ("Bip001 " + part) exact:true
)
fn aimLink bone child target = (
    if bone == undefined or child == undefined or target == undefined then return false
    local a = bipPos bone
    local b = bipPos child
    if a == undefined or b == undefined then return false
    local cur = b - a
    local want = target - a
    local curLen = length cur
    local wantLen = length want
    if curLen < 0.001 or wantLen < 0.001 then return false
    local curN = cur / curLen
    local wantN = want / wantLen
    local axis = cross curN wantN
    local d = dot curN wantN
    if d > 1.0 do d = 1.0
    if d < -1.0 do d = -1.0
    local ang = acos d
    if (length axis) > 0.0001 and ang > 0.25 do (
        local ax = axis / (length axis)
        in coordsys world rotate bone (angleaxis ang ax)
    )
    a = bipPos bone
    b = bipPos child
    if a == undefined or b == undefined then return false
    curLen = distance a b
    wantLen = distance a target
    if curLen > 0.001 and abs (wantLen - curLen) > 0.4 do (
        local sc = biped.getTransform bone #scale
        local f = wantLen / curLen
        if f < 0.25 do f = 0.25
        if f > 5.0 do f = 5.0
        biped.setTransform bone #scale [sc.x * f, sc.y, sc.z] false
    )
    true
)
fn aimArm side shoulder elbow wrist fist = (
    for i = 1 to 5 do (
        aimLink (bn (side + " Clavicle")) (bn (side + " UpperArm")) shoulder
        aimLink (bn (side + " UpperArm")) (bn (side + " Forearm")) elbow
        aimLink (bn (side + " Forearm")) (bn (side + " Hand")) wrist
        aimLink (bn (side + " Hand")) (bn (side + " Finger0")) fist
    )
    note (side + " " + (fmt (bipPos (bn (side + " UpperArm")))) + " | " + (fmt (bipPos (bn (side + " Forearm")))) + " | " + (fmt (bipPos (bn (side + " Hand")))) + " | " + (fmt (bipPos (bn (side + " Finger0")))))
)
fn poseLeg side knee ankle toe = (
    local thigh = bn (side + " Thigh")
    local calf = bn (side + " Calf")
    local foot = bn (side + " Foot")
    local toeN = bn (side + " Toe0")
    for i = 1 to 4 do (
        aimLink thigh calf knee
        aimLink calf foot ankle
        aimLink foot toeN toe
    )
    local qT = biped.getTransform thigh #rotation
    local scT = biped.getTransform thigh #scale
    local qC = biped.getTransform calf #rotation
    local scC = biped.getTransform calf #scale
    local qF = biped.getTransform foot #rotation
    local scF = biped.getTransform foot #scale
    local qO = biped.getTransform toeN #rotation
    local scO = biped.getTransform toeN #scale
    local bestErr = 1e9
    local bestAng = 0.0
    for ang = -180.0 to 180.0 by 15.0 do (
        biped.setTransform thigh #rotation qT false
        biped.setTransform thigh #scale scT false
        biped.setTransform calf #rotation qC false
        biped.setTransform calf #scale scC false
        biped.setTransform foot #rotation qF false
        biped.setTransform foot #scale scF false
        biped.setTransform toeN #rotation qO false
        biped.setTransform toeN #scale scO false
        if abs ang > 0.1 and abs (abs ang - 180.0) > 0.1 do (
            in coordsys local rotate thigh (angleaxis ang [1,0,0])
        )
        local ferr = distance (bipPos foot) ankle
        if ferr < bestErr do (
            bestErr = ferr
            bestAng = ang
        )
    )
    biped.setTransform thigh #rotation qT false
    biped.setTransform thigh #scale scT false
    biped.setTransform calf #rotation qC false
    biped.setTransform calf #scale scC false
    biped.setTransform foot #rotation qF false
    biped.setTransform foot #scale scF false
    biped.setTransform toeN #rotation qO false
    biped.setTransform toeN #scale scO false
    if abs bestAng > 0.1 and abs (abs bestAng - 180.0) > 0.1 do (
        in coordsys local rotate thigh (angleaxis bestAng [1,0,0])
    )
    for i = 1 to 3 do aimLink foot toeN toe
    note (side + " ang " + (bestAng as string) + " knee " + ((distance (bipPos calf) knee) as string) + " foot " + ((distance (bipPos foot) ankle) as string) + " toe " + ((distance (bipPos toeN) toe) as string))
    note (side + " " + (fmt (bipPos calf)) + " | " + (fmt (bipPos foot)) + " | " + (fmt (bipPos toeN)))
)
try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    resetMaxFile #noPrompt
    biped.createNew 80 280 [0,0,0] arms:true neckLinks:1 spineLinks:3 legLinks:3 tailLinks:0 ponytail1Links:0 ponytail2Links:0 fingers:1 fingerLinks:1 toes:1 toeLinks:1 trianglePelvis:true forearmTwistLinks:0 upperarmTwistLinks:0 thighTwistLinks:0 calfTwistLinks:0 prop1:false prop2:false prop3:false horseLink:false nubs:false
    local root = undefined
    for o in objects where classOf o == Biped_Object and o.parent == undefined do root = o
    root.controller.figureMode = true
    root.controller.rubberBandMode = false
    root.controller.height = 280
    biped.setTransform root #pos [0, -8.64697, 105.545] false
    biped.setTransform (bn "Spine") #pos [0, -8.64697, 142.484] false
    biped.setTransform (bn "Spine1") #pos [0, -8.64697, 177.114] false
    biped.setTransform (bn "Spine2") #pos [0, -5.79948, 207.126] false
    biped.setTransform (bn "Neck") #pos [0, -5.94229, 237.275] false
    biped.setTransform (bn "Head") #pos [0, -11.0127, 250.583] false
    aimArm "R" [-85.621, 0.7707, 220.978] [-101.199, 13.7186, 139.798] [-123.717, 9.14311, 104.042] [-142.141, 5.39953, 74.7879]
    aimArm "L" [85.621, 0.7707, 220.978] [101.199, 13.7186, 139.798] [123.717, 9.14311, 104.042] [142.141, 5.39953, 74.7879]
    note ("Rstill " + (fmt (bipPos (bn "R UpperArm"))) + " | " + (fmt (bipPos (bn "R Finger0"))))
    poseLeg "L" [48.9883, 17.8161, 62.7104] [43.2207, -8.26388, 24.6548] [48.9628, 23.9299, 7.0]
    poseLeg "R" [-48.9883, 17.8161, 62.7104] [-43.2207, -8.26388, 24.6548] [-48.9628, 23.9299, 7.0]
    writeLine statusPath "OK"
) catch (
    note ("ERR " + (getCurrentException() as string))
    writeLine statusPath "FAIL"
)
quitMax quiet:true
