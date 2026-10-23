-- Probe turret 10011 import orientation. No rotation.
statusPath = @"d:\Custom\TD\temp\mg-10011\probe-status.txt"
statsPath = @"d:\Custom\TD\temp\mg-10011\probe-stats.txt"
srcPath = @"d:\Custom\TD\temp\mg-10011\tripo_convert_61b43be6-b83b-428c-ae37-cda195e6fccc.fbx"
texPath = @"d:\Custom\TD\temp\mg-10011\textures\robotic_turret_3d_model_basecolor.JPEG"
shotDir = @"d:\Custom\TD\temp\mg-10011\probe-shots"

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
fn faceCount o = (
	local n = 0
	try (
		local m = snapshotAsMesh o
		n = m.numfaces
		free m
	) catch ()
	n
)

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	writeLine statsPath "start"
	makeDir shotDir all:true
	try (DialogMonitorOPS.UnRegisterNotification id:#p10011) catch ()
	try (
		DialogMonitorOPS.RegisterNotification clickOk id:#p10011
		DialogMonitorOPS.Enabled = true
	) catch ()
	resetMaxFile #noPrompt
	try (mapPaths.add @"d:\Custom\TD\temp\mg-10011\textures") catch ()
	try (mapPaths.add @"d:\Custom\TD\temp\mg-10011\tripo_convert_61b43be6-b83b-428c-ae37-cda195e6fccc.fbm") catch ()
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
	note ("objectCount=" + (objects.count as string))
	for o in objects do (
		note ("obj " + o.name + " class " + (classof o as string) + " parent " + (if o.parent == undefined then "none" else o.parent.name))
	)
	local geos = for o in geometry where (superClassOf o == GeometryClass) and (classof o != BoneGeometry) collect o
	if geos.count == 0 then throw "no geometry"
	local mesh = geos[1]
	local bestN = -1
	for o in geos do (
		local n = faceCount o
		note ("geo " + o.name + " faces " + (n as string) + " min " + (o.min as string) + " max " + (o.max as string))
		note ("pos " + (o.pos as string) + " rot " + (o.rotation as string) + " scale " + (o.scale as string))
		if n > bestN do (
			bestN = n
			mesh = o
		)
	)
	select mesh
	local maps = getClassInstances Bitmaptexture
	note ("bitmapCount=" + (maps.count as string))
	for t in maps do (
		note ("bitmap " + t.filename)
		t.filename = texPath
		try (t.reload()) catch ()
	)
	if maps.count == 0 do (
		local bm = Bitmaptexture filename:texPath
		local std = Standardmaterial name:"mg10011"
		std.diffuseMap = bm
		std.diffuseMapEnable = true
		std.showInViewport = true
		showTextureMap std bm true
		mesh.material = std
	)
	viewport.setLayout #layout_1
	try (
		local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
		vpt.VisualStyleMode = #Realistic
		vpt.ShowEdgedFaces = false
	) catch ()
	grab #view_front (shotDir + @"\front.png")
	grab #view_back (shotDir + @"\back.png")
	grab #view_left (shotDir + @"\left.png")
	grab #view_right (shotDir + @"\right.png")
	grab #view_top (shotDir + @"\top.png")
	grab #view_persp_user (shotDir + @"\persp.png")
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
