-- Reimport the level-2 gun and keep the barrel axes on -Y.
-- Do not aim using a single muzzle tip; that yaws the pair.
statusPath = @"d:\Custom\TD\temp\mg2-lv2-status.txt"
statsPath = @"d:\Custom\TD\temp\mg2-lv2-stats.txt"
srcPath = @"d:\Custom\TD\temp\mg2-src\tripo_convert_88aab4f6-006f-413d-aaa6-663ed97284fc.fbx"
texPath = @"d:\Custom\TD\temp\mg2-src\textures\stylized_spherical_turret_3d_model_basecolor.JPEG"
shotDir = @"d:\Custom\TD\temp\mg2-lv2-shots"
maxPath = @"d:\Custom\TD\temp\mg2-lv2\mg2-lv2.max"

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
		if not pressed do pressed = UIAccessor.PressButtonByName hwnd "Import"
		if not pressed do pressed = UIAccessor.PressButtonByName hwnd "Yes"
		if not pressed do UIAccessor.PressButtonByName hwnd "Continue"
	)
	true
)
fn bake mesh = (
	resetXForm mesh
	collapseStack mesh
	update mesh
)
fn grab vp fileName = (
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
)
-- Axis of the twin barrels, degrees. -90 means straight down the front view (-Y).
fn barrelAxisYaw mesh = (
	local z0 = mesh.min.z
	local h = amax 0.001 (mesh.max.z - z0)
	local maxr = 0.0
	for i = 1 to mesh.numverts do (
		local p = getVert mesh i
		local t = (p.z - z0) / h
		if t > 0.32 and t < 0.64 do (
			local r = length [p.x, p.y, 0]
			if r > maxr do maxr = r
		)
	)
	local lim = maxr * 0.86
	local far = #()
	for i = 1 to mesh.numverts do (
		local p = getVert mesh i
		local t = (p.z - z0) / h
		if t < 0.32 or t > 0.64 do continue
		if (length [p.x, p.y, 0]) >= lim do append far p
	)
	if far.count < 6 then throw "no barrel verts"
	local meanx = 0.0
	for p in far do meanx += p.x
	meanx /= far.count
	local left = #()
	local right = #()
	for p in far do (
		if p.x < meanx then append left p else append right p
	)
	fn axisOf pts = (
		local ys = for p in pts collect p.y
		sort ys
		local yTip = ys[amax #(1, ys.count / 5)]
		local yRoot = ys[amax #(1, (ys.count * 4) / 5)]
		local tip = [0, 0, 0]
		local root = [0, 0, 0]
		local nt = 0
		local nr = 0
		for p in pts do (
			if p.y <= yTip do (
				tip += p
				nt += 1
			)
			if p.y >= yRoot do (
				root += p
				nr += 1
			)
		)
		if nt < 1 or nr < 1 then throw "barrel split failed"
		tip /= nt
		root /= nr
		tip - root
	)
	local a = [0, -1, 0]
	local b = [0, -1, 0]
	if left.count >= 3 do a = axisOf left
	if right.count >= 3 do b = axisOf right
	local axis = a + b
	note ("axisL " + (a as string) + " axisR " + (b as string) + " n " + (left.count as string) + "/" + (right.count as string))
	atan2 axis.y axis.x
)

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	writeLine statsPath "straight"
	makeDir shotDir all:true
	makeDir (getFilenamePath maxPath) all:true
	try (DialogMonitorOPS.UnRegisterNotification id:#mgLv2b) catch ()
	try (
		DialogMonitorOPS.RegisterNotification clickOk id:#mgLv2b
		DialogMonitorOPS.Enabled = true
	) catch ()
	resetMaxFile #noPrompt
	try (mapPaths.add @"d:\Custom\TD\temp\mg2-src\textures") catch ()
	try (mapPaths.add @"d:\Custom\TD\temp\mg2-src\tripo_convert_88aab4f6-006f-413d-aaa6-663ed97284fc.fbm") catch ()
	try (FBXImporterSetParam "Mode" #create) catch ()
	try (FBXImporterSetParam "Animation" false) catch ()
	try (FBXImporterSetParam "Cameras" false) catch ()
	try (FBXImporterSetParam "Lights" false) catch ()
	try (FBXImporterSetParam "SmoothingGroups" true) catch ()
	importFile srcPath #noPrompt using:FBXIMP
	local guard = 0
	while guard < 8 do (
		local heads = for o in objects where isGroupHead o collect o
		if heads.count == 0 then exit
		ungroup heads[1]
		guard += 1
	)
	local geos = for o in geometry where (superClassOf o == GeometryClass) and (classof o != BoneGeometry) collect o
	if geos.count == 0 then throw "no geometry"
	local mesh = geos[1]
	for o in geos where o != mesh do delete o
	mesh.name = "mg2"
	bake mesh
	note ("imported " + (mesh.min as string) + " " + (mesh.max as string))
	local yaw = barrelAxisYaw mesh
	note ("yaw " + (yaw as string) + " left alone")
	local z0 = mesh.min.z
	local cx = (mesh.min.x + mesh.max.x) * 0.5
	in coordsys world move mesh [-cx, 0, -z0]
	bake mesh
	note ("placed " + (mesh.min as string) + " " + (mesh.max as string))
	local maps = getClassInstances Bitmaptexture
	for t in maps do (
		t.filename = texPath
		try (t.reload()) catch ()
	)
	select mesh
	viewport.setLayout #layout_1
	viewport.setType #view_top
	try (
		local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
		vpt.VisualStyleMode = #Wireframe
	) catch ()
	max zoomext sel
	completeRedraw()
	redrawViews()
	grab #view_top (shotDir + @"\top_fixed.png")
	viewport.setType #view_front
	try (
		local vpt2 = NitrousGraphicsManager.GetActiveViewportSetting()
		vpt2.VisualStyleMode = #Realistic
	) catch ()
	max zoomext sel
	grab #view_front (shotDir + @"\front_fixed.png")
	viewport.setType #view_top
	try (
		local vpt3 = NitrousGraphicsManager.GetActiveViewportSetting()
		vpt3.VisualStyleMode = #Wireframe
	) catch ()
	max zoomext sel
	completeRedraw()
	saveMaxFile maxPath quiet:true
	note "saved"
	writeLine statusPath "OPEN"
) catch (
	local msg = "unknown"
	try (msg = getCurrentException() as string) catch ()
	note ("ERROR=" + msg)
	try (note (getCurrentExceptionStackTrace())) catch ()
	writeLine statusPath ("FAIL " + msg)
)
try (DialogMonitorOPS.Enabled = false) catch ()
