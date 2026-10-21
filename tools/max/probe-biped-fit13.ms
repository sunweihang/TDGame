statusPath = @"d:\Custom\TD\temp\boss-shenshi\fit13-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\fit13-stats.txt"
holdPath = @"d:\Custom\TD\temp\boss-shenshi\fit13-hold.max"
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
fn applyAim bone child target signed = (
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
    local dotv = dot curN wantN
    if dotv > 1.0 do dotv = 1.0
    if dotv < -1.0 do dotv = -1.0
    local ang = acos dotv
    if (length axis) > 0.0001 and ang > 0.25 do (
        local ax = axis / (length axis)
        if signed then (
            local origQ = biped.getTransform bone #rotation
            local baseD = distance b target
            in coordsys world rotate bone (angleaxis ang ax)
            local dPlus = distance (bipPos child) target
            biped.setTransform bone #rotation origQ false
            in coordsys world rotate bone (angleaxis -ang ax)
            local dMinus = distance (bipPos child) target
            biped.setTransform bone #rotation origQ false
            if dPlus <= dMinus and dPlus <= baseD + 0.2 then (
                in coordsys world rotate bone (angleaxis ang ax)
            ) else if dMinus < dPlus and dMinus <= baseD + 0.2 then (
                in coordsys world rotate bone (angleaxis -ang ax)
            )
        ) else (
            in coordsys world rotate bone (angleaxis ang ax)
        )
    )
    a = bipPos bone
    b = bipPos child
    if a == undefined or b == undefined then return false
    local curLen2 = distance a b
    local wantLen2 = distance a target
    if curLen2 > 0.001 and abs (wantLen2 - curLen2) > 0.4 do (
        local sc0 = biped.getTransform bone #scale
        local beforeS = distance (bipPos child) target
        local f = wantLen2 / curLen2
        if f < 0.25 do f = 0.25
        if f > 5.0 do f = 5.0
        biped.setTransform bone #scale [sc0.x * f, sc0.y, sc0.z] false
        if signed and (distance (bipPos child) target) > beforeS + 0.2 do (
            biped.setTransform bone #scale sc0 false
        )
    )
    true
)
fn aimArm side shoulder elbow wrist fist signed = (
    for i = 1 to 5 do (
        applyAim (bn (side + " Clavicle")) (bn (side + " UpperArm")) shoulder signed
        applyAim (bn (side + " UpperArm")) (bn (side + " Forearm")) elbow signed
        applyAim (bn (side + " Forearm")) (bn (side + " Hand")) wrist signed
        applyAim (bn (side + " Hand")) (bn (side + " Finger0")) fist signed
    )
)
fn poseLeg side knee ankle toe signed = (
    local thigh = bn (side + " Thigh")
    local calf = bn (side + " Calf")
    local foot = bn (side + " Foot")
    local toeN = bn (side + " Toe0")
    for i = 1 to 4 do (
        applyAim thigh calf knee signed
        applyAim calf foot ankle signed
        applyAim foot toeN toe signed
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
    for i = 1 to 3 do applyAim foot toeN toe signed
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
    ctrl.rubberBandMode = false
    ctrl.height = 280
    biped.setTransform root #pos [0, -8.64697, 105.545] false
    biped.setTransform (bn "Spine") #pos [0, -8.64697, 142.484] false
    biped.setTransform (bn "Spine1") #pos [0, -8.64697, 177.114] false
    biped.setTransform (bn "Spine2") #pos [0, -5.79948, 207.126] false
    biped.setTransform (bn "Neck") #pos [0, -5.94229, 237.275] false
    biped.setTransform (bn "Head") #pos [0, -11.0127, 250.583] false
    aimArm "R" [-85.621, 0.7707, 220.978] [-101.199, 13.7186, 139.798] [-123.717, 9.14311, 104.042] [-142.141, 5.39953, 74.7879] true
    aimArm "L" [85.621, 0.7707, 220.978] [101.199, 13.7186, 139.798] [123.717, 9.14311, 104.042] [142.141, 5.39953, 74.7879] false
    poseLeg "L" [48.9883, 17.8161, 62.7104] [43.2207, -8.26388, 24.6548] [48.9628, 23.9299, 7.0] false
    poseLeg "R" [-48.9883, 17.8161, 62.7104] [-43.2207, -8.26388, 24.6548] [-48.9628, 23.9299, 7.0] true
    saveMaxFile holdPath quiet:true
    local ankleR = [-43.2207, -8.26388, 24.6548]
    select #((bn "L Thigh"), (bn "L Calf"), (bn "L Foot"), (bn "L Toe0"))
    local cname = undefined
    try (cname = biped.copyPosture ctrl #posture false false false) catch (note ("copy " + (getCurrentException() as string)))
    if cname != undefined do (
        try (biped.pastePosture ctrl #posture true cname) catch (note ("paste " + (getCurrentException() as string)))
    )
    note ("pasteR " + (fmt (bipPos (bn "R Calf"))) + " | " + (fmt (bipPos (bn "R Foot"))) + " | " + (fmt (bipPos (bn "R Toe0"))) + " ferr " + ((distance (bipPos (bn "R Foot")) ankleR) as string))
    loadMaxFile holdPath useFileUnits:true quiet:true
    local calf = bn "R Calf"
    local foot = bn "R Foot"
    local qC = biped.getTransform calf #rotation
    local scC = biped.getTransform calf #scale
    local best = 1e9
    local bestDesc = ""
    for ax in #([0,1,0], [0,0,1]) do (
        for ang = -80.0 to 80.0 by 20.0 do (
            for f in #(0.7, 1.0, 1.4, 1.9, 2.5) do (
                biped.setTransform calf #rotation qC false
                biped.setTransform calf #scale scC false
                if abs ang > 0.1 do (
                    in coordsys local rotate calf (angleaxis ang ax)
                )
                local scN = biped.getTransform calf #scale
                biped.setTransform calf #scale [scN.x * f, scN.y, scN.z] false
                local ferr = distance (bipPos foot) ankleR
                if ferr < best do (
                    best = ferr
                    bestDesc = ((ax as string) + " ang " + (ang as string) + " f " + (f as string) + " at " + (fmt (bipPos foot)))
                )
            )
        )
    )
    note ("bestFoot " + (best as string) + " " + bestDesc)
    writeLine statusPath "OK"
) catch (
    note ("ERR " + (getCurrentException() as string))
    writeLine statusPath "FAIL"
)
quitMax quiet:true
