-- Cut turret 10008 at the neck column.
-- TurretHead pivots on that circle. Local Z is vertical, so it yaws 360 degrees in place.
statusPath = @"d:\Custom\TD\temp\ice-10008\split-status.txt"
statsPath = @"d:\Custom\TD\temp\ice-10008\split-stats.txt"
maxPath = @"d:\Custom\TD\temp\ice-10008\10008.max"
shotDir = @"d:\Custom\TD\temp\ice-10008\split-shots"
texPath = @"d:\Custom\TD\temp\ice-10008\textures\blue_crystal_beacon_3d_model_basecolor.JPEG"

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
fn asMesh node = (
	if classof node != Editable_mesh do convertToMesh node
	update node
	node
)
fn capOpen node = (
	try (
		addModifier node (Cap_Holes())
		collapseStack node
		update node
		note ("capped " + node.name)
	) catch (
		note ("cap skipped " + node.name)
	)
	asMesh node
)
fn worldVert node i = (
	(getVert node i) * node.objecttransform
)
fn ringInfo node z0 tol = (
	local acc = [0, 0, 0]
	local n = 0
	local r = 0.0
	for i = 1 to node.numverts do (
		local p = worldVert node i
		if (abs (p.z - z0)) > tol do continue
		acc += p
		n += 1
		local d = length [p.x, p.y, 0]
		if d > r do r = d
	)
	if n < 1 then #(0, [0, 0, 0], 0.0) else #(n, acc / n, r)
)

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	writeLine statsPath "split"
	makeDir shotDir all:true
	loadMaxFile maxPath quiet:true
	local mesh = getNodeByName "10008"
	if mesh == undefined then mesh = getNodeByName "TurretBase"
	if mesh == undefined then throw "no mesh"
	if classof mesh != Editable_mesh do convertToMesh mesh
	local skin = mesh.material
	-- Neck column has no vertices between the ring at the neck ring near z=12.44 and the egg at z=13.83.
	local cutZ = 7.5
	note ("cutZ " + (cutZ as string))
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
	mesh = capOpen mesh
	head = capOpen head
	if skin != undefined then (
		mesh.material = skin
		head.material = skin
	) else (
		local bm = Bitmaptexture filename:texPath
		local std = Standardmaterial name:"10008_base"
		std.diffuseMap = bm
		std.diffuseMapEnable = true
		std.showInViewport = true
		showTextureMap std bm true
		mesh.material = std
		head.material = std
	)
	head.pivot = [0, 0, cutZ]
	note ("base " + (mesh.min as string) + " " + (mesh.max as string) + " faces " + (mesh.numfaces as string))
	note ("head " + (head.min as string) + " " + (head.max as string) + " faces " + (head.numfaces as string))
	note ("pivot " + (head.pivot as string))
	local baseRing = ringInfo mesh cutZ 0.8
	local headRing = ringInfo head cutZ 0.8
	note ("baseRing n " + (baseRing[1] as string) + " c " + (baseRing[2] as string) + " r " + (baseRing[3] as string))
	note ("headRing n " + (headRing[1] as string) + " c " + (headRing[2] as string) + " r " + (headRing[3] as string))

	select #(mesh, head)
	viewport.setLayout #layout_1
	try (
		local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
		vpt.VisualStyleMode = #Realistic
		vpt.ShowEdgedFaces = true
	) catch ()
	grab #view_left (shotDir + @"\split_left.png")
	in coordsys world move head [0, 0, 8]
	grab #view_left (shotDir + @"\split_lift.png")
	in coordsys world move head [0, 0, -8]
	head.pivot = [0, 0, cutZ]
	local before = head.center
	in coordsys local rotate head (angleaxis 90 [0, 0, 1])
	local after = head.center
	local spun = ringInfo head cutZ 0.8
	note ("yawCenter " + (before as string) + " -> " + (after as string))
	note ("spunRing n " + (spun[1] as string) + " c " + (spun[2] as string) + " r " + (spun[3] as string))
	note ("pivotAfter " + (head.pivot as string))
	select #(mesh, head)
	grab #view_top (shotDir + @"\split_yaw90_top.png")
	grab #view_persp_user (shotDir + @"\split_yaw90.png")
	in coordsys local rotate head (angleaxis -90 [0, 0, 1])
	head.pivot = [0, 0, cutZ]
	note ("restored rot " + (head.rotation as string) + " center " + (head.center as string) + " pivot " + (head.pivot as string))

	select #(mesh, head)
	viewport.setLayout #layout_4
	try (
		for i = 1 to 4 do (
			viewport.activeViewport = i
			local vpt2 = NitrousGraphicsManager.GetActiveViewportSetting()
			vpt2.VisualStyleMode = #Realistic
			vpt2.ShowEdgedFaces = true
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
