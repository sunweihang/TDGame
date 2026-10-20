statusPath = @"d:\Custom\TD\temp\boss-shenshi\fit6-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\fit6-stats.txt"
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
    local pel = bn "Pelvis"
    local thigh = bn "L Thigh"
    note ("hip0 " + (fmt (bipPos thigh)))
    try (
        biped.setTransform thigh #pos [52,-10,105] false
        note ("hipPos " + (fmt (bipPos thigh)))
    ) catch (note ("hipPos " + (getCurrentException() as string)))
    root = makeBip()
    pel = bn "Pelvis"
    thigh = bn "L Thigh"
    local sc = biped.getTransform pel #scale
    note ("pelScale " + (sc as string))
    biped.setTransform pel #scale [sc.x * 3.8, sc.y, sc.z] false
    note ("hipScaleX " + (fmt (bipPos thigh)) + " pel " + (fmt (bipPos pel)))
    root = makeBip()
    pel = bn "Pelvis"
    thigh = bn "L Thigh"
    sc = biped.getTransform pel #scale
    biped.setTransform pel #scale [sc.x, sc.y * 3.8, sc.z] false
    note ("hipScaleY " + (fmt (bipPos thigh)))
    root = makeBip()
    pel = bn "Pelvis"
    sc = biped.getTransform root #scale
    note ("rootScale " + (sc as string))
    try (
        biped.setTransform root #scale [sc.x * 2.0, sc.y, sc.z] false
        note ("rootSX " + (fmt (bipPos (bn "L Thigh"))) + " " + (fmt (bipPos (bn "L UpperArm"))))
    ) catch (note ("rootSX " + (getCurrentException() as string)))
    root = makeBip()
    local knee = [49,18,63]
    local ankle = [43,-8,25]
    for i = 1 to 3 do aimOnce (bn "L Thigh") (bn "L Calf") knee
    local qT = biped.getTransform (bn "L Thigh") #rotation
    local qC = biped.getTransform (bn "L Calf") #rotation
    local scC = biped.getTransform (bn "L Calf") #scale
    local hipP = bipPos (bn "L Thigh")
    local kneeP = bipPos (bn "L Calf")
    local axis = kneeP - hipP
    axis = axis / (length axis)
    local best = 1e9
    local bestAng = 0.0
    for ang = -90.0 to 90.0 by 15.0 do (
        biped.setTransform (bn "L Thigh") #rotation ((angleaxis ang axis) as quat * qT) false
        biped.setTransform (bn "L Calf") #rotation qC false
        biped.setTransform (bn "L Calf") #scale scC false
        aimOnce (bn "L Calf") (bn "L Foot") ankle
        local err = distance (bipPos (bn "L Foot")) ankle
        note ("twist " + (ang as string) + " foot " + (fmt (bipPos (bn "L Foot"))) + " err " + (err as string))
        if err < best do (
            best = err
            bestAng = ang
        )
    )
    note ("bestAng " + (bestAng as string) + " best " + (best as string))
    biped.setTransform (bn "L Thigh") #rotation ((angleaxis bestAng axis) as quat * qT) false
    biped.setTransform (bn "L Calf") #rotation qC false
    biped.setTransform (bn "L Calf") #scale scC false
    for i = 1 to 3 do aimOnce (bn "L Calf") (bn "L Foot") ankle
    note ("footBest " + (fmt (bipPos (bn "L Foot"))))
    root.controller.figureMode = false
    note ("figOff foot " + (fmt (bipPos (bn "L Foot"))) + " calf " + (fmt (bipPos (bn "L Calf"))))
    writeLine statusPath "OK"
) catch (
    note ("ERR " + (getCurrentException() as string))
    writeLine statusPath "FAIL"
)
quitMax quiet:true
