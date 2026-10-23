-- Turret 10006. Bake the import so Z is up, the base sits on Z=0,
-- X is centered, and the muzzle points -Y (Max front view).
statusPath = @"d:\Custom\TD\temp\ft-10006\status.txt"
statsPath = @"d:\Custom\TD\temp\ft-10006\stats.txt"
srcPath = @"d:\Custom\TD\temp\ft-10006\tripo_convert_c53bbd19-9745-46f9-99f3-d40334588dc6.fbx"
texPath = @"d:\Custom\TD\temp\ft-10006\textures\dragon_head_3d_model_basecolor.JPEG"
shotDir = @"d:\Custom\TD\temp\ft-10006\shots"
maxPath = @"d:\Custom\TD\temp\ft-10006\10006.max"

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
fn bboxOf pts = (
	local mn = copy pts[1]
	local mx = copy pts[1]
	for p in pts do (
		if p.x < mn.x do mn.x = p.x
		if p.y < mn.y do mn.y = p.y
		if p.z < mn.z do mn.z = p.z
		if p.x > mx.x do mx.x = p.x
		if p.y > mx.y do mx.y = p.y
		if p.z > mx.z do mx.z = p.z
	)
	#(mn, mx)
)
fn spanOf bb = (
	bb[2] - bb[1]
)
fn spanErr a b = (
	abs (a.x - b.x) + abs (a.y - b.y) + abs (a.z - b.z)
)
fn mapVerts mesh tm = (
	local pts = #()
	pts.count = mesh.numverts
	for i = 1 to mesh.numverts do pts[i] = (getVert mesh i) * tm
	pts
)
fn captureWorld mesh = (
	local worldSpan = mesh.max - mesh.min
	note ("nodePos " + (mesh.pos as string) + " scale " + (mesh.scale as string))
	note ("nodeRot " + (mesh.rotation as string))
	local raw = #()
	raw.count = mesh.numverts
	for i = 1 to mesh.numverts do raw[i] = getVert mesh i
	local byNode = mapVerts mesh mesh.transform
	local byObj = mapVerts mesh mesh.objecttransform
	local choices = #(raw, byNode, byObj)
	local labels = #("raw", "transform", "objecttransform")
	local best = 1
	local bestErr = 1e9
	for i = 1 to 3 do (
		local sp = spanOf (bboxOf choices[i])
		local err = spanErr sp worldSpan
		note (labels[i] + " span " + (sp as string) + " err " + (err as string))
		if err < bestErr do (
			bestErr = err
			best = i
		)
	)
	note ("using " + labels[best])
	choices[best]
)
fn writeWorld mesh pts = (
	mesh.parent = undefined
	mesh.transform = (matrix3 1)
	mesh.objectOffsetPos = [0, 0, 0]
	mesh.objectOffsetRot = (quat 0 0 0 1)
	mesh.objectOffsetScale = [1, 1, 1]
	mesh.pos = [0, 0, 0]
	mesh.rotation = (quat 0 0 0 1)
	mesh.scale = [1, 1, 1]
	for i = 1 to pts.count do setVert mesh i pts[i]
	update mesh
	mesh
)
fn baseCenter pts = (
	local z0 = pts[1].z
	local z1 = pts[1].z
	for p in pts do (
		if p.z < z0 do z0 = p.z
		if p.z > z1 do z1 = p.z
	)
	local h = amax 0.001 (z1 - z0)
	local acc = [0, 0, 0]
	local n = 0
	for p in pts do (
		if (p.z - z0) <= h * 0.08 do (
			acc += p
			n += 1
		)
	)
	if n < 1 then [0, 0, z0] else (acc / n)
)
fn muzzleDir pts = (
	local z0 = pts[1].z
	local z1 = pts[1].z
	for p in pts do (
		if p.z < z0 do z0 = p.z
		if p.z > z1 do z1 = p.z
	)
	local h = amax 0.001 (z1 - z0)
	local c = baseCenter pts
	local band = #()
	for p in pts do (
		local t = (p.z - z0) / h
		if t > 0.34 and t < 0.78 do append band p
	)
	if band.count < 12 do band = pts
	local maxR = 0.0
	for p in band do (
		local r = length [p.x - c.x, p.y - c.y, 0]
		if r > maxR do maxR = r
	)
	local acc = [0, 0, 0]
	local n = 0
	local lim = maxR * 0.90
	for p in band do (
		local d = [p.x - c.x, p.y - c.y, 0]
		if (length d) >= lim do (
			acc += d
			n += 1
		)
	)
	if n < 1 then [0, -1, 0] else (normalize acc)
)
fn rotZ pts deg center = (
	local q = (angleaxis deg [0, 0, 1]) as quat
	for i = 1 to pts.count do pts[i] = ((pts[i] - center) * q) + center
	pts
)
fn place pts = (
	local c = baseCenter pts
	local z0 = pts[1].z
	for p in pts do if p.z < z0 do z0 = p.z
	local shift = [c.x, c.y, z0]
	for i = 1 to pts.count do pts[i] -= shift
	note ("shift " + (shift as string))
	pts
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
	makeDir (getFilenamePath maxPath) all:true
	try (DialogMonitorOPS.UnRegisterNotification id:#ft10006) catch ()
	try (
		DialogMonitorOPS.RegisterNotification clickOk id:#ft10006
		DialogMonitorOPS.Enabled = true
	) catch ()
	resetMaxFile #noPrompt
	try (mapPaths.add @"d:\Custom\TD\temp\ft-10006\textures") catch ()
	try (mapPaths.add @"d:\Custom\TD\temp\ft-10006\tripo_convert_c53bbd19-9745-46f9-99f3-d40334588dc6.fbm") catch ()
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
	local bestN = -1
	for o in geos do (
		local n = faceCount o
		note ("geo " + o.name + " faces " + (n as string))
		if n > bestN do (
			bestN = n
			mesh = o
		)
	)
	for o in geos where o != mesh do delete o
	if classof mesh != Editable_mesh do convertToMesh mesh
	mesh.name = "10006"
	mesh.parent = undefined
	local pts = captureWorld mesh
	local bb = bboxOf pts
	note ("captured " + (pts.count as string) + " " + (bb[1] as string) + " " + (bb[2] as string))
	local nose = muzzleDir pts
	local yaw = atan2 nose.y nose.x
	local delta = -90.0 - yaw
	while delta > 180.0 do delta -= 360.0
	while delta < -180.0 do delta += 360.0
	note ("nose " + (nose as string) + " yaw " + (yaw as string) + " delta " + (delta as string))
	if (abs delta) > 0.4 do (
		rotZ pts delta (baseCenter pts)
		note "yawed"
	)
	place pts
	writeWorld mesh pts
	local nose2 = muzzleDir pts
	note ("finalNose " + (nose2 as string) + " yaw " + ((atan2 nose2.y nose2.x) as string))
	note ("bbox " + (mesh.min as string) + " " + (mesh.max as string))
	note ("rot " + (mesh.rotation as string) + " scale " + (mesh.scale as string))

	local maps = getClassInstances Bitmaptexture
	for t in maps do (
		t.filename = texPath
		try (t.coords.blur = 0.01) catch ()
		try (t.reload()) catch ()
	)
	if maps.count == 0 do (
		local bm = Bitmaptexture filename:texPath
		local std = Standardmaterial name:"10006_base"
		std.diffuseMap = bm
		std.diffuseMapEnable = true
		std.showInViewport = true
		showTextureMap std bm true
		mesh.material = std
	)
	select mesh
	viewport.setLayout #layout_4
	try (
		for i = 1 to 4 do (
			viewport.activeViewport = i
			local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
			vpt.VisualStyleMode = #Realistic
			vpt.ShowEdgedFaces = false
		)
	) catch ()
	viewport.activeViewport = 1
	viewport.setType #view_front
	max zoomext sel
	viewport.activeViewport = 2
	viewport.setType #view_left
	max zoomext sel
	viewport.activeViewport = 3
	viewport.setType #view_top
	max zoomext sel
	viewport.activeViewport = 4
	viewport.setType #view_persp_user
	max zoomext sel
	completeRedraw()
	redrawViews()
	viewport.activeViewport = 4
	grab #view_front (shotDir + @"\front.png")
	grab #view_left (shotDir + @"\left.png")
	grab #view_top (shotDir + @"\top.png")
	grab #view_back (shotDir + @"\back.png")
	saveMaxFile maxPath quiet:true
	note "saved"
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
