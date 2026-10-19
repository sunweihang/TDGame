-- Measure which way the imported turret points.
statusPath = @"d:\Custom\TD\temp\mg1-axis-status.txt"
statsPath = @"d:\Custom\TD\temp\mg1-axis-stats.txt"
srcPath = @"d:\Custom\TD\temp\mg1\tripo_convert_35d346dd-efff-4509-9f51-b9f07ee22b0d.fbx"
texPath = @"d:\Custom\TD\temp\mg1\textures\futuristic_turret_3d_model_basecolor.JPEG"

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
fn worldVert mesh i = (
    (getVert mesh i) * mesh.objecttransform
)

fn spread arr = (
    if arr.count == 0 then return 0.0
    local mn = arr[1]
    local mx = arr[1]
    for p in arr do (
        mn = [amin mn.x p.x, amin mn.y p.y, amin mn.z p.z]
        mx = [amax mx.x p.x, amax mx.y p.y, amax mx.z p.z]
    )
    local d = mx - mn
    sqrt (d.x * d.x + d.y * d.y + d.z * d.z)
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    note ("systemType=" + (units.SystemType as string))
    note ("systemScale=" + (units.SystemScale as string))
    try (DialogMonitorOPS.UnRegisterNotification id:#axDlg) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#axDlg
        DialogMonitorOPS.Enabled = true
    ) catch ()
    resetMaxFile #noPrompt
    try (FBXImporterSetParam "Mode" #create) catch ()
    try (FBXImporterSetParam "Animation" false) catch ()
    try (FBXImporterSetParam "Cameras" false) catch ()
    try (FBXImporterSetParam "Lights" false) catch ()
    try (FBXImporterSetParam "SmoothingGroups" true) catch ()
    try (FBXImporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXImporterSetParam "UpAxis" "Y") catch ()
    importFile srcPath #noPrompt using:FBXIMP
    local mesh = for o in geometry where (superClassOf o == GeometryClass) collect o
    mesh = mesh[1]
    local n = mesh.numverts
    note ("verts=" + (n as string))
    local c = [0, 0, 0]
    local step = 1
    if n > 8000 do step = int (n / 8000)
    local count = 0
    local pts = #()
    for i = 1 to n by step do (
        local p = worldVert mesh i
        append pts p
        c += p
        count += 1
    )
    c /= count
    note ("center " + (c as string) + " samples " + (count as string))
    local axes = #([1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1])
    local names = #("+X", "-X", "+Y", "-Y", "+Z", "-Z")
    for a = 1 to axes.count do (
        local axis = axes[a]
        local dots = #()
        for p in pts do append dots (dot (p - c) axis)
        sort dots
        local k = int (amax 1 (dots.count / 10))
        local low = 0.0
        local high = 0.0
        for i = 1 to k do low += dots[i]
        for i = dots.count - k + 1 to dots.count do high += dots[i]
        low /= k
        high /= k
        local lowPts = #()
        local highPts = #()
        for p in pts do (
            local d = dot (p - c) axis
            if d <= dots[k] do append lowPts p
            if d >= dots[dots.count - k + 1] do append highPts p
        )
        note (names[a] + " low=" + (low as string) + " high=" + (high as string) + " lowSpread=" + ((spread lowPts) as string) + " highSpread=" + ((spread highPts) as string))
    )
    local far = pts[1]
    local farD = 0.0
    for p in pts do (
        local d = length (p - c)
        if d > farD do (
            farD = d
            far = p
        )
    )
    note ("farthest " + (far as string) + " dir " + ((normalize (far - c)) as string))
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
