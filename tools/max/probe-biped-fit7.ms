statusPath = @"d:\Custom\TD\temp\boss-shenshi\fit7-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\fit7-stats.txt"
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
    local pelvis = [0, -8.64697, 105.545]
    local shoulderL = [85.621, 0.7707, 220.978]
    local elbowL = [101.199, 13.7186, 139.798]
    local wristL = [123.717, 9.14311, 104.042]
    local fistL = [142.141, 5.39953, 74.7879]
    local kneeL = [48.9883, 17.8161, 62.7104]
    local ankleL = [43.2207, -8.26388, 24.6548]
    local toeL = [48.9628, 23.9299, 7.0]
    biped.setTransform root #pos pelvis false
    biped.setTransform (bn "Spine") #pos [0, -8.64697, 142.484] false
    biped.setTransform (bn "Spine1") #pos [0, -8.64697, 177.114] false
    biped.setTransform (bn "Spine2") #pos [0, -5.79948, 207.126] false
    biped.setTransform (bn "Neck") #pos [0, -5.94229, 237.275] false
    biped.setTransform (bn "Head") #pos [0, -11.0127, 250.583] false
    for i = 1 to 5 do (
        aimLink (bn "L Clavicle") (bn "L UpperArm") shoulderL
        aimLink (bn "L UpperArm") (bn "L Forearm") elbowL
        aimLink (bn "L Forearm") (bn "L Hand") wristL
        aimLink (bn "L Hand") (bn "L Finger0") fistL
    )
    note ("Larm " + (fmt (bipPos (bn "L UpperArm"))) + " | " + (fmt (bipPos (bn "L Forearm"))) + " | " + (fmt (bipPos (bn "L Hand"))) + " | " + (fmt (bipPos (bn "L Finger0"))))
    select #( (bn "L Clavicle"), (bn "L UpperArm"), (bn "L Forearm"), (bn "L Hand"), (bn "L Finger0") )
    local cname = undefined
    try (
        cname = biped.copyPosture ctrl #posture false false false
        note ("copy " + (cname as string))
    ) catch (
        note ("copy " + (getCurrentException() as string))
    )
    if cname == undefined do (
        try (
            biped.createCopyCollection ctrl "Fit"
            cname = biped.copyPosture ctrl #posture false false false
            note ("copy2 " + (cname as string))
        ) catch (
            note ("copy2 " + (getCurrentException() as string))
        )
    )
    if cname != undefined do (
        try (
            biped.pastePosture ctrl #posture true cname
            note "pasted"
        ) catch (
            note ("paste " + (getCurrentException() as string))
        )
    )
    note ("Rarm " + (fmt (bipPos (bn "R UpperArm"))) + " | " + (fmt (bipPos (bn "R Forearm"))) + " | " + (fmt (bipPos (bn "R Hand"))) + " | " + (fmt (bipPos (bn "R Finger0"))))
    for i = 1 to 5 do (
        aimLink (bn "L Thigh") (bn "L Calf") kneeL
        aimLink (bn "L Calf") (bn "L Foot") ankleL
        aimLink (bn "L Foot") (bn "L Toe0") toeL
    )
    note ("Lleg " + (fmt (bipPos (bn "L Thigh"))) + " | " + (fmt (bipPos (bn "L Calf"))) + " | " + (fmt (bipPos (bn "L Foot"))) + " | " + (fmt (bipPos (bn "L Toe0"))))
    local thigh = bn "L Thigh"
    local calf = bn "L Calf"
    local foot = bn "L Foot"
    local toe = bn "L Toe0"
    local qT = biped.getTransform thigh #rotation
    local scT = biped.getTransform thigh #scale
    local qC = biped.getTransform calf #rotation
    local scC = biped.getTransform calf #scale
    local qF = biped.getTransform foot #rotation
    local scF = biped.getTransform foot #scale
    local qO = biped.getTransform toe #rotation
    local scO = biped.getTransform toe #scale
    local knee0 = bipPos calf
    fn restoreLeg = (
        biped.setTransform thigh #rotation qT false
        biped.setTransform thigh #scale scT false
        biped.setTransform calf #rotation qC false
        biped.setTransform calf #scale scC false
        biped.setTransform foot #rotation qF false
        biped.setTransform foot #scale scF false
        biped.setTransform toe #rotation qO false
        biped.setTransform toe #scale scO false
    )
    for ax in #([1,0,0], [0,1,0], [0,0,1]) do (
        restoreLeg()
        local k0 = bipPos calf
        in coordsys local rotate thigh (angleaxis 40 ax)
        note ("axis " + (ax as string) + " kneeMove " + ((distance (bipPos calf) k0) as string) + " foot " + (fmt (bipPos foot)))
    )
    restoreLeg()
    note ("restore " + ((distance (bipPos calf) knee0) as string) + " foot " + (fmt (bipPos foot)))
    local bestErr = distance (bipPos foot) ankleL
    local bestAng = 0.0
    note ("baseFoot " + (bestErr as string))
    for ang in #(-150.0, -120.0, -90.0, -60.0, -30.0, 30.0, 60.0, 90.0, 120.0, 150.0, 180.0) do (
        restoreLeg()
        in coordsys local rotate thigh (angleaxis ang [1,0,0])
        for i = 1 to 3 do (
            aimLink calf foot ankleL
            aimLink foot toe toeL
        )
        local err = distance (bipPos foot) ankleL
        local terr = distance (bipPos toe) toeL
        local kerr = distance (bipPos calf) kneeL
        note ("tw " + (ang as string) + " knee " + (kerr as string) + " foot " + (err as string) + " toe " + (terr as string) + " at " + (fmt (bipPos foot)))
        if err < bestErr do (
            bestErr = err
            bestAng = ang
        )
    )
    note ("bestAng " + (bestAng as string) + " bestFoot " + (bestErr as string))
    writeLine statusPath "OK"
) catch (
    note ("ERR " + (getCurrentException() as string))
    writeLine statusPath "FAIL"
)
quitMax quiet:true
