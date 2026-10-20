-- Build a skeleton for boss_shenshi and bind it with the Skin modifier.
statusPath = @"d:\Custom\TD\temp\boss-shenshi\skin-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\skin-stats.txt"
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
fn makeBone name p0 p1 par col = (
    local dir = p1 - p0
    if (length dir) < 2.0 do (
        if (length dir) < 0.001 then dir = [0,0,1] else dir = normalize dir
        p1 = p0 + dir * 8.0
    )
    local nd = normalize (p1 - p0)
    local zax = [0,1,0]
    if abs nd.z < 0.82 do zax = [0,0,1]
    local b = BoneSys.createBone p0 p1 zax
    b.name = name
    b.width = 14
    b.height = 14
    b.taper = 80
    b.frontfin = false
    b.backfin = false
    b.sidefins = false
    b.wirecolor = col
    local pBefore = b.pos
    local wtm = b.transform
    if par != undefined do b.parent = par
    if (distance b.pos pBefore) > 2.0 do b.transform = wtm
    b.boneFreezeLength = true
    b.boneEnable = true
    note ("bone " + name + " pos " + (fmt b.pos) + " end " + (fmt p1) + " shift " + ((distance b.pos pBefore) as string))
    b
)
fn yAtZ all z rad = (
    local s = 0.0
    local c = 0
    for p in all do (
        if (abs (p.z - z)) < 12.0 and (abs p.x) < rad do (
            s += p.y
            c += 1
        )
    )
    if c == 0 then 0.0 else s / c
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
    note ("armGap side " + (signX as string) + " gap " + (bestGap as string) + " x " + (bestX as string))
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
        note ("hipScan z " + (z as string) + " center " + (center as string) + " sides " + (sides as string))
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
    qsort acc compareXDesc
    if signX < 0 do qsort acc compareX
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

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    makeDir shotDir all:true
    try (DialogMonitorOPS.UnRegisterNotification id:#bossSkin) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#bossSkin
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
    local o1 = r1 * mesh.objectTransform
    local t1 = r1 * mesh.transform
    note ("verts " + (n as string))
    note ("scale " + (mesh.scale as string))
    note ("raw " + (fmt r1))
    note ("snap " + (fmt s1))
    note ("obj " + (fmt o1))
    note ("node " + (fmt t1))
    local mode = "raw"
    local bestD = distance r1 s1
    local dObj = distance o1 s1
    local dTm = distance t1 s1
    if dObj < bestD do (
        bestD = dObj
        mode = "obj"
    )
    if dTm < bestD do (
        bestD = dTm
        mode = "tm"
    )
    note ("vertSpace " + mode + " d " + (bestD as string))
    local pts = #()
    for i = 1 to n do (
        local p = polyOp.getVert mesh i
        if mode == "obj" then (
            p = p * mesh.objectTransform
        ) else if mode == "tm" then (
            p = p * mesh.transform
        )
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
    note ("z " + (zmin as string) + " " + (zmax as string))

    local splitL = armSplitFor pts 1
    local splitR = armSplitFor pts -1
    local armSplit = (splitL + splitR) * 0.5
    if armSplit < 70.0 do armSplit = 108.0
    if armSplit > 140.0 do armSplit = 108.0
    note ("armSplit " + (armSplit as string))

    local hipZ = findHip pts zmax
    local skullTop = zPercent pts 0.90
    local shoulderZ = hipZ + (skullTop - hipZ) * 0.68
    if shoulderZ > skullTop - 18.0 do shoulderZ = skullTop - 22.0
    if shoulderZ < hipZ + 36.0 do shoulderZ = hipZ + (zmax - hipZ) * 0.42
    local neckZ = shoulderZ + (skullTop - shoulderZ) * 0.30
    local chestZ = hipZ + (shoulderZ - hipZ) * 0.70
    local spineZ = hipZ + (shoulderZ - hipZ) * 0.34
    note ("hip " + (hipZ as string) + " spine " + (spineZ as string) + " chest " + (chestZ as string))
    note ("shoulder " + (shoulderZ as string) + " neck " + (neckZ as string) + " skull " + (skullTop as string))

    local pelvis = [0, (yAtZ pts hipZ 40.0), hipZ]
    local spineP = [0, (yAtZ pts spineZ 36.0), spineZ]
    local chestP = [0, (yAtZ pts chestZ 36.0), chestZ]
    local neckP = [0, (yAtZ pts neckZ 30.0), neckZ]
    local headJointZ = neckZ + (zmax - neckZ) * 0.22
    local headJoint = [0, (yAtZ pts headJointZ 28.0), headJointZ]
    local headEnd = [0, (yAtZ pts ((headJointZ + zmax) * 0.5) 40.0), zmax - 1.0]

    local shoulderL = outerSide pts shoulderZ 1
    local shoulderR = outerSide pts shoulderZ -1
    shoulderL = averageSide shoulderL shoulderR
    if shoulderL == undefined do shoulderL = [78, 0, shoulderZ]
    shoulderL.z = shoulderZ
    if shoulderL.x < 36.0 do shoulderL.x = 64.0
    local shoulderRpt = mirrorX shoulderL

    local fistL = topFist pts 1 armSplit 12.0 (shoulderZ - 8.0)
    local fistR = topFist pts -1 armSplit 12.0 (shoulderZ - 8.0)
    fistL = averageSide fistL fistR
    if fistL == undefined do fistL = [140, 0, 60]
    local fistRpt = mirrorX fistL

    local elbowZ = fistL.z + (shoulderL.z - fistL.z) * 0.46
    local elbowL = centroid (collectBox pts (elbowZ - 14.0) (elbowZ + 14.0) (armSplit * 0.72) 400.0)
    local elbowR = centroid (collectBox pts (elbowZ - 14.0) (elbowZ + 14.0) -400.0 (-armSplit * 0.72))
    elbowL = averageSide elbowL elbowR
    if elbowL == undefined do elbowL = (shoulderL + fistL) * 0.5
    if elbowL.z > shoulderL.z - 8.0 or elbowL.z < fistL.z + 8.0 do elbowL = shoulderL + (fistL - shoulderL) * 0.48
    local elbowRpt = mirrorX elbowL
    local wristL = elbowL + (fistL - elbowL) * 0.60
    local wristR = mirrorX wristL
    local fistEndL = fistL
    local fistDir = fistL - wristL
    if (length fistDir) > 1.0 do fistEndL = fistL + (normalize fistDir) * 10.0
    local fistEndR = mirrorX fistEndL

    local hipL = centroid (collectBox pts (hipZ - 18.0) (hipZ + 6.0) 12.0 (armSplit - 4.0))
    local hipR = centroid (collectBox pts (hipZ - 18.0) (hipZ + 6.0) (-armSplit + 4.0) -12.0)
    hipL = averageSide hipL hipR
    if hipL == undefined do hipL = [36, pelvis.y, hipZ]
    hipL.z = hipZ
    if hipL.x < 18.0 do hipL.x = 32.0
    local hipRpt = mirrorX hipL

    local ankleL = centroid (collectBox pts 14.0 38.0 10.0 (armSplit - 4.0))
    local ankleR = centroid (collectBox pts 14.0 38.0 (-armSplit + 4.0) -10.0)
    ankleL = averageSide ankleL ankleR
    if ankleL == undefined do ankleL = [hipL.x, hipL.y, 24]
    local ankleRpt = mirrorX ankleL

    local kneeZ = ankleL.z + (hipL.z - ankleL.z) * 0.50
    local kneeL = centroid (collectBox pts (kneeZ - 12.0) (kneeZ + 12.0) (ankleL.x - 18.0) (ankleL.x + 22.0))
    local kneeR = centroid (collectBox pts (kneeZ - 12.0) (kneeZ + 12.0) (-ankleL.x - 22.0) (-ankleL.x + 18.0))
    kneeL = averageSide kneeL kneeR
    if kneeL == undefined do kneeL = (hipL + ankleL) * 0.5
    local kneeRpt = mirrorX kneeL

    local toeAcc = collectBox pts 0.0 18.0 (ankleL.x - 22.0) (ankleL.x + 22.0)
    local toeL = undefined
    local bestY = -1e9
    for p in toeAcc do (
        if p.y > bestY do (
            bestY = p.y
            toeL = p
        )
    )
    if toeL == undefined do toeL = [ankleL.x, ankleL.y + 18.0, 4.0]
    toeL.z = amin ankleL.z 8.0
    local toeR = mirrorX toeL

    note ("pelvis " + (fmt pelvis))
    note ("spine " + (fmt spineP))
    note ("chest " + (fmt chestP))
    note ("neck " + (fmt neckP))
    note ("headJoint " + (fmt headJoint))
    note ("headEnd " + (fmt headEnd))
    note ("shoulderL " + (fmt shoulderL))
    note ("elbowL " + (fmt elbowL))
    note ("wristL " + (fmt wristL))
    note ("fistL " + (fmt fistEndL))
    note ("hipL " + (fmt hipL))
    note ("kneeL " + (fmt kneeL))
    note ("ankleL " + (fmt ankleL))
    note ("toeL " + (fmt toeL))

    local colSpine = color 255 210 40
    local colHead = color 255 120 30
    local colL = color 40 220 90
    local colR = color 40 190 255
    local rootB = makeBone "root" [0,0,0] [0,0,12] undefined (color 180 180 180)
    local pelvisB = makeBone "pelvis" pelvis spineP rootB colSpine
    local spineB = makeBone "spine" spineP chestP pelvisB colSpine
    local chestB = makeBone "chest" chestP neckP spineB colSpine
    local neckB = makeBone "neck" neckP headJoint chestB colHead
    local headB = makeBone "head" headJoint headEnd neckB colHead
    local uarmL = makeBone "upperarm_l" shoulderL elbowL chestB colL
    local farmL = makeBone "forearm_l" elbowL wristL uarmL colL
    local handL = makeBone "hand_l" wristL fistEndL farmL colL
    local uarmR = makeBone "upperarm_r" shoulderRpt elbowRpt chestB colR
    local farmR = makeBone "forearm_r" elbowRpt wristR uarmR colR
    local handR = makeBone "hand_r" wristR fistEndR farmR colR
    local thighL = makeBone "thigh_l" hipL kneeL pelvisB colL
    local calfL = makeBone "calf_l" kneeL ankleL thighL colL
    local footL = makeBone "foot_l" ankleL toeL calfL colL
    local thighR = makeBone "thigh_r" hipRpt kneeRpt pelvisB colR
    local calfR = makeBone "calf_r" kneeRpt ankleRpt thighR colR
    local footR = makeBone "foot_r" ankleRpt toeR calfR colR

    gSegs = #()
    fn addSeg id node p0 p1 side kind sigma bname = (
        append gSegs (BoneSeg id:id node:node p0:p0 p1:p1 side:side kind:kind sigma:sigma bname:bname)
    )
    addSeg 1 pelvisB pelvis spineP 0 1 42.0 "pelvis"
    addSeg 2 spineB spineP chestP 0 1 40.0 "spine"
    addSeg 3 chestB chestP neckP 0 1 46.0 "chest"
    addSeg 4 neckB neckP headJoint 0 2 26.0 "neck"
    addSeg 5 headB headJoint headEnd 0 3 76.0 "head"
    addSeg 6 uarmL shoulderL elbowL 1 4 22.0 "upperarm_l"
    addSeg 7 farmL elbowL wristL 1 4 18.0 "forearm_l"
    addSeg 8 handL wristL fistEndL 1 4 16.0 "hand_l"
    addSeg 9 uarmR shoulderRpt elbowRpt -1 4 22.0 "upperarm_r"
    addSeg 10 farmR elbowRpt wristR -1 4 18.0 "forearm_r"
    addSeg 11 handR wristR fistEndR -1 4 16.0 "hand_r"
    addSeg 12 thighL hipL kneeL 1 5 24.0 "thigh_l"
    addSeg 13 calfL kneeL ankleL 1 5 18.0 "calf_l"
    addSeg 14 footL ankleL toeL 1 5 16.0 "foot_l"
    addSeg 15 thighR hipRpt kneeRpt -1 5 24.0 "thigh_r"
    addSeg 16 calfR kneeRpt ankleRpt -1 5 18.0 "calf_r"
    addSeg 17 footR ankleRpt toeR -1 5 16.0 "foot_r"
    local segs = gSegs

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
    for i = 1 to nb do (
        local bn = ""
        try (bn = skinOps.GetBoneName sk i 0) catch (bn = "?")
        note ("skinBone " + (i as string) + " " + bn)
    )

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
        local drift = 1.0 - 0.0
        local acc = 0.0
        for w in ws do acc += w
        ws[ws.count] = ws[ws.count] + (1.0 - acc)
        local ok = true
        try (
            skinOps.ReplaceVertexWeights sk v ids ws
        ) catch (
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
    local chestVi = 1
    local chestD = 1e9
    local footVi = 1
    local footD = 1e9
    for i = 1 to n do (
        local p = pts[i]
        if p.x > fistX do (fistX = p.x; fistVi = i)
        if p.x < otherX do (otherX = p.x; otherVi = i)
        if p.z > headZ do (headZ = p.z; headVi = i)
        local cd = distance p chestP
        if cd < chestD do (chestD = cd; chestVi = i)
        local fd = distance p ankleL
        if p.x > 0 and fd < footD do (footD = fd; footVi = i)
    )
    note ("fistVi " + (fistVi as string) + " otherVi " + (otherVi as string) + " headVi " + (headVi as string))
    try (
        local vc = skinOps.GetVertexWeightCount sk fistVi
        note ("fistWeightCount " + (vc as string))
        for k = 1 to vc do (
            local bi = skinOps.GetVertexWeightBoneID sk fistVi k
            local w = skinOps.GetVertexWeight sk fistVi k
            local bn = "?"
            try (bn = skinOps.GetBoneName sk bi 0) catch ()
            note ("fistW " + bn + " " + (w as string))
        )
    ) catch (
        note "fistWeightReadFail"
    )

    local bindDrift = 0.0
    local samples = #(1, fistVi, otherVi, headVi, chestVi, footVi, (n / 2))
    for i in samples do (
        local d = distance (deformVert mesh i) pts[i]
        if d > bindDrift do bindDrift = d
        note ("bind " + (i as string) + " drift " + (d as string))
    )
    note ("bindDrift " + (bindDrift as string))

    max create mode
    clearSelection()
    mesh.xray = true
    viewport.setLayout #layout_1
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    viewport.setType #view_front
    select objects
    max zoomext sel
    grab (shotDir + @"\rig_front.png")
    viewport.setType #view_left
    select objects
    max zoomext sel
    grab (shotDir + @"\rig_left.png")
    try (
        local tgt = Targetobject pos:[0,0,150] name:"camTgt"
        local cam = Targetcamera fov:40 pos:[210,460,210] target:tgt name:"camShot"
        viewport.setCamera cam
        completeRedraw()
        grab (shotDir + @"\rig_persp.png")
        delete cam
        delete tgt
    ) catch (
        note ("cam " + (getCurrentException() as string))
    )

    saveMaxFile maxPath quiet:true

    local armTm = uarmL.transform
    local thighTm = thighL.transform
    local hand0 = deformVert mesh fistVi
    local other0 = deformVert mesh otherVi
    local head0 = deformVert mesh headVi
    local chest0 = deformVert mesh chestVi
    local foot0 = deformVert mesh footVi
    local bestArmTm = armTm
    local bestDz = -1e9
    local axes = #([1,0,0], [0,1,0], [0,0,1])
    local angs = #(-65, 65)
    for ax in axes do (
        for ang in angs do (
            uarmL.transform = armTm
            in coordsys world rotate uarmL (angleaxis ang ax)
            local dz = (deformVert mesh fistVi).z - hand0.z
            if dz > bestDz do (
                bestDz = dz
                bestArmTm = uarmL.transform
            )
        )
    )
    uarmL.transform = bestArmTm
    note ("armLift " + (bestDz as string))

    local footY0 = foot0.y
    local bestThighTm = thighTm
    local bestDy = -1e9
    for ax in axes do (
        for ang in angs do (
            thighL.transform = thighTm
            in coordsys world rotate thighL (angleaxis ang ax)
            local dy = (deformVert mesh footVi).y - footY0
            if dy > bestDy do (
                bestDy = dy
                bestThighTm = thighL.transform
            )
        )
    )
    thighL.transform = bestThighTm
    note ("legForward " + (bestDy as string))

    local hand1 = deformVert mesh fistVi
    local other1 = deformVert mesh otherVi
    local head1 = deformVert mesh headVi
    local chest1 = deformVert mesh chestVi
    local foot1 = deformVert mesh footVi
    note ("poseHand " + (fmt hand1) + " d " + ((distance hand1 hand0) as string))
    note ("poseOther " + ((distance other1 other0) as string))
    note ("poseHead " + ((distance head1 head0) as string))
    note ("poseChest " + ((distance chest1 chest0) as string))
    note ("poseFoot " + (fmt foot1) + " d " + ((distance foot1 foot0) as string))

    viewport.setType #view_front
    select objects
    max zoomext sel
    grab (shotDir + @"\pose_front.png")
    viewport.setType #view_left
    select objects
    max zoomext sel
    grab (shotDir + @"\pose_left.png")
    mesh.xray = false
    viewport.setType #view_front
    select objects
    max zoomext sel
    grab (shotDir + @"\pose_solid_front.png")

    uarmL.transform = armTm
    thighL.transform = thighTm
    local restoreDrift = 0.0
    for i in samples do (
        local d = distance (deformVert mesh i) pts[i]
        if d > restoreDrift do restoreDrift = d
    )
    note ("restoreDrift " + (restoreDrift as string))
    mesh.xray = false
    clearSelection()

    if restoreDrift < 2.0 do (
        local wtm = mesh.transform
        local pBefore = deformVert mesh fistVi
        mesh.parent = rootB
        mesh.transform = wtm
        local pAfter = deformVert mesh fistVi
        if (distance pBefore pAfter) > 1.5 then (
            mesh.parent = undefined
            mesh.transform = wtm
            note "mesh stayed at scene root"
        ) else (
            note "mesh parented to root"
        )
    )

    saveMaxFile maxPath quiet:true
    try (DialogMonitorOPS.Enabled = true) catch ()
    try (FBXExporterSetParam "Animation" false) catch ()
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

    local reBones = 0
    local reVerts = 0
    try (
        resetMaxFile #noPrompt
        try (FBXImporterSetParam "Mode" #create) catch ()
        try (FBXImporterSetParam "Animation" false) catch ()
        try (FBXImporterSetParam "Skin" true) catch ()
        try (FBXImporterSetParam "Cameras" false) catch ()
        try (FBXImporterSetParam "AxisConversionMethod" "None") catch ()
        try (FBXImporterSetParam "UpAxis" "Z") catch ()
        importFile fbxPath #noPrompt using:FBXIMP
        for o in objects do (
            note ("re " + o.name + " " + ((classOf o) as string))
            try (
                local sm = o.modifiers[#Skin]
                if sm != undefined do (
                    select o
                    max modify mode
                    modPanel.setCurrentObject sm
                    reBones = skinOps.GetNumberBones sm
                    reVerts = skinOps.GetNumberVertices sm
                    note ("reSkin bones " + (reBones as string) + " verts " + (reVerts as string))
                )
            ) catch (
                note ("reErr " + (getCurrentException() as string))
            )
        )
    ) catch (
        note ("reimport " + (getCurrentException() as string))
    )

    local status = "OK"
    if wFail > 0 or bindDrift > 2.0 or restoreDrift > 2.0 or bestDz < 15.0 or reBones < 10 then status = "WEAK"
    writeLine statusPath status
    note ("status " + status)
) catch (
    note ("ERR " + (getCurrentException() as string))
    try (note ("STACK " + (getCurrentExceptionStackTrace() as string))) catch ()
    writeLine statusPath "FAIL"
)
try (DialogMonitorOPS.UnRegisterNotification id:#bossSkin) catch ()
try (DialogMonitorOPS.Enabled = false) catch ()
quitMax quiet:true
