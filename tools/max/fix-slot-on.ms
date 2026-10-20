-- Lay the activated pad flat: disk normal to +Z, bottom on Z=0, then export.
statusPath = @"d:\Custom\TD\temp\active-base\fix-status.txt"
statsPath = @"d:\Custom\TD\temp\active-base\fix-stats.txt"
maxPath = @"d:\Custom\TD\temp\active-base\base.max"
shotDir = @"d:\Custom\TD\temp\active-base\shots"
outPath = @"d:\Custom\TD\assets\models\turret\slot-on.fbx"
texPath = @"d:\Custom\TD\temp\active-base\textures\basecolor.JPEG"

fn writeLine path text = (
    local f = createFile path
    if f != undefined do (
        format "%\n" text to:f
        close f
    )
)
fn note s = (
    local f = openFile statsPath mode:"a"
    if f == undefined then f = createFile statsPath
    if f != undefined do (
        format "%\n" s to:f
        close f
    )
)
fn clickOk = (
    local hwnd = DialogMonitorOPS.GetWindowHandle()
    if hwnd != 0 do (
        local pressed = UIAccessor.PressButtonByName hwnd "OK"
        if not pressed do pressed = UIAccessor.PressButtonByName hwnd "Yes"
        if not pressed do UIAccessor.PressButtonByName hwnd "Save"
    )
    true
)
fn grab vp fileName = (
    viewport.activeViewport = 4
    viewport.setType vp
    try (max zoomext sel) catch ()
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
fn mulCov xx xy xz yy yz zz v = (
    [(xx*v.x + xy*v.y + xz*v.z), (xy*v.x + yy*v.y + yz*v.z), (xz*v.x + yz*v.y + zz*v.z)]
)
fn dominant xx xy xz yy yz zz = (
    local v = normalize [0.3, 0.7, 0.4]
    for i = 1 to 40 do (
        v = mulCov xx xy xz yy yz zz v
        local len = length v
        if len < 1e-12 then exit
        v = v / len
    )
    v
)
fn planeNormal obj = (
    local tm = obj.transform
    local n = obj.numverts
    local c = [0, 0, 0]
    local pts = #()
    for i = 1 to n do (
        local p = (getVert obj i) * tm
        append pts p
        c += p
    )
    c /= n
    local xx = 0.0
    local xy = 0.0
    local xz = 0.0
    local yy = 0.0
    local yz = 0.0
    local zz = 0.0
    for p in pts do (
        local d = p - c
        xx += d.x * d.x
        xy += d.x * d.y
        xz += d.x * d.z
        yy += d.y * d.y
        yz += d.y * d.z
        zz += d.z * d.z
    )
    local v1 = dominant xx xy xz yy yz zz
    local lam = dot v1 (mulCov xx xy xz yy yz zz v1)
    xx -= lam * v1.x * v1.x
    xy -= lam * v1.x * v1.y
    xz -= lam * v1.x * v1.z
    yy -= lam * v1.y * v1.y
    yz -= lam * v1.y * v1.z
    zz -= lam * v1.z * v1.z
    local v2 = dominant xx xy xz yy yz zz
    local nrm = normalize (cross v1 v2)
    if nrm.z < 0 do nrm = -nrm
    nrm
)

if objects.count > 0 then (
    writeLine statusPath "BUSY"
) else (
    try (
        setQuietMode true
        writeLine statusPath "RUNNING"
        writeLine statsPath "start"
        makeDir shotDir all:true
        try (DialogMonitorOPS.UnRegisterNotification id:#slotFix) catch ()
        try (
            DialogMonitorOPS.RegisterNotification clickOk id:#slotFix
            DialogMonitorOPS.Enabled = true
        ) catch ()
        loadMaxFile maxPath quiet:true
        local mesh = getNodeByName "base"
        if mesh == undefined do (
            local geos = for o in geometry where (superClassOf o == GeometryClass) and (classof o != BoneGeometry) collect o
            if geos.count == 0 then throw "no geometry"
            mesh = geos[1]
        )
        if classof mesh == Editable_Poly do convertToMesh mesh
        local nrm = planeNormal mesh
        note ("beforeNormal " + (nrm as string))
        note ("before " + (mesh.min as string) + " " + (mesh.max as string))
        local up = [0, 0, 1]
        local axis = cross nrm up
        local alen = length axis
        if alen < 1e-5 then (
            note "already flat"
        ) else (
            local ang = acos (amin 1.0 (amax -1.0 (dot nrm up)))
            note ("rotate " + (ang as string) + " axis " + ((normalize axis) as string))
            in coordsys world rotate mesh (angleaxis ang (normalize axis))
        )
        resetXForm mesh
        collapseStack mesh
        completeRedraw()
        local nrm2 = planeNormal mesh
        note ("afterNormal " + (nrm2 as string))
        local z0 = mesh.min.z
        local cx = mesh.center.x
        local cy = mesh.center.y
        in coordsys world move mesh [-cx, -cy, -z0]
        completeRedraw()
        note ("after " + (mesh.min as string) + " " + (mesh.max as string))
        local maps = getClassInstances Bitmaptexture
        for t in maps do (
            t.filename = texPath
            try (t.reload()) catch ()
        )
        mesh.name = "base"
        select mesh
        viewport.setLayout #layout_4
        viewport.activeViewport = 4
        viewport.setType #view_persp_user
        max zoomext sel
        completeRedraw()
        redrawViews()
        grab #view_persp_user (shotDir + @"\fix_persp.png")
        grab #view_top (shotDir + @"\fix_top.png")
        grab #view_front (shotDir + @"\fix_front.png")
        saveMaxFile maxPath quiet:true
        try (FBXExporterSetParam "Animation" false) catch ()
        try (FBXExporterSetParam "Cameras" false) catch ()
        try (FBXExporterSetParam "Lights" false) catch ()
        try (FBXExporterSetParam "EmbedTextures" true) catch ()
        try (FBXExporterSetParam "SmoothingGroups" true) catch ()
        try (FBXExporterSetParam "AxisConversionMethod" "None") catch ()
        try (FBXExporterSetParam "UpAxis" "Z") catch ()
        try (FBXExporterSetParam "ConvertUnit" "m") catch ()
        try (FBXExporterSetParam "ShowWarnings" false) catch ()
        local exported = exportFile outPath #noPrompt selectedOnly:true using:FBXEXP
        note ("exported " + (exported as string))
        if exported != true then throw "export failed"
        writeLine statusPath "OK"
    ) catch (
        local msg = "unknown"
        try (msg = getCurrentException() as string) catch ()
        note ("ERROR=" + msg)
        try (note (getCurrentExceptionStackTrace())) catch ()
        writeLine statusPath ("FAIL " + msg)
    )
    try (DialogMonitorOPS.Enabled = false) catch ()
    quitMax quiet:true
)