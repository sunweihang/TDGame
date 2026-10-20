statusPath = @"d:\Custom\TD\temp\boss-shenshi\fit4-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\fit4-stats.txt"
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
fn logChain tag = (
    for part in #("Pelvis","Head","L Clavicle","L UpperArm","L Forearm","L Hand","L Finger0","L Thigh","L Calf","L Foot","L Toe0") do (
        note (tag + " " + part + " " + (fmt (bipPos (bn part))))
    )
)
fn makeBip w h = (
    resetMaxFile #noPrompt
    biped.createNew w h [0,0,0] arms:true neckLinks:1 spineLinks:3 legLinks:3 tailLinks:0 ponytail1Links:0 ponytail2Links:0 fingers:1 fingerLinks:1 toes:1 toeLinks:1 trianglePelvis:true forearmTwistLinks:0 upperarmTwistLinks:0 thighTwistLinks:0 calfTwistLinks:0 prop1:false prop2:false prop3:false horseLink:false nubs:false
    local root = undefined
    for o in objects where classOf o == Biped_Object and o.parent == undefined do root = o
    root.controller.figureMode = true
    root.controller.rubberBandMode = true
    root
)
try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    for pair in #([80,280],[200,360],[280,400],[320,420],[360,400]) do (
        makeBip pair[1] pair[2]
        note ("SIZE " + (pair as string) + " heightProp " + ((getNodeByName "Bip001").controller.height as string))
        logChain "base"
    )
    makeBip 80 280
    local uarm = bn "L UpperArm"
    local tm0 = uarm.transform
    note ("row1 " + (fmt tm0.row1))
    note ("row2 " + (fmt tm0.row2))
    note ("row3 " + (fmt tm0.row3))
    note ("row4 " + (fmt tm0.row4))
    try (note ("gpos " + (fmt (biped.getTransform uarm #pos)))) catch (note ("gpos " + (getCurrentException() as string)))
    try (note ("grot " + ((biped.getTransform uarm #rotation) as string))) catch (note ("grot " + (getCurrentException() as string)))
    try (note ("gsc " + ((biped.getTransform uarm #scale) as string))) catch (note ("gsc " + (getCurrentException() as string)))
    try (
        local cprops = getPropNames uarm.controller
        for n in cprops do note ("cprop " + (n as string))
    ) catch (note ("cprop " + (getCurrentException() as string)))
    local goal = [85,1,221]
    local tm = matrix3 tm0.row1 tm0.row2 tm0.row3 goal
    try (
        biped.setTransform uarm tm false false
        note ("mxFF " + (fmt (bipPos uarm)))
    ) catch (note ("mxFF " + (getCurrentException() as string)))
    try (
        biped.setTransform uarm tm true true
        note ("mxTT " + (fmt (bipPos uarm)))
    ) catch (note ("mxTT " + (getCurrentException() as string)))
    try (
        uarm.transform = tm
        note ("assign " + (fmt (bipPos uarm)))
    ) catch (note ("assign " + (getCurrentException() as string)))
    makeBip 80 280
    uarm = bn "L UpperArm"
    local q0 = biped.getTransform uarm #rotation
    try (
        biped.setTransform uarm #rotation (q0 * (eulerangles 0 60 0) as quat) false
        note ("rotY " + (fmt (bipPos uarm)) + " hand " + (fmt (bipPos (bn "L Hand"))))
    ) catch (note ("rotY " + (getCurrentException() as string)))
    makeBip 80 280
    uarm = bn "L UpperArm"
    q0 = biped.getTransform uarm #rotation
    try (
        biped.setTransform uarm #rotation ((eulerangles 0 60 0) as quat * q0) false
        note ("rotYpre " + (fmt (bipPos uarm)) + " hand " + (fmt (bipPos (bn "L Hand"))))
    ) catch (note ("rotYpre " + (getCurrentException() as string)))
    makeBip 80 280
    uarm = bn "L UpperArm"
    try (
        in coordsys world rotate uarm (angleaxis 60 [0,1,0])
        note ("cmdRot " + (fmt (bipPos uarm)) + " hand " + (fmt (bipPos (bn "L Hand"))))
    ) catch (note ("cmdRot " + (getCurrentException() as string)))
    makeBip 320 420
    note "WIDE before"
    logChain "wide"
    try (
        biped.setTransform (bn "L Finger0") #pos [142,5,75] false
        biped.setTransform (bn "R Finger0") #pos [-142,5,75] false
        note "after finger"
        logChain "fing"
    ) catch (note ("finger " + (getCurrentException() as string)))
    try (
        biped.setTransform (bn "L Foot") #pos [43,-8,25] false
        biped.setTransform (bn "R Foot") #pos [-43,-8,25] false
        note "after foot"
        logChain "foot"
    ) catch (note ("foot " + (getCurrentException() as string)))
    try (
        biped.setTransform (bn "L Toe0") #pos [49,24,7] false
        biped.setTransform (bn "R Toe0") #pos [-49,24,7] false
        note "after toe"
        logChain "toe"
    ) catch (note ("toe " + (getCurrentException() as string)))
    try (
        biped.setTransform (bn "Head") #pos [0,-11,250] false
        biped.setTransform (bn "Pelvis") #pos [0,-8,105] false
        note "after torso"
        logChain "torso"
    ) catch (note ("torso " + (getCurrentException() as string)))
    writeLine statusPath "OK"
) catch (
    note ("ERR " + (getCurrentException() as string))
    writeLine statusPath "FAIL"
)
quitMax quiet:true
