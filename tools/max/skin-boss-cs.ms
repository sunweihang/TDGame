-- Fit a Character Studio biped to boss_shenshi and bind the mesh.
statusPath = @"d:\Custom\TD\temp\boss-shenshi\cs-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\cs-stats.txt"
srcPath = @"C:\Users\elex\Downloads\boss_shenshi.fbx"
texPath = @"d:\Custom\TD\temp\boss-shenshi\shenshi.png"
shotDir = @"d:\Custom\TD\temp\boss-shenshi\shots"
maxPath = @"d:\Custom\TD\temp\boss-shenshi\shenshi_skinned.max"
fbxPath = @"d:\Custom\TD\temp\boss-shenshi\boss_shenshi_skinned.fbx"
fbxCopy = @"C:\Users\elex\Downloads\boss_shenshi_skinned.fbx"

struct BoneSeg (id, node, p0, p1, side, kind, sigma, bname)

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
fn clickOk = (
    local hwnd = DialogMonitorOPS.GetWindowHandle()
    if hwnd != 0 do (
        local pressed = UIAccessor.PressButtonByName hwnd "OK"
        if not pressed do UIAccessor.PressButtonByName hwnd "Import"
        if not pressed do UIAccessor.PressButtonByName hwnd "Save"
        if not pressed do UIAccessor.PressButtonByName hwnd "Yes"
    )
    true
)
fn grab fileName = (
    completeRedraw()
    redrawViews()
    local b = gw.getViewportDib()
    if b != undefined do (
        b.filename = fileName
        save b
        close b
    )
    note ("shot " + fileName)
)
fn frameShot fileName = (
    select objects
    max zoomext sel
    grab fileName
)
fn fmt p = (
    if p == undefined then "none" else ((p.x as string) + " " + (p.y as string) + " " + (p.z as string))
)
fn compareX a b = (
    if a.x < b.x then -1 else if a.x > b.x then 1 else 0
)
fn compareXDesc a b = (
    if a.x > b.x then -1 else if a.x < b.x then 1 else 0
)
fn centroid acc = (
    if acc == undefined or acc.count == 0 then undefined else (
        local s = [0,0,0]
        for p in acc do s += p
        s / acc.count
    )
)
fn zPercent all t = (
    local zs = for p in all collect p.z
    sort zs
    local i = ((zs.count - 1) * t) as integer + 1
    if i < 1 do i = 1
    if i > zs.count do i = zs.count
    zs[i]
)
fn segDist p a b = (
    local ab = b - a
    local l2 = dot ab ab
    if l2 < 0.0001 then (distance p a) else (
        local u = (dot (p - a) ab) / l2
        if u < 0.0 then u = 0.0
        if u > 1.0 then u = 1.0
        distance p (a + ab * u)
    )
)
fn mirrorX p = (
    [-p.x, p.y, p.z]
)
fn averageSide leftP rightP = (
    if leftP == undefined and rightP == undefined then (
        undefined
    ) else if leftP == undefined then (
        mirrorX rightP
    ) else if rightP == undefined then (
        leftP
    ) else (
        local m = mirrorX rightP
        (leftP + m) * 0.5
    )
)
fn midY all z rad = (
    local ymin = 1e9
    local ymax = -1e9
    local c = 0
    for p in all do (
        if (abs (p.z - z)) < 12.0 and (abs p.x) < rad do (
            if p.y < ymin do ymin = p.y
            if p.y > ymax do ymax = p.y
            c += 1
        )
    )
    if c == 0 then 0.0 else (ymin + ymax) * 0.5
)
fn collectBox all z0 z1 xmin xmax = (
    local acc = #()
    for p in all do (
        if p.z >= z0 and p.z < z1 and p.x >= xmin and p.x < xmax do append acc p
    )
    acc
)
fn armSplitFor all signX = (
    local acc = #()
    for p in all do (
        local x = p.x * signX
        if x > 8.0 and p.z >= 30.0 and p.z <= 125.0 do append acc p
    )
    if acc.count < 8 then return 108.0
    qsort acc compareX
    local bestGap = 0.0
    local bestX = 108.0
    for i = 1 to acc.count - 1 do (
        local g = abs (acc[i + 1].x - acc[i].x)
        if g > bestGap do (
            bestGap = g
            bestX = abs ((acc[i + 1].x + acc[i].x) * 0.5)
        )
    )
    if bestGap < 10.0 then 108.0 else bestX
)
fn findHip all zmax = (
    local hip = zmax * 0.30
    local seen = false
    local found = false
    for z = 10.0 to (zmax * 0.62) by 6.0 do (
        local center = 0
        local sides = 0
        local z1 = z + 8.0
        for p in all do (
            if p.z >= z and p.z < z1 do (
                local ax = abs p.x
                if ax < 7.0 then (
                    center += 1
                ) else if ax >= 14.0 and ax <= 100.0 then (
                    sides += 1
                )
            )
        )
        if sides >= 4 and center == 0 do seen = true
        if seen and center >= 2 and z > 28.0 and not found do (
            hip = z
            found = true
            exit
        )
    )
    if not found do hip = zmax * 0.30
    if hip < 48.0 do hip = zmax * 0.30
    if hip > zmax * 0.46 do hip = zmax * 0.32
    hip
)
fn outerSide all z signX = (
    local z0 = z - 14.0
    local z1 = z + 14.0
    local maxA = 0.0
    for p in all do (
        if p.z >= z0 and p.z < z1 do (
            local x = p.x * signX
            if x > maxA do maxA = x
        )
    )
    if maxA < 5.0 then return undefined
    local acc = #()
    local lim = maxA * 0.62
    for p in all do (
        if p.z >= z0 and p.z < z1 do (
            local x = p.x * signX
            if x >= lim do append acc p
        )
    )
    centroid acc
)
fn topFist all signX xmin z0 z1 = (
    local acc = #()
    for p in all do (
        local x = p.x * signX
        if x >= xmin and p.z >= z0 and p.z < z1 do append acc p
    )
    if acc.count == 0 then return undefined
    if signX > 0 then (
        qsort acc compareXDesc
    ) else (
        qsort acc compareX
    )
    local n = 8
    if acc.count < n do n = acc.count
    local s = [0,0,0]
    for i = 1 to n do s += acc[i]
    s / n
)
fn deformVert mesh i = (
    update mesh
    local m = snapshotAsMesh mesh
    local p = getVert m i
    free m
    p
)
fn bipPos node = (
    if node == undefined then return undefined
    local p = undefined
    try (p = node.pos) catch ()
    if p == undefined do (
        try (p = node.transform.position) catch ()
    )
    if p == undefined do (
        try (p = biped.getTransform node #pos) catch ()
    )
    p
)
fn placeBip node p = (
    if node == undefined or p == undefined then (
        note "place missing"
        false
    ) else (
        try (biped.setTransform node #pos p false) catch (
            note ("setPos " + node.name + " " + (getCurrentException() as string))
        )
        local now = bipPos node
        if now == undefined or (distance now p) > 8.0 do (
            try (in coordsys world move node (p - (bipPos node))) catch ()
        )
        now = bipPos node
        if now == undefined or (distance now p) > 8.0 do (
            try (node.pos = p) catch ()
        )
        note ("place " + node.name + " target " + (fmt p) + " now " + (fmt (bipPos node)))
        true
    )
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
    makeDir shotDir all:true
    try (DialogMonitorOPS.UnRegisterNotification id:#bossCs) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#bossCs
        DialogMonitorOPS.Enabled = true
    ) catch ()
    resetMaxFile #noPrompt
    try (FBXImporterSetParam "Mode" #create) catch ()
    try (FBXImporterSetParam "Animation" true) catch ()
    try (FBXImporterSetParam "Skin" true) catch ()
    try (FBXImporterSetParam "Cameras" false) catch ()
    try (FBXImporterSetParam "Lights" false) catch ()
    try (FBXImporterSetParam "SmoothingGroups" true) catch ()
    try (FBXImporterSetParam "AxisConversionMethod" "None") catch ()
    importFile srcPath #noPrompt using:FBXIMP
    try (DialogMonitorOPS.Enabled = false) catch ()

    local mesh = $shenshi1
    if mesh == undefined do mesh = geometry[1]
    convertToPoly mesh
    mesh.name = "shenshi"
    local n = polyOp.getNumVerts mesh
    local r1 = polyOp.getVert mesh 1
    local s1 = deformVert mesh 1
    local mode = "raw"
    if (distance (r1 * mesh.transform) s1) < (distance r1 s1) do mode = "tm"
    note ("vertSpace " + mode)
    local pts = #()
    for i = 1 to n do (
        local p = polyOp.getVert mesh i
        if mode == "tm" do p = p * mesh.transform
        append pts p
    )
    local mat = Standardmaterial name:"shenshi_skin"
    mat.diffuse = color 255 255 255
    mat.specularLevel = 8
    mat.glossiness = 12
    local bm = Bitmaptexture fileName:texPath
    bm.coords.mapChannel = 1
    bm.coords.realWorldScale = false
    mat.diffuseMap = bm
    mat.diffuseMapEnable = true
    showTextureMap mat bm true
    mesh.material = mat

    local zmax = -1e9
    local zmin = 1e9
    for p in pts do (
        if p.z > zmax do zmax = p.z
        if p.z < zmin do zmin = p.z
    )
    local splitL = armSplitFor pts 1
    local splitR = armSplitFor pts -1
    local armSplit = (splitL + splitR) * 0.5
    if armSplit < 70.0 or armSplit > 140.0 do armSplit = 108.0
    local hipZ = findHip pts zmax
    local skullTop = zPercent pts 0.90
    local shoulderZ = hipZ + (skullTop - hipZ) * 0.68
    if shoulderZ > skullTop - 18.0 do shoulderZ = skullTop - 22.0
    if shoulderZ < hipZ + 36.0 do shoulderZ = hipZ + (zmax - hipZ) * 0.42
    local neckZ = shoulderZ + (skullTop - shoulderZ) * 0.30
    local chestZ = hipZ + (shoulderZ - hipZ) * 0.62
    local spineZ = hipZ + (shoulderZ - hipZ) * 0.32
    local upperZ = hipZ + (shoulderZ - hipZ) * 0.88
    local py = midY pts hipZ 45.0
    local pelvis = [0, py, hipZ]
    local spineP = [0, (midY pts spineZ 35.0), spineZ]
    local chestP = [0, (midY pts chestZ 35.0), chestZ]
    local upperP = [0, (midY pts upperZ 30.0), upperZ]
    local neckP = [0, (midY pts neckZ 25.0), neckZ]
    local headP = [0, (midY pts (neckZ + 20.0) 25.0), (neckZ + (skullTop - neckZ) * 0.35)]

    local shoulderL = outerSide pts shoulderZ 1
    local shoulderR = outerSide pts shoulderZ -1
    shoulderL = averageSide shoulderL shoulderR
    if shoulderL == undefined do shoulderL = [80, py, shoulderZ]
    shoulderL.z = shoulderZ
    if shoulderL.x < 36.0 do shoulderL.x = 70.0
    local clavL = [shoulderL.x * 0.42, (shoulderL.y + upperP.y) * 0.5, upperZ]

    local fistL = topFist pts 1 armSplit 12.0 (shoulderZ - 8.0)
    local fistR = topFist pts -1 armSplit 12.0 (shoulderZ - 8.0)
    fistL = averageSide fistL fistR
    if fistL == undefined do fistL = [140, py, 66]
    local elbowZ = fistL.z + (shoulderL.z - fistL.z) * 0.46
    local elbowL = centroid (collectBox pts (elbowZ - 14.0) (elbowZ + 14.0) (armSplit * 0.72) 400.0)
    local elbowR = centroid (collectBox pts (elbowZ - 14.0) (elbowZ + 14.0) -400.0 (-armSplit * 0.72))
    elbowL = averageSide elbowL elbowR
    if elbowL == undefined do elbowL = shoulderL + (fistL - shoulderL) * 0.48
    if elbowL.z > shoulderL.z - 8.0 or elbowL.z < fistL.z + 8.0 do elbowL = shoulderL + (fistL - shoulderL) * 0.48
    local wristL = elbowL + (fistL - elbowL) * 0.55

    local hipL = centroid (collectBox pts (hipZ - 18.0) (hipZ + 6.0) 16.0 (armSplit - 4.0))
    local hipR = centroid (collectBox pts (hipZ - 18.0) (hipZ + 6.0) (-armSplit + 4.0) -16.0)
    hipL = averageSide hipL hipR
    if hipL == undefined do hipL = [42, py, hipZ]
    hipL.z = hipZ
    if hipL.x < 24.0 do hipL.x = 42.0
    if hipL.x > 62.0 do hipL.x = 52.0

    local ankleL = centroid (collectBox pts 14.0 38.0 12.0 (armSplit - 4.0))
    local ankleR = centroid (collectBox pts 14.0 38.0 (-armSplit + 4.0) -12.0)
    ankleL = averageSide ankleL ankleR
    if ankleL == undefined do ankleL = [hipL.x, hipL.y, 26]
    local kneeZ = ankleL.z + (hipL.z - ankleL.z) * 0.50
    local kneeL = centroid (collectBox pts (kneeZ - 12.0) (kneeZ + 12.0) (ankleL.x - 18.0) (ankleL.x + 22.0))
    local kneeR = centroid (collectBox pts (kneeZ - 12.0) (kneeZ + 12.0) (-ankleL.x - 22.0) (-ankleL.x + 18.0))
    kneeL = averageSide kneeL kneeR
    if kneeL == undefined do kneeL = (hipL + ankleL) * 0.5
    local toeL = [ankleL.x, (ankleL.y + 28.0), 6.0]
    local bestY = -1e9
    for p in (collectBox pts 0.0 16.0 (ankleL.x - 24.0) (ankleL.x + 24.0)) do (
        if p.y > bestY do (
            bestY = p.y
            toeL = p
        )
    )
    toeL.z = 7.0
    local torsoY = pelvis.y
    if abs (spineP.y - torsoY) > 16.0 do spineP.y = torsoY
    if abs (chestP.y - torsoY) > 16.0 do chestP.y = torsoY
    if abs (upperP.y - torsoY) > 16.0 do upperP.y = torsoY
    if abs (neckP.y - torsoY) > 16.0 do neckP.y = torsoY
    if abs (headP.y - torsoY) > 22.0 do headP.y = torsoY

    note ("hipZ " + (hipZ as string) + " shoulderZ " + (shoulderZ as string) + " neckZ " + (neckZ as string))
    note ("pelvis " + (fmt pelvis))
    note ("spine " + (fmt spineP))
    note ("chest " + (fmt chestP))
    note ("upper " + (fmt upperP))
    note ("neck " + (fmt neckP))
    note ("head " + (fmt headP))
    note ("clavL " + (fmt clavL))
    note ("shoulderL " + (fmt shoulderL))
    note ("elbowL " + (fmt elbowL))
    note ("wristL " + (fmt wristL))
    note ("fistL " + (fmt fistL))
    note ("hipL " + (fmt hipL))
    note ("kneeL " + (fmt kneeL))
    note ("ankleL " + (fmt ankleL))
    note ("toeL " + (fmt toeL))

    local made = biped.createNew 80 (skullTop * 0.92) [0,0,0] arms:true neckLinks:1 spineLinks:3 legLinks:3 tailLinks:0 ponytail1Links:0 ponytail2Links:0 fingers:1 fingerLinks:1 toes:1 toeLinks:1 trianglePelvis:true forearmTwistLinks:0 upperarmTwistLinks:0 thighTwistLinks:0 calfTwistLinks:0 prop1:false prop2:false prop3:false horseLink:false nubs:false
    note ("created " + ((classOf made) as string))
    local root = undefined
    for o in objects where classOf o == Biped_Object and o.parent == undefined do root = o
    if root == undefined do (
        for o in objects where classOf o == Biped_Object do (
            if root == undefined or o.name.count < root.name.count do root = o
        )
    )
    if root == undefined do throw "no biped root"
    local ctrl = root.controller
    gPrefix = root.name
    note ("root " + gPrefix)
    for o in objects where classOf o == Biped_Object do note ("bip " + o.name + " " + (fmt (bipPos o)))
    fn partName part = (
        getNodeByName (gPrefix + " " + part) exact:true
    )
    try (
        ctrl.figureMode = true
        note ("figure " + (ctrl.figureMode as string))
    ) catch (
        note ("figure " + (getCurrentException() as string))
    )
    try (ctrl.rubberBandMode = false) catch ()
    try (
        ctrl.height = 280
        note ("heightNow " + (ctrl.height as string))
    ) catch (
        note ("height " + (getCurrentException() as string))
    )

    local lProbe = partName "L UpperArm"
    local swap = false
    if lProbe != undefined and (bipPos lProbe).x < 0.0 do swap = true
    note ("swapLR " + (swap as string))

    placeBip root pelvis
    placeBip (partName "Spine") spineP
    placeBip (partName "Spine1") chestP
    placeBip (partName "Spine2") upperP
    placeBip (partName "Neck") neckP
    placeBip (partName "Head") headP

    local leftTag = "L"
    local rightTag = "R"
    if swap do (
        leftTag = "R"
        rightTag = "L"
    )
    local shoulderR = mirrorX shoulderL
    local elbowR = mirrorX elbowL
    local wristR = mirrorX wristL
    local fistR = mirrorX fistL
    local kneeR = mirrorX kneeL
    local ankleR = mirrorX ankleL
    local toeR = mirrorX toeL
    for i = 1 to 5 do (
        aimLink (partName (leftTag + " Clavicle")) (partName (leftTag + " UpperArm")) shoulderL
        aimLink (partName (leftTag + " UpperArm")) (partName (leftTag + " Forearm")) elbowL
        aimLink (partName (leftTag + " Forearm")) (partName (leftTag + " Hand")) wristL
        aimLink (partName (leftTag + " Hand")) (partName (leftTag + " Finger0")) fistL
        aimLink (partName (rightTag + " Clavicle")) (partName (rightTag + " UpperArm")) shoulderR
        aimLink (partName (rightTag + " UpperArm")) (partName (rightTag + " Forearm")) elbowR
        aimLink (partName (rightTag + " Forearm")) (partName (rightTag + " Hand")) wristR
        aimLink (partName (rightTag + " Hand")) (partName (rightTag + " Finger0")) fistR
        aimLink (partName (leftTag + " Thigh")) (partName (leftTag + " Calf")) kneeL
        aimLink (partName (leftTag + " Calf")) (partName (leftTag + " Foot")) ankleL
        aimLink (partName (leftTag + " Foot")) (partName (leftTag + " Toe0")) toeL
        aimLink (partName (rightTag + " Thigh")) (partName (rightTag + " Calf")) kneeR
        aimLink (partName (rightTag + " Calf")) (partName (rightTag + " Foot")) ankleR
        aimLink (partName (rightTag + " Foot")) (partName (rightTag + " Toe0")) toeR
    )
    fn logFit tag node target = (
        if node == undefined or target == undefined then (
            note ("fit " + tag + " missing")
        ) else (
            note ("fit " + tag + " " + (fmt (bipPos node)) + " want " + (fmt target) + " err " + ((distance (bipPos node) target) as string))
        )
    )
    logFit "shoulderL" (partName (leftTag + " UpperArm")) shoulderL
    logFit "elbowL" (partName (leftTag + " Forearm")) elbowL
    logFit "wristL" (partName (leftTag + " Hand")) wristL
    logFit "fistL" (partName (leftTag + " Finger0")) fistL
    logFit "kneeL" (partName (leftTag + " Calf")) kneeL
    logFit "ankleL" (partName (leftTag + " Foot")) ankleL
    logFit "toeL" (partName (leftTag + " Toe0")) toeL
    logFit "head" (partName "Head") headP

    local figErr = 0.0
    local figN = 0
    for o in objects where classOf o == Biped_Object do (
        note ("fig " + o.name + " " + (fmt (bipPos o)))
    )
    mesh.xray = true
    viewport.setLayout #layout_1
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    viewport.setType #view_front
    frameShot (shotDir + @"\cs_fig_front.png")
    viewport.setType #view_left
    frameShot (shotDir + @"\cs_fig_left.png")

    local beforeExit = #()
    for o in objects where classOf o == Biped_Object do append beforeExit #(o.name, (bipPos o))
    local jumped = 0.0
    try (
        ctrl.figureMode = false
        note ("figureOff " + (ctrl.figureMode as string))
    ) catch (
        note ("figureOff " + (getCurrentException() as string))
    )
    for rec in beforeExit do (
        local o = getNodeByName rec[1] exact:true
        if o != undefined do (
            local d = distance (bipPos o) rec[2]
            if d > jumped do jumped = d
        )
    )
    note ("figureJump " + (jumped as string))
    if jumped > 12.0 do (
        try (ctrl.figureMode = true) catch ()
        note "figure restored"
    )

    gSegs = #()
    fn pushSeg node side kind sigma = (
        if node == undefined then false else (
            local p0 = bipPos node
            if p0 == undefined do p0 = [0,0,0]
            local p1 = p0 + [0,0,10]
            local child = undefined
            for c in node.children do (
                if classOf c == Biped_Object and (matchPattern c.name pattern:"*Nub*") == false do (
                    if child == undefined do child = c
                )
            )
            if child != undefined then (
                p1 = bipPos child
            ) else (
                local par = node.parent
                local pp = bipPos par
                if pp != undefined and (distance pp p0) > 2.0 do (
                    local dir = p0 - pp
                    p1 = p0 + (normalize dir) * (length dir) * 0.5
                )
            )
            if (distance p0 p1) < 2.0 do p1 = p0 + [0,0,8]
            append gSegs (BoneSeg id:(gSegs.count + 1) node:node p0:p0 p1:p1 side:side kind:kind sigma:sigma bname:node.name)
            true
        )
    )
    local headNode = partName "Head"
    pushSeg (partName "Pelvis") 0 1 42.0
    pushSeg (partName "Spine") 0 1 40.0
    pushSeg (partName "Spine1") 0 1 42.0
    pushSeg (partName "Spine2") 0 1 36.0
    pushSeg (partName "Neck") 0 2 24.0
    pushSeg headNode 0 3 70.0
    if headNode != undefined and gSegs.count > 0 do (
        local hp = bipPos headNode
        gSegs[gSegs.count].p1 = [hp.x, hp.y, zmax - 1.0]
    )
    pushSeg (partName (leftTag + " Clavicle")) 1 4 20.0
    pushSeg (partName (leftTag + " UpperArm")) 1 4 22.0
    pushSeg (partName (leftTag + " Forearm")) 1 4 18.0
    pushSeg (partName (leftTag + " Hand")) 1 4 16.0
    pushSeg (partName (rightTag + " Clavicle")) -1 4 20.0
    pushSeg (partName (rightTag + " UpperArm")) -1 4 22.0
    pushSeg (partName (rightTag + " Forearm")) -1 4 18.0
    pushSeg (partName (rightTag + " Hand")) -1 4 16.0
    pushSeg (partName (leftTag + " Thigh")) 1 5 24.0
    pushSeg (partName (leftTag + " Calf")) 1 5 18.0
    pushSeg (partName (leftTag + " Foot")) 1 5 16.0
    pushSeg (partName (leftTag + " Toe0")) 1 5 12.0
    pushSeg (partName (rightTag + " Thigh")) -1 5 24.0
    pushSeg (partName (rightTag + " Calf")) -1 5 18.0
    pushSeg (partName (rightTag + " Foot")) -1 5 16.0
    pushSeg (partName (rightTag + " Toe0")) -1 5 12.0
    local segs = gSegs
    note ("segCount " + (segs.count as string))
    if segs.count < 12 do throw "biped fit missing bones"

    max modify mode
    select mesh
    windows.processPostedMessages()
    completeRedraw()
    local sk = Skin()
    sk.bone_Limit = 4
    addModifier mesh sk
    modPanel.setCurrentObject sk
    for s in segs do skinOps.addBone sk s.node 1
    local nb = skinOps.GetNumberBones sk
    local nv = skinOps.GetNumberVertices sk
    note ("skinBones " + (nb as string) + " skinVerts " + (nv as string))

    local cSpine = 0
    local cNeck = 0
    local cHead = 0
    local cArm = 0
    local cLeg = 0
    local wFail = 0
    for v = 1 to n do (
        local p = pts[v]
        local raw = #()
        for s in segs do (
            local allow = true
            if s.side == 1 and p.x < -8.0 do allow = false
            if s.side == -1 and p.x > 8.0 do allow = false
            if allow do (
                local d = segDist p s.p0 s.p1
                local sig = s.sigma
                local w = exp (-(d * d) / (2.0 * sig * sig))
                if (s.kind == 4 or s.kind == 5) and d < sig * 0.85 do w = w * 2.6
                local ax = abs p.x
                if p.z > shoulderZ + 12.0 and (s.kind == 4 or s.kind == 5) do w = 0.0
                if p.z > neckZ + 28.0 and s.kind != 3 do w = 0.0
                if p.z < shoulderZ - 12.0 and s.kind == 3 do w = 0.0
                if p.z < shoulderZ - 28.0 and s.kind == 2 do w = 0.0
                if ax > armSplit and p.z < shoulderZ + 8.0 and s.kind != 4 do w = 0.0
                if p.z < hipZ - 6.0 and ax > 16.0 and ax < armSplit and s.kind != 5 do w = 0.0
                if p.z > hipZ + 14.0 and s.kind == 5 do w = 0.0
                if w > 0.0001 do append raw #(s.id, w, s.kind)
            )
        )
        if raw.count == 0 do (
            local bestD = 1e9
            local bestId = 1
            local bestK = 1
            for s in segs do (
                local d2 = segDist p s.p0 s.p1
                if d2 < bestD do (
                    bestD = d2
                    bestId = s.id
                    bestK = s.kind
                )
            )
            raw = #(#(bestId, 1.0, bestK))
        )
        local chosen = #()
        local guard = 4
        if raw.count < guard do guard = raw.count
        for k = 1 to guard do (
            local bi = 0
            local bw = -1.0
            for i = 1 to raw.count do (
                local taken = false
                for c in chosen where c[1] == raw[i][1] do taken = true
                if (not taken) and raw[i][2] > bw do (
                    bw = raw[i][2]
                    bi = i
                )
            )
            if bi > 0 and bw > 0.02 do append chosen raw[bi]
        )
        if chosen.count == 0 do chosen = #(raw[1])
        local sum = 0.0
        for c in chosen do sum += c[2]
        if sum <= 0.0 do sum = 1.0
        local ids = #()
        local ws = #()
        for i = 1 to chosen.count do (
            append ids chosen[i][1]
            append ws (chosen[i][2] / sum)
        )
        local acc = 0.0
        for wv in ws do acc += wv
        ws[ws.count] = ws[ws.count] + (1.0 - acc)
        local ok = true
        try (skinOps.ReplaceVertexWeights sk v ids ws) catch (
            ok = false
            wFail += 1
        )
        if ok do (
            local mk = chosen[1][3]
            local mw = -1.0
            for c in chosen do (
                if c[2] > mw do (
                    mw = c[2]
                    mk = c[3]
                )
            )
            if mk == 1 then (
                cSpine += 1
            ) else if mk == 2 then (
                cNeck += 1
            ) else if mk == 3 then (
                cHead += 1
            ) else if mk == 4 then (
                cArm += 1
            ) else (
                cLeg += 1
            )
        )
    )
    note ("majors spine " + (cSpine as string) + " neck " + (cNeck as string) + " head " + (cHead as string) + " arm " + (cArm as string) + " leg " + (cLeg as string))
    note ("weightFail " + (wFail as string))
    try (sk.showNoEnvelopes = true) catch ()
    try (sk.always_deform = true) catch ()

    local fistVi = 1
    local fistX = -1e9
    local otherVi = 1
    local otherX = 1e9
    local headVi = 1
    local headZ = -1e9
    for i = 1 to n do (
        local p = pts[i]
        if p.x > fistX do (
            fistX = p.x
            fistVi = i
        )
        if p.x < otherX do (
            otherX = p.x
            otherVi = i
        )
        if p.z > headZ do (
            headZ = p.z
            headVi = i
        )
    )
    local bindDrift = 0.0
    local samples = #(1, fistVi, otherVi, headVi)
    for i in samples do (
        local d = distance (deformVert mesh i) pts[i]
        if d > bindDrift do bindDrift = d
        note ("bind " + (i as string) + " " + (d as string))
    )
    note ("bindDrift " + (bindDrift as string))
    try (
        local vc = skinOps.GetVertexWeightCount sk fistVi
        for k = 1 to vc do (
            local bi = skinOps.GetVertexWeightBoneID sk fistVi k
            local w = skinOps.GetVertexWeight sk fistVi k
            local nm = "?"
            try (nm = skinOps.GetBoneName sk bi 0) catch ()
            note ("fistW " + nm + " " + (w as string))
        )
    ) catch ()

    max create mode
    clearSelection()
    mesh.xray = true
    viewport.setType #view_front
    frameShot (shotDir + @"\cs_rig_front.png")
    viewport.setType #view_left
    frameShot (shotDir + @"\cs_rig_left.png")
    mesh.xray = false
    saveMaxFile maxPath quiet:true
    note "saved"

    local hand0 = deformVert mesh fistVi
    local other0 = deformVert mesh otherVi
    local head0 = deformVert mesh headVi
    local armNode = partName (leftTag + " UpperArm")
    local armTm = undefined
    if armNode != undefined do armTm = armNode.transform
    local bestDz = -1e9
    local bestTm = armTm
    if armNode != undefined do (
        for ax in #([1,0,0], [0,1,0], [0,0,1]) do (
            for ang in #(-70, 70) do (
                try (armNode.transform = armTm) catch ()
                try (in coordsys world rotate armNode (angleaxis ang ax)) catch ()
                local dz = (deformVert mesh fistVi).z - hand0.z
                if dz > bestDz do (
                    bestDz = dz
                    bestTm = armNode.transform
                )
            )
        )
        try (armNode.transform = bestTm) catch ()
    )
    note ("armLift " + (bestDz as string))
    local hand1 = deformVert mesh fistVi
    local other1 = deformVert mesh otherVi
    local head1 = deformVert mesh headVi
    note ("poseHand " + ((distance hand1 hand0) as string))
    note ("poseOther " + ((distance other1 other0) as string))
    note ("poseHead " + ((distance head1 head0) as string))
    mesh.xray = false
    viewport.setType #view_front
    frameShot (shotDir + @"\cs_pose_front.png")
    viewport.setType #view_left
    frameShot (shotDir + @"\cs_pose_left.png")

    loadMaxFile maxPath useFileUnits:true quiet:true
    mesh = $shenshi
    root = undefined
    for o in objects where classOf o == Biped_Object and o.parent == undefined do root = o
    if mesh != undefined and root != undefined do (
        local wtm = mesh.transform
        local pBefore = deformVert mesh fistVi
        mesh.parent = root
        mesh.transform = wtm
        local pAfter = deformVert mesh fistVi
        if (distance pBefore pAfter) > 1.5 then (
            mesh.parent = undefined
            mesh.transform = wtm
            note "mesh stayed free"
        ) else (
            note "mesh parented to biped"
        )
    )
    saveMaxFile maxPath quiet:true
    try (DialogMonitorOPS.Enabled = true) catch ()
    try (FBXExporterSetParam "Animation" false) catch ()
    try (FBXExporterSetParam "BakeAnimation" false) catch ()
    try (FBXExporterSetParam "Skin" true) catch ()
    try (FBXExporterSetParam "Cameras" false) catch ()
    try (FBXExporterSetParam "Lights" false) catch ()
    try (FBXExporterSetParam "EmbedTextures" true) catch ()
    try (FBXExporterSetParam "SmoothingGroups" true) catch ()
    try (FBXExporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXExporterSetParam "UpAxis" "Z") catch ()
    try (FBXExporterSetParam "ShowWarnings" false) catch ()
    try (FBXExporterSetParam "ASCII" false) catch ()
    exportFile fbxPath #noPrompt selectedOnly:false using:FBXEXP
    exportFile fbxCopy #noPrompt selectedOnly:false using:FBXEXP
    note "exported"

    local status = "OK"
    if wFail > 0 or bindDrift > 2.0 or segs.count < 12 or bestDz < 15.0 then status = "WEAK"
    writeLine statusPath status
    note ("status " + status)
) catch (
    note ("ERR " + (getCurrentException() as string))
    try (note ("STACK " + (getCurrentExceptionStackTrace() as string))) catch ()
    writeLine statusPath "FAIL"
)
try (DialogMonitorOPS.UnRegisterNotification id:#bossCs) catch ()
try (DialogMonitorOPS.Enabled = false) catch ()
quitMax quiet:true
