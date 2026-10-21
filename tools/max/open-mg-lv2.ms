-- Level-2 machine gun. Default FBX import is already Z-up.
-- Front view looks along +Y, so the twin barrels must point -Y.
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
fn qAlign a b = (
	local na = normalize a
	local nb = normalize b
	local ax = cross na nb
	if (length ax) < 0.0001 then (
		if (dot na nb) > 0 then (quat 0 0 0 1) else (angleaxis 180 [0, 0, 1])
	) else (
		local d = dot na nb
		if d > 1.0 do d = 1.0
		if d < -1.0 do d = -1.0
		angleaxis (acos d) (normalize ax)
	)
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
fn collectVerts mesh = (
	local pts = #()
	pts.count = mesh.numverts
	for i = 1 to mesh.numverts do pts[i] = getVert mesh i
	pts
)
fn coreOf pts = (
	local z0 = pts[1].z
	local z1 = pts[1].z
	for p in pts do (
		if p.z < z0 do z0 = p.z
		if p.z > z1 do z1 = p.z
	)
	local h = amax 0.001 (z1 - z0)
	local band = #()
	for p in pts do (
		local t = (p.z - z0) / h
		if t > 0.42 and t < 0.78 do append band p
	)
	if band.count < 8 do band = pts
	local c = [0, 0, 0]
	for p in band do c += p
	c /= band.count
	local rads = #()
	for p in band do append rads (length [p.x - c.x, p.y - c.y, 0])
	local sorted = #()
	for r in rads do append sorted r
	sort sorted
	local cut = sorted[amax #(1, (sorted.count * 6) / 10)]
	local acc = [0, 0, 0]
	local n = 0
	for i = 1 to band.count do (
		if rads[i] <= cut do (
			acc += band[i]
			n += 1
		)
	)
	if n < 1 then c else acc / n
)
-- Angle of the barrels, degrees. 0 is +X, -90 is -Y (the front view).
fn barrelYaw pts center = (
	local z0 = pts[1].z
	local z1 = pts[1].z
	for p in pts do (
		if p.z < z0 do z0 = p.z
		if p.z > z1 do z1 = p.z
	)
	local h = amax 0.001 (z1 - z0)
	local bins = #()
	for i = 1 to 36 do append bins 0.0
	local counted = 0
	for p in pts do (
		local t = (p.z - z0) / h
		if t < 0.34 or t > 0.64 do continue
		local dx = p.x - center.x
		local dy = p.y - center.y
		local r = length [dx, dy, 0]
		local ang = atan2 dy dx
		local b = (floor ((ang + 180.0) / 10.0)) + 1
		if b < 1 do b = 1
		if b > 36 do b = 36
		if r > bins[b] do bins[b] = r
		counted += 1
	)
	local best = 1
	for i = 2 to 36 do if bins[i] > bins[best] do best = i
	local accA = 0.0
	local accR = 0.0
	for k = -2 to 2 do (
		local i = best + k
		while i < 1 do i += 36
		while i > 36 do i -= 36
		if bins[i] > bins[best] * 0.90 do (
			local a = -180.0 + ((i - 0.5) * 10.0)
			local da = a - (-180.0 + ((best - 0.5) * 10.0))
			while da > 180.0 do da -= 360.0
			while da < -180.0 do da += 360.0
			accA += (a - da + da) * bins[i]
			accA = accA - (a * bins[i]) + ((-180.0 + ((best - 0.5) * 10.0) + da) * bins[i])
			accR += bins[i]
		)
	)
	local yaw = -90.0
	if accR > 0.0 do yaw = accA / accR
	note ("barrelBins best " + (best as string) + " r " + (bins[best] as string) + " yaw " + (yaw as string) + " n " + (counted as string))
	yaw
)

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	writeLine statsPath "start"
	makeDir shotDir all:true
	makeDir (getFilenamePath maxPath) all:true
	try (DialogMonitorOPS.UnRegisterNotification id:#mgLv2) catch ()
	try (
		DialogMonitorOPS.RegisterNotification clickOk id:#mgLv2
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

	local pts = collectVerts mesh
	local center = coreOf pts
	local yaw = barrelYaw pts center
	note ("core " + (center as string))
	local delta = -90.0 - yaw
	while delta > 180.0 do delta -= 360.0
	while delta < -180.0 do delta += 360.0
	note ("yawDelta " + (delta as string))
	if (abs delta) > 0.25 do (
		in coordsys world about center rotate mesh (angleaxis delta [0, 0, 1])
		bake mesh
		note ("yawed " + (mesh.min as string) + " " + (mesh.max as string))
	)

	pts = collectVerts mesh
	center = coreOf pts
	local z0 = mesh.min.z
	in coordsys world move mesh [-center.x, -center.y, -z0]
	bake mesh
	note ("placed " + (mesh.min as string) + " " + (mesh.max as string))
	pts = collectVerts mesh
	note ("finalYaw " + ((barrelYaw pts (coreOf pts)) as string))

	local maps = getClassInstances Bitmaptexture
	for t in maps do (
		t.filename = texPath
		try (t.coords.blur = 0.01) catch ()
		try (t.reload()) catch ()
	)
	if maps.count == 0 do (
		local bm = Bitmaptexture filename:texPath
		local std = Standardmaterial name:"mg2_base"
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
	grab #view_persp_user (shotDir + @"\persp.png")
	viewport.setLayout #layout_4
	viewport.activeViewport = 1
	viewport.setType #view_front
	max zoomext sel
	viewport.activeViewport = 4
	viewport.setType #view_persp_user
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
