statusPath = @"d:\Custom\TD\temp\boss-shenshi\fit5-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\fit5-stats.txt"
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
fn makeBip = (
    resetMaxFile #noPrompt
    biped.createNew 80 280 [0,0,0] arms:true neckLinks:1 spineLinks:3 legLinks:3 tailLinks:0 ponytail1Links:0 ponytail2Links:0 fingers:1 fingerLinks:1 toes:1 toeLinks:1 trianglePelvis:true forearmTwistLinks:0 upperarmTwistLinks:0 thighTwistLinks:0 calfTwistLinks:0 prop1:false prop2:false prop3:false horseLink:false nubs:false
    local root = undefined
    for o in objects where classOf o == Biped_Object and o.parent == undefined do root = o
    root.controller.figureMode = true
    root.controller.rubberBandMode = false
    root.controller.height = 280
    root
)
fn aimOnce bone child target = (
    local a = bipPos bone
    local b = bipPos child
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
    if (length axis) > 0.0001 and ang > 0.2 do (
        local ax = axis / (length axis)
        in coordsys world rotate bone (angleaxis ang ax)
    )
    a = bipPos bone
    b = bipPos child
    curLen = distance a b
    wantLen = distance a target
    if curLen > 0.001 and abs (wantLen - curLen) > 0.5 do (
        local sc = biped.getTransform bone #scale
        local f = wantLen / curLen
        biped.setTransform bone #scale [sc.x * f, sc.y, sc.z] false
    )
    true
)
try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    local root = makeBip()
    local uarm = bn "L UpperArm"
    local farm = bn "L Forearm"
    local sc0 = biped.getTransform uarm #scale
    note ("scale0 " + (sc0 as string) + " farm " + (fmt (bipPos farm)))
    biped.setTransform uarm #scale [sc0.x * 1.5, sc0.y, sc0.z] false
    note ("scaleX farm " + (fmt (bipPos farm)) + " d " + ((distance (bipPos uarm) (bipPos farm)) as string))
    root = makeBip()
    uarm = bn "L UpperArm"
    farm = bn "L Forearm"
    sc0 = biped.getTransform uarm #scale
    biped.setTransform uarm #scale [sc0.x, sc0.y * 1.5, sc0.z] false
    note ("scaleY farm " + (fmt (bipPos farm)) + " d " + ((distance (bipPos uarm) (bipPos farm)) as string))
    root = makeBip()
    uarm = bn "L UpperArm"
    farm = bn "L Forearm"
    sc0 = biped.getTransform uarm #scale
    biped.setTransform uarm #scale [sc0.x, sc0.y, sc0.z * 1.5] false
    note ("scaleZ farm " + (fmt (bipPos farm)) + " d " + ((distance (bipPos uarm) (bipPos farm)) as string))
    root = makeBip()
    note ("root0 " + (fmt (bipPos root)) + " pel " + (fmt (bipPos (bn "Pelvis"))))
    biped.setTransform root #pos [0,-8,31] false
    note ("root1 " + (fmt (bipPos root)) + " pel " + (fmt (bipPos (bn "Pelvis"))) + " head " + (fmt (bipPos (bn "Head"))))
    root = makeBip()
    local shoulder = [86,1,221]
    local elbow = [101,14,140]
    local wrist = [124,9,104]
    local fist = [142,5,75]
    local hip = [52,-10,106]
    local knee = [49,18,63]
    local ankle = [43,-8,25]
    local toe = [49,24,7]
    for i = 1 to 4 do (
        aimOnce (bn "L Clavicle") (bn "L UpperArm") shoulder
        aimOnce (bn "L UpperArm") (bn "L Forearm") elbow
        aimOnce (bn "L Forearm") (bn "L Hand") wrist
        aimOnce (bn "L Hand") (bn "L Finger0") fist
        aimOnce (bn "L Thigh") (bn "L Calf") knee
        aimOnce (bn "L Calf") (bn "L Foot") ankle
        aimOnce (bn "L Foot") (bn "L Toe0") toe
    )
    note ("clav " + (fmt (bipPos (bn "L Clavicle"))))
    note ("uarm " + (fmt (bipPos (bn "L UpperArm"))) + " want " + (fmt shoulder))
    note ("farm " + (fmt (bipPos (bn "L Forearm"))) + " want " + (fmt elbow))
    note ("hand " + (fmt (bipPos (bn "L Hand"))) + " want " + (fmt wrist))
    note ("fing " + (fmt (bipPos (bn "L Finger0"))) + " want " + (fmt fist))
    note ("thigh " + (fmt (bipPos (bn "L Thigh"))) + " want " + (fmt hip))
    note ("calf " + (fmt (bipPos (bn "L Calf"))) + " want " + (fmt knee))
    note ("foot " + (fmt (bipPos (bn "L Foot"))) + " want " + (fmt ankle))
    note ("toe " + (fmt (bipPos (bn "L Toe0"))) + " want " + (fmt toe))
    writeLine statusPath "OK"
) catch (
    note ("ERR " + (getCurrentException() as string))
    writeLine statusPath "FAIL"
)
quitMax quiet:true
