-- Level-3 gatling turret.
-- Stand the base on XY (Z up). The long side barrels stay on X.
-- The nose, the short centerline barrel, points -Y (Max front view).

statusPath = @"d:\Custom\TD\temp\mg3-lv3-recut-status.txt"
statsPath = @"d:\Custom\TD\temp\mg3-lv3-recut-stats.txt"
srcPath = @"d:\Custom\TD\temp\mg3-lv3-src\src.fbx"
texPath = @"d:\Custom\TD\temp\mg3-lv3-src\basecolor.jpg"
shotDir = @"d:\Custom\TD\temp\mg3-lv3-shots"
maxPath = @"d:\Custom\TD\temp\mg3-lv3\mg3-lv3.max"
fbxPath = @"d:\Custom\TD\temp\mg3-lv3\mg3-lv3.fbx"

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
		if (dot na nb) > 0 then (quat 0 0 0 1) else ((angleaxis 180 [1, 0, 0]) as quat)
	) else (
		local d = dot na nb
		if d > 1.0 do d = 1.0
		if d < -1.0 do d = -1.0
		(angleaxis (acos d) (normalize ax)) as quat
	)
)
fn rotPts pts q center = (
	for i = 1 to pts.count do pts[i] = ((pts[i] - center) * q) + center
	pts
)
fn centroid pts = (
	local c = [0, 0, 0]
	for p in pts do c += p
	if pts.count > 0 then (c / pts.count) else [0, 0, 0]
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
	note ("xform " + (mesh.transform as string))
	note ("objXform " + (mesh.objecttransform as string))
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
	for i = 1 to pts.count do setVert mesh i pts[i]
	update mesh
	mesh
)
fn slabScore pts dir = (
	local n = pts.count
	local proj = #()
	proj.count = n
	for i = 1 to n do proj[i] = dot pts[i] dir
	local ordered = for v in proj collect v
	sort ordered
	local k = amax #(12, n / 12)
	if k > n do k = n
	local thresh = ordered[n - k + 1]
	local acc = [0, 0, 0]
	local cnt = 0
	local pmax = -1e9
	local pmin = 1e9
	for i = 1 to n do (
		if proj[i] + 0.00001 < thresh do continue
		acc += pts[i]
		cnt += 1
		if proj[i] > pmax do pmax = proj[i]
		if proj[i] < pmin do pmin = proj[i]
	)
	if cnt < 3 do return #(0.0, 0.0, 0.0, 0)
	local c = acc / cnt
	local rad = 0.0
	for i = 1 to n do (
		if proj[i] + 0.00001 < thresh do continue
		local lateral = (pts[i] - c) - ((dot (pts[i] - c) dir) * dir)
		rad += (length lateral)
	)
	rad /= cnt
	local thick = amax 0.0 (pmax - pmin)
	#((rad / (thick + 0.0001)), rad, thick, cnt)
)
fn standUp pts = (
	local dirs = #([1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1])
	local names = #("+X", "-X", "+Y", "-Y", "+Z", "-Z")
	local best = 6
	local bestS = -1.0
	for i = 1 to 6 do (
		local info = slabScore pts dirs[i]
		note ("slab " + names[i] + " score " + (info[1] as string) + " rad " + (info[2] as string) + " thick " + (info[3] as string) + " n " + (info[4] as string))
		if info[1] > bestS do (
			bestS = info[1]
			best = i
		)
	)
	note ("bottom " + names[best])
	local q = qAlign dirs[best] [0, 0, -1]
	local ang = acos (amax -1.0 (amin 1.0 (dot (normalize dirs[best]) [0, 0, -1])))
	note ("standDeg " + (ang as string))
	if ang > 1.0 do rotPts pts q (centroid pts)
	pts
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
		if (p.z - z0) <= h * 0.06 do (
			acc += p
			n += 1
		)
	)
	if n < 1 then (centroid pts) else (acc / n)
)
fn noseExtent band c dir = (
	local best = 0.0
	local n = 0
	local limit = cos 16.0
	for p in band do (
		local d = [p.x - c.x, p.y - c.y, 0]
		local r = length d
		if r < 1e-4 do continue
		if (dot (normalize d) dir) < limit do continue
		if r > best do best = r
		n += 1
	)
	#(best, n)
)
fn aimNose pts = (
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
		if t > 0.40 and t < 0.78 do append band p
	)
	if band.count < 20 do band = pts
	local c = baseCenter pts
	local bestI = 1
	local bestR = -1.0
	for i = 1 to band.count do (
		local r = length [band[i].x - c.x, band[i].y - c.y, 0]
		if r > bestR do (
			bestR = r
			bestI = i
		)
	)
	local a = band[bestI]
	local ad = [a.x - c.x, a.y - c.y, 0]
	local bestJ = 1
	local bestR2 = -1.0
	for i = 1 to band.count do (
		local d = [band[i].x - c.x, band[i].y - c.y, 0]
		if (dot d ad) >= 0.0 do continue
		local r = length d
		if r > bestR2 do (
			bestR2 = r
			bestJ = i
		)
	)
	local b = band[bestJ]
	local axis = [a.x - b.x, a.y - b.y, 0]
	if (length axis) < 1e-6 then axis = [1, 0, 0] else axis = normalize axis
	local f1 = normalize [-axis.y, axis.x, 0]
	local f2 = -f1
	local e1 = noseExtent band c f1
	local e2 = noseExtent band c f2
	note ("tips " + (a as string) + " " + (b as string))
	note ("sideAxis " + (axis as string))
	note ("noseA " + (f1 as string) + " r " + (e1[1] as string) + " n " + (e1[2] as string))
	note ("noseB " + (f2 as string) + " r " + (e2[1] as string) + " n " + (e2[2] as string))
	if e1[1] >= e2[1] then f1 else f2
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
	try (DialogMonitorOPS.UnRegisterNotification id:#mgLv3) catch ()
	try (
		DialogMonitorOPS.RegisterNotification clickOk id:#mgLv3
		DialogMonitorOPS.Enabled = true
	) catch ()
	resetMaxFile #noPrompt
	try (mapPaths.add @"d:\Custom\TD\temp\mg3-lv3-src") catch ()
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
	mesh.name = "mg3"
	mesh.parent = undefined
	local pts = captureWorld mesh
	local bb = bboxOf pts
	note ("captured " + (pts.count as string) + " pts " + (bb[1] as string) + " " + (bb[2] as string))
	note ("world " + (mesh.min as string) + " " + (mesh.max as string))
	-- Default FBX import is already Z-up, with the base on Z=0.
	-- A 90-degree "stand" here tips the turret onto its side.
	local nose = aimNose pts
	local yaw = atan2 nose.y nose.x
	local delta = -90.0 - yaw
	while delta > 180.0 do delta -= 360.0
	while delta < -180.0 do delta += 360.0
	note ("nose " + (nose as string) + " yaw " + (yaw as string) + " delta " + (delta as string))
	if (abs delta) > 0.4 do (
		local q = (angleaxis delta [0, 0, 1]) as quat
		rotPts pts q (baseCenter pts)
		note "yawed"
	)
	place pts
	writeWorld mesh pts
	local nose2 = aimNose pts
	note ("finalNose " + (nose2 as string) + " yaw " + ((atan2 nose2.y nose2.x) as string))
	note ("bbox " + (mesh.min as string) + " " + (mesh.max as string))

	local maps = getClassInstances Bitmaptexture
	for t in maps do (
		t.filename = texPath
		try (t.reload()) catch ()
	)
	if maps.count == 0 do (
		local bm = Bitmaptexture filename:texPath
		local std = Standardmaterial name:"mg3_base"
		std.diffuseMap = bm
		std.diffuseMapEnable = true
		std.showInViewport = true
		showTextureMap std bm true
		mesh.material = std
	)
	-- The lower lamp sits at about 0.32 to 0.54 of the height.
	-- Cutting at 0.375 ran through the lens. 0.308 is the dark collar under it.
	local cutFrac = 0.308
	local cutZ = mesh.min.z + (mesh.max.z - mesh.min.z) * cutFrac
	note ("cutZ " + (cutZ as string) + " frac " + (cutFrac as string))
	local skin = mesh.material
	local allFaces = #{1..mesh.numfaces}
	meshop.slice mesh allFaces [0, 0, 1] cutZ separate:true
	update mesh
	local headBits = #{}
	local headN = 0
	for f = 1 to mesh.numfaces do (
		local fv = getFace mesh f
		local c = ((getVert mesh fv.x) + (getVert mesh fv.y) + (getVert mesh fv.z)) / 3.0
		if c.z > cutZ do (
			headBits[f] = true
			headN += 1
		)
	)
	note ("headFaces " + (headN as string) + " of " + (mesh.numfaces as string))
	if headN < 10 then throw "head empty"
	local headTri = meshop.detachFaces mesh headBits delete:true asMesh:true
	if headTri == undefined then throw "detach failed"
	local head = Editable_mesh name:"TurretHead"
	head.mesh = headTri
	head.pos = [0, 0, 0]
	update head
	update mesh
	mesh.name = "TurretBase"
	if skin != undefined do (
		mesh.material = skin
		head.material = skin
	)
	head.pivot = [0, 0, cutZ]
	note ("base " + (mesh.min as string) + " " + (mesh.max as string))
	note ("head " + (head.min as string) + " " + (head.max as string))
	note ("pivot " + (head.pivot as string))
	select #(mesh, head)
	viewport.setLayout #layout_4
	try (
		for i = 1 to 4 do (
			viewport.activeViewport = i
			local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
			vpt.VisualStyleMode = #Realistic
			vpt.ShowEdgedFaces = false
		)
	) catch ()
	viewport.activeViewport = 4
	grab #view_front (shotDir + @"\recut_front.png")
	grab #view_left (shotDir + @"\recut_left.png")
	in coordsys world move head [0, 0, 6]
	grab #view_left (shotDir + @"\recut_lift.png")
	grab #view_front (shotDir + @"\recut_lift_front.png")
	in coordsys world move head [0, 0, -6]
	select head
	try (setRefCoordsys #local) catch ()
	max rotate
	viewport.activeViewport = 1
	viewport.setType #view_front
	select #(mesh, head)
	max zoomext sel
	viewport.activeViewport = 4
	viewport.setType #view_persp_user
	max zoomext sel
	select head
	completeRedraw()
	select #(mesh, head)
	try (FBXExporterSetParam "Animation" false) catch ()
	try (FBXExporterSetParam "Cameras" false) catch ()
	try (FBXExporterSetParam "Lights" false) catch ()
	exportFile fbxPath #noPrompt selectedOnly:true using:FBXEXP
	saveMaxFile maxPath quiet:true
	select head
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
