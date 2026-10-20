-- Import boss, apply skin texture, shoot views, dump pose stats.
statusPath = @"d:\Custom\TD\temp\boss-shenshi\shot-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\shot-stats.txt"
srcPath = @"C:\Users\elex\Downloads\boss_shenshi.fbx"
texPath = @"C:\Users\elex\Downloads\20261020-195633.png"
shotDir = @"d:\Custom\TD\temp\boss-shenshi\shots"

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
        if not pressed do UIAccessor.PressButtonByName hwnd "Import"
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

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    makeDir shotDir all:true
    try (DialogMonitorOPS.UnRegisterNotification id:#bossShot) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#bossShot
        DialogMonitorOPS.Enabled = true
    ) catch ()
    resetMaxFile #noPrompt
    try (FBXImporterSetParam "Mode" #create) catch ()
    try (FBXImporterSetParam "Animation" true) catch ()
    try (FBXImporterSetParam "Skin" true) catch ()
    try (FBXImporterSetParam "Cameras" false) catch ()
    try (FBXImporterSetParam "Lights" false) catch ()
    try (FBXImporterSetParam "AxisConversionMethod" "None") catch ()
    importFile srcPath #noPrompt using:FBXIMP
    try (DialogMonitorOPS.UnRegisterNotification id:#bossShot) catch ()
    try (DialogMonitorOPS.Enabled = false) catch ()

    local o = $shenshi1
    if o == undefined do o = geometry[1]
    convertToPoly o
    select o
    note ("name " + o.name)
    note ("verts " + ((polyOp.getNumVerts o) as string))
    note ("faces " + ((polyOp.getNumFaces o) as string))
    local bb = nodeGetBoundingBox o (matrix3 1)
    note ("bb " + (bb[1] as string) + " " + (bb[2] as string))
    note ("pivot " + (o.pos as string))
    note ("units " + (units.SystemType as string) + " scale " + (units.SystemScale as string))

    local mat = Standardmaterial name:"shenshi_skin"
    mat.diffuse = color 255 255 255
    mat.specularLevel = 10
    mat.glossiness = 10
    local bm = Bitmaptexture fileName:texPath
    bm.coords.mapChannel = 1
    bm.coords.realWorldScale = false
    mat.diffuseMap = bm
    mat.diffuseMapEnable = true
    showTextureMap mat bm true
    o.material = mat
    o.showVertexColors = false

    local nmaps = meshOp.getNumMaps o.mesh
    note ("numMaps " + (nmaps as string))
    for ch = 0 to (nmaps - 1) do (
        local nv = 0
        try (nv = meshOp.getNumMapVerts o.mesh ch) catch ()
        note ("map " + (ch as string) + " verts " + (nv as string))
    )

    -- UV bounds on channel 1
    local mn = [1e9,1e9,1e9]
    local mx = [-1e9,-1e9,-1e9]
    local mverts = meshOp.getNumMapVerts o.mesh 1
    for i = 1 to mverts do (
        local uv = meshOp.getMapVert o.mesh 1 i
        if uv.x < mn.x do mn.x = uv.x
        if uv.y < mn.y do mn.y = uv.y
        if uv.x > mx.x do mx.x = uv.x
        if uv.y > mx.y do mx.y = uv.y
    )
    note ("uv1 min " + (mn as string) + " max " + (mx as string) + " count " + (mverts as string))

    -- height slices: count verts in 8 Z bands, and X/Y spread per band
    local z0 = bb[1].z
    local z1 = bb[2].z
    local h = z1 - z0
    for b = 0 to 7 do (
        local za = z0 + h * b / 8.0
        local zb = z0 + h * (b + 1) / 8.0
        local cnt = 0
        local xmin = 1e9
        local xmax = -1e9
        local ymin = 1e9
        local ymax = -1e9
        local nv = polyOp.getNumVerts o
        for i = 1 to nv do (
            local p = polyOp.getVert o i
            if p.z >= za and p.z < zb do (
                cnt += 1
                if p.x < xmin do xmin = p.x
                if p.x > xmax do xmax = p.x
                if p.y < ymin do ymin = p.y
                if p.y > ymax do ymax = p.y
            )
        )
        note ("band " + (b as string) + " z " + (za as string) + ".." + (zb as string) + " n=" + (cnt as string) + " x " + (xmin as string) + ".." + (xmax as string) + " y " + (ymin as string) + ".." + (ymax as string))
    )

    viewport.setLayout #layout_1
    clearSelection()
    select o
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    viewport.setType #view_front
    max zoomext sel
    grab (shotDir + @"\front.png")
    viewport.setType #view_back
    max zoomext sel
    grab (shotDir + @"\back.png")
    viewport.setType #view_left
    max zoomext sel
    grab (shotDir + @"\left.png")
    viewport.setType #view_right
    max zoomext sel
    grab (shotDir + @"\right.png")
    viewport.setType #view_top
    max zoomext sel
    grab (shotDir + @"\top.png")
    viewport.setType #view_persp_user
    max zoomext sel
    grab (shotDir + @"\persp.png")

    saveMaxFile @"d:\Custom\TD\temp\boss-shenshi\shenshi.max" quiet:true
    writeLine statusPath "OK"
) catch (
    note ("ERR " + (getCurrentException() as string))
    try (note ("STACK " + (getCurrentExceptionStackTrace() as string))) catch ()
    writeLine statusPath "FAIL"
)
quitMax quiet:true
