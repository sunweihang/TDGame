-- Import the three railguns. Bake so Z is up, the base sits on Z=0,
-- X is centered, and the muzzle points -Y. Then write a height profile.
statusPath = @"d:\Custom\TD\temp\em-status.txt"
global gStats = @"d:\Custom\TD\temp\em-trace.txt"

fn writeLine path text = (
	local f = createFile path
	if f != undefined do (
		format "%\n" text to:f
		close f
	)
)
fn note s = (
	local f = openFile gStats mode:"a"
	if f == undefined then f = createFile gStats
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
fn profileMesh mesh = (
	note ("name " + mesh.name + " verts " + (mesh.numverts as string) + " faces " + (mesh.numfaces as string))
	note ("bbox " + (mesh.min as string) + " " + (mesh.max as string))
	local zA = mesh.min.z
	local hh = amax 0.001 (mesh.max.z - zA)
	local bins = 40
	local counts = #()
	local cens = #()
	for b = 1 to bins do (
		append counts 0
		append cens [0, 0, 0]
	)
	for v = 1 to mesh.numverts do (
		local p = getVert mesh v
		local b = int (((p.z - zA) / hh) * bins)
		if b < 0 do b = 0
		if b > (bins - 1) do b = bins - 1
		b += 1
		counts[b] += 1
		cens[b] += p
	)
	for b = 1 to bins do (
		if counts[b] < 1 do (
			note ("bin " + (b as string) + " empty")
			continue
		)
		cens[b] /= counts[b]
		local r0 = 0.0
		local rC = 0.0
		local lo = zA + ((b - 1) * hh / bins)
		local hiZ = zA + (b * hh / bins)
		for v = 1 to mesh.numverts do (
			local p = getVert mesh v
			if p.z < lo or (p.z >= hiZ and b < bins) do continue
			local d0 = length [p.x, p.y, 0]
			local dC = length [p.x - cens[b].x, p.y - cens[b].y, 0]
			if d0 > r0 do r0 = d0
			if dC > rC do rC = dC
		)
		note ("bin " + (b as string) + " z " + (lo as string) + " n " + (counts[b] as string) + " r0 " + (r0 as string) + " rC " + (rC as string) + " c " + (cens[b] as string))
	)
)
fn processOne turretId srcName texName fbmName = (
	global gStats
	local dir = @"d:\Custom\TD\temp\em-" + turretId
	local srcPath = dir + @"\" + srcName
	local texPath = dir + @"\textures\" + texName
	local fbm = dir + @"\" + fbmName
	local shotDir = dir + @"\shots"
	local maxPath = dir + @"\" + turretId + ".max"
	local jobStatus = dir + @"\status.txt"
	gStats = dir + @"\stats.txt"
	try (
		writeLine jobStatus "RUNNING"
		writeLine gStats "start"
		makeDir shotDir all:true
		makeDir dir all:true
		resetMaxFile #noPrompt
		try (mapPaths.add (dir + @"\textures")) catch ()
		try (mapPaths.add fbm) catch ()
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
		mesh.name = turretId
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
		local minY = pts[1]
		local maxY = pts[1]
		local minX = pts[1]
		local maxX = pts[1]
		for p in pts do (
			if p.y < minY.y do minY = p
			if p.y > maxY.y do maxY = p
			if p.x < minX.x do minX = p
			if p.x > maxX.x do maxX = p
		)
		note ("minY " + (minY as string))
		note ("maxY " + (maxY as string))
		note ("minX " + (minX as string))
		note ("maxX " + (maxX as string))

		local maps = getClassInstances Bitmaptexture
		for t in maps do (
			t.filename = texPath
			try (t.coords.blur = 0.01) catch ()
			try (t.reload()) catch ()
		)
		if maps.count == 0 do (
			local bm = Bitmaptexture filename:texPath
			local std = Standardmaterial name:(turretId + "_base")
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
		grab #view_persp_user (shotDir + @"\persp.png")
		profileMesh mesh
		saveMaxFile maxPath quiet:true
		note "saved"
		writeLine jobStatus "OK"
	) catch (
		local msg = "unknown"
		local stk = ""
		try (msg = getCurrentException() as string) catch ()
		try (stk = getCurrentExceptionStackTrace() as string) catch ()
		local errPath = @"d:\Custom\TD\temp\em-" + turretId + "-err.txt"
		local ef = createFile errPath
		if ef != undefined do (
			format "ERROR %\n%\n" msg stk to:ef
			close ef
		)
		writeLine jobStatus ("FAIL " + msg)
	)
)

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	try (DialogMonitorOPS.UnRegisterNotification id:#emRail) catch ()
	try (
		DialogMonitorOPS.RegisterNotification clickOk id:#emRail
		DialogMonitorOPS.Enabled = true
	) catch ()
	processOne "10014" "tripo_convert_533a7d97-3fd0-4cd5-a378-d14a9129aa93.fbx" "robotic_turret_3d_model_basecolor.JPEG" "tripo_convert_533a7d97-3fd0-4cd5-a378-d14a9129aa93.fbm"
	processOne "10015" "tripo_convert_5f7395d3-b604-4919-94e1-a09a802931fc.fbx" "futuristic_turret_3d_model_basecolor.JPEG" "tripo_convert_5f7395d3-b604-4919-94e1-a09a802931fc.fbm"
	processOne "10016" "tripo_convert_d494d758-f1fb-4170-b686-48ab506df56a.fbx" "futuristic_energy_core_3d_model_basecolor.JPEG" "tripo_convert_d494d758-f1fb-4170-b686-48ab506df56a.fbm"
	writeLine statusPath "OK"
) catch (
	local msg = "unknown"
	try (msg = getCurrentException() as string) catch ()
	writeLine statusPath ("FAIL " + msg)
)
try (DialogMonitorOPS.Enabled = false) catch ()
quitMax quiet:true
