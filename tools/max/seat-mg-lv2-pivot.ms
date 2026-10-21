-- Put the head pivot on the base neck so yaw stays seated.
statusPath = @"d:\Custom\TD\temp\mg2-lv2-split-status.txt"
statsPath = @"d:\Custom\TD\temp\mg2-lv2-split-stats.txt"
maxPath = @"d:\Custom\TD\temp\mg2-lv2\mg2-lv2.max"
shotDir = @"d:\Custom\TD\temp\mg2-lv2-shots"

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
fn worldVert node i = (
	(getVert node i) * node.objecttransform
)
fn bandCenter node z0 above tol = (
	local acc = [0, 0, 0]
	local n = 0
	for i = 1 to node.numverts do (
		local p = worldVert node i
		local ok = false
		if above then ok = (p.z >= (z0 - tol)) else ok = (p.z <= (z0 + tol))
		if ok do (
			acc += p
			n += 1
		)
	)
	if n < 3 then undefined else #(acc / n, n)
)

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	writeLine statsPath "seat"
	makeDir shotDir all:true
	loadMaxFile maxPath quiet:true
	local base = getNodeByName "TurretBase"
	local head = getNodeByName "TurretHead"
	if base == undefined or head == undefined then throw "nodes missing"
	if classof base != Editable_mesh do convertToMesh base
	if classof head != Editable_mesh do convertToMesh head
	head.rotation = (quat 0 0 0 1)
	update head
	local baseHit = bandCenter base base.max.z true 0.45
	local headHit = bandCenter head head.min.z false 0.45
	if baseHit == undefined or headHit == undefined then throw "neck ring missing"
	local baseC = baseHit[1]
	local headC = headHit[1]
	note ("baseRing " + (baseC as string) + " n " + (baseHit[2] as string))
	note ("headRing " + (headC as string) + " n " + (headHit[2] as string))
	local shift = [baseC.x - headC.x, baseC.y - headC.y, baseC.z - headC.z]
	note ("shift " + (shift as string))
	in coordsys world move head shift
	update head
	head.pivot = [baseC.x, baseC.y, baseC.z]
	note ("pivot " + (head.pivot as string) + " pos " + (head.pos as string))

	headHit = bandCenter head head.min.z false 0.45
	local seated = headHit[1]
	note ("seated " + (seated as string))
	local probe = worldVert head 1
	local bestD = 1e9
	local probeI = 1
	for i = 1 to head.numverts do (
		local p = worldVert head i
		if p.z > (head.min.z + 0.5) do continue
		local d = length [p.x - baseC.x, p.y - baseC.y, 0]
		if d < bestD do (
			bestD = d
			probe = p
			probeI = i
		)
	)
	local before = worldVert head probeI
	in coordsys local rotate head (angleaxis 90 [0, 0, 1])
	local after = worldVert head probeI
	local drift = length [after.x - before.x, after.y - before.y, after.z - before.z]
	headHit = bandCenter head (baseC.z) false 0.6
	local spun = headHit[1]
	note ("neckDrift " + (drift as string) + " spunRing " + (spun as string))
	in coordsys local rotate head (angleaxis 90 [0, 0, 1])
	select #(base, head)
	viewport.setLayout #layout_1
	try (
		local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
		vpt.VisualStyleMode = #Realistic
		vpt.ShowEdgedFaces = false
	) catch ()
	viewport.setType #view_persp_user
	max zoomext sel
	grab #view_persp_user (shotDir + @"\seat_yaw180.png")
	in coordsys local rotate head (angleaxis 180 [0, 0, 1])
	note ("restored " + (head.rotation as string))
	try (toolMode.pivotCenter()) catch (note "no pivotCenter")
	try (setRefCoordsys #local) catch ()
	select head
	max rotate
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
