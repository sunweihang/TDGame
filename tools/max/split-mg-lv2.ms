-- Cut the level-2 head off the pedestal at the neck.
-- TurretHead pivots on that circle, so local Z spins it 360 degrees in place.

statusPath = @"d:\Custom\TD\temp\mg2-lv2-split-status.txt"
statsPath = @"d:\Custom\TD\temp\mg2-lv2-split-stats.txt"
maxPath = @"d:\Custom\TD\temp\mg2-lv2\mg2-lv2.max"
outMax = @"d:\Custom\TD\temp\mg2-lv2\mg2-lv2.max"
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
fn heightProfile mesh bins = (
	local zA = mesh.min.z
	local hh = amax 0.001 (mesh.max.z - zA)
	local rads = #()
	local counts = #()
	for b = 1 to bins do (
		append rads 0.0
		append counts 0
	)
	for v = 1 to mesh.numverts do (
		local p = getVert mesh v
		local b = int (((p.z - zA) / hh) * bins)
		if b < 0 do b = 0
		if b > (bins - 1) do b = bins - 1
		b += 1
		counts[b] += 1
	)
	for b = 1 to bins do (
		if counts[b] < 1 do continue
		local sx = 0.0
		local sy = 0.0
		local lo = zA + ((b - 1) * hh / bins)
		local hiZ = zA + (b * hh / bins)
		for v = 1 to mesh.numverts do (
			local p = getVert mesh v
			if p.z < lo or (p.z >= hiZ and b < bins) do continue
			sx += p.x
			sy += p.y
		)
		sx /= counts[b]
		sy /= counts[b]
		local r = 0.0
		for v = 1 to mesh.numverts do (
			local p = getVert mesh v
			if p.z < lo or (p.z >= hiZ and b < bins) do continue
			local d = length [p.x - sx, p.y - sy, 0]
			if d > r do r = d
		)
		rads[b] = r
		note ("hbin " + (b as string) + " z " + (lo as string) + " n " + (counts[b] as string) + " r " + (r as string))
	)
	#(rads, counts, zA, hh)
)
fn findNeck prof = (
	local rads = prof[1]
	local counts = prof[2]
	local zA = prof[3]
	local hh = prof[4]
	local bins = rads.count
	local lo = amax 2 (int (bins * 0.18))
	local hi = int (bins * 0.40)
	local best = 0
	local bestR = 1e9
	for i = lo to hi do (
		if counts[i] >= 4 and rads[i] > 0.2 and rads[i] < bestR do (
			bestR = rads[i]
			best = i
		)
	)
	if best < 1 then throw "no neck"
	local cutBin = best
	while cutBin < bins and cutBin < (hi + 2) and counts[cutBin + 1] >= 1 and rads[cutBin + 1] < (bestR * 1.55) do (
		cutBin += 1
	)
	local cutZ = zA + ((cutBin - 0.35) * hh / bins)
	note ("neckBin " + (best as string) + " cutBin " + (cutBin as string) + " r " + (bestR as string) + " cutZ " + (cutZ as string))
	cutZ
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
)

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	writeLine statsPath "split"
	makeDir shotDir all:true
	loadMaxFile maxPath quiet:true
	local mesh = getNodeByName "mg2"
	if mesh == undefined then mesh = getNodeByName "TurretBase"
	if mesh == undefined then throw "no mesh"
	if classof mesh != Editable_mesh do convertToMesh mesh
	resetXForm mesh
	collapseStack mesh
	update mesh
	local skin = mesh.material
	local prof = heightProfile mesh 36
	local cutZ = findNeck prof
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
	capOpen mesh
	capOpen head
	if skin != undefined do (
		mesh.material = skin
		head.material = skin
	)
	head.pivot = [0, 0, cutZ]
	note ("base " + (mesh.min as string) + " " + (mesh.max as string))
	note ("head " + (head.min as string) + " " + (head.max as string))
	note ("pivot " + (head.pivot as string))

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
	local before = head.center
	in coordsys local rotate head (angleaxis 90 [0, 0, 1])
	local after = head.center
	note ("yawCenter " + (before as string) + " -> " + (after as string))
	select #(mesh, head)
	grab #view_persp_user (shotDir + @"\split_yaw90.png")
	grab #view_top (shotDir + @"\split_yaw90_top.png")
	in coordsys local rotate head (angleaxis -90 [0, 0, 1])
	note ("restored center " + (head.center as string) + " rot " + (head.rotation as string))

	select head
	try (setRefCoordsys #local) catch ()
	max rotate
	viewport.setType #view_persp_user
	select #(mesh, head)
	max zoomext sel
	completeRedraw()
	saveMaxFile outMax quiet:true
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
