-- Export the seated level-2 machine gun as turret 10002.
-- Does not save over the Max scene. Muzzle stays -Y. Neck stays on the base lip.

statusPath = @"d:\Custom\TD\temp\mg2-lv2-export-status.txt"
statsPath = @"d:\Custom\TD\temp\mg2-lv2-export-stats.txt"
maxPath = @"d:\Custom\TD\temp\mg2-lv2\mg2-lv2.max"
outPath = @"d:\Custom\TD\assets\models\turret\10002.fbx"
texPath = @"d:\Custom\TD\assets\models\turret\10002_basecolor.png"
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
fn asMesh node = (
	if classof node != Editable_mesh do convertToMesh node
	update node
	node
)
fn freezeMesh node = (
	asMesh node
	resetXForm node
	collapseStack node
	asMesh node
)
fn capNode node = (
	try (
		addModifier node (Cap_Holes())
		collapseStack node
	) catch (
		note ("cap failed " + (node.name as string))
	)
	asMesh node
)
fn commit node pts = (
	asMesh node
	node.parent = undefined
	node.transform = (matrix3 1)
	node.objectOffsetPos = [0, 0, 0]
	node.objectOffsetRot = (quat 0 0 0 1)
	node.objectOffsetScale = [1, 1, 1]
	node.pos = [0, 0, 0]
	node.rotation = (quat 0 0 0 1)
	for i = 1 to pts.count do setVert node i pts[i]
	update node
)
-- Vertex numbers already match the world bbox. objecttransform still carries the neck pivot and would shift them again.
fn worldVert node i = (
	getVert node i
)
fn shiftVerts node delta = (
	for i = 1 to node.numverts do setVert node i ((getVert node i) + delta)
	update node
)
fn lipCenter node z0 tol = (
	local acc = [0, 0, 0]
	local n = 0
	for i = 1 to node.numverts do (
		local p = worldVert node i
		if (abs (p.z - z0)) <= tol do (
			acc += p
			n += 1
		)
	)
	if n < 3 then undefined else #(acc / n, n)
)

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	writeLine statsPath "export"
	makeDir shotDir all:true
	loadMaxFile maxPath quiet:true
	sliderTime = 0f
	local base = getNodeByName "TurretBase"
	local head = getNodeByName "TurretHead"
	if base == undefined or head == undefined then throw "nodes missing"
	head.rotation = (quat 0 0 0 1)
	freezeMesh base
	freezeMesh head
	note ("frozen base " + (base.min as string) + " " + (base.max as string))
	note ("frozen head " + (head.min as string) + " " + (head.max as string))

	local y0 = head.min.y
	local y1 = head.max.y
	local capTol = 1.2
	local leftAcc = [0, 0, 0]
	local rightAcc = [0, 0, 0]
	local ln = 0
	local rn = 0
	for i = 1 to head.numverts do (
		local p = worldVert head i
		if p.y > (y0 + capTol) do continue
		if p.x < 0 then (
			leftAcc += p
			ln += 1
		) else (
			rightAcc += p
			rn += 1
		)
	)
	note ("caps L " + (ln as string) + " R " + (rn as string))
	if ln < 4 or rn < 4 then throw "muzzle caps missing"
	local leftC = leftAcc / ln
	local rightC = rightAcc / rn
	local leftR = 0.0
	local rightR = 0.0
	for i = 1 to head.numverts do (
		local p = worldVert head i
		if p.y > (y0 + capTol) do continue
		if p.x < 0 then (
			local dl = length [p.x - leftC.x, 0, p.z - leftC.z]
			if dl > leftR do leftR = dl
		) else (
			local dr = length [p.x - rightC.x, 0, p.z - rightC.z]
			if dr > rightR do rightR = dr
		)
	)
	local rad = leftR
	if rightR > rad do rad = rightR
	rad = rad * 1.8
	note ("axis L " + (leftC as string) + " R " + (rightC as string) + " rad " + (rad as string))
	if rad < 0.4 or rad > 5.5 then throw "tube radius"

	local steps = 36
	local step = (y1 - y0) / steps
	local rootY = y0
	local found = false
	for s = 0 to (steps - 1) do (
		local lo = y0 + (s * step)
		local hi = lo + step
		local inn = 0
		local outN = 0
		for i = 1 to head.numverts do (
			local p = worldVert head i
			if p.y < lo or p.y >= hi do continue
			local dl = length [p.x - leftC.x, 0, p.z - leftC.z]
			local dr = length [p.x - rightC.x, 0, p.z - rightC.z]
			local d = dl
			if dr < d do d = dr
			if d <= rad then inn += 1 else outN += 1
		)
		note ("slice " + (lo as string) + " in " + (inn as string) + " out " + (outN as string))
		if (lo - y0) > 5.0 and outN >= 10 and outN > inn do (
			rootY = lo
			found = true
			exit
		)
	)
	if not found then throw "no barrel root"
	note ("rootY " + (rootY as string))

	local barrelBits = #{}
	local barrelN = 0
	for f = 1 to head.numfaces do (
		local fv = getFace head f
		local a = worldVert head (fv.x as integer)
		local b = worldVert head (fv.y as integer)
		local c = worldVert head (fv.z as integer)
		local ctr = (a + b + c) / 3.0
		if ctr.y >= rootY do continue
		local da = length [a.x - leftC.x, 0, a.z - leftC.z]
		local db = length [b.x - leftC.x, 0, b.z - leftC.z]
		local dc = length [c.x - leftC.x, 0, c.z - leftC.z]
		local ra = length [a.x - rightC.x, 0, a.z - rightC.z]
		local rb = length [b.x - rightC.x, 0, b.z - rightC.z]
		local rc = length [c.x - rightC.x, 0, c.z - rightC.z]
		local onLeft = da <= rad and db <= rad and dc <= rad
		local onRight = ra <= rad and rb <= rad and rc <= rad
		if onLeft or onRight do (
			barrelBits[f] = true
			barrelN += 1
		)
	)
	note ("barrelFaces " + (barrelN as string))
	if barrelN < 20 then throw "barrel empty"
	local barrel = copy head
	barrel.name = "Barrel"
	meshop.deleteFaces head barrelBits delIsoVerts:true
	local drop = #{1..barrel.numfaces}
	for f in barrelBits do drop[f] = false
	meshop.deleteFaces barrel drop delIsoVerts:true
	update head
	update barrel
	capNode head
	capNode barrel
	note ("split head " + (head.min as string) + " " + (head.max as string) + " f " + (head.numfaces as string))
	note ("split barrel " + (barrel.min as string) + " " + (barrel.max as string) + " f " + (barrel.numfaces as string))
	if barrel.min.y > -16.0 then throw "barrel lost the muzzle"
	if head.min.y < -16.0 then throw "head still has the muzzle"
	local barrelMidZ = (barrel.min.z + barrel.max.z) * 0.5
	note ("barrelMidZ " + (barrelMidZ as string))
	if barrelMidZ < (head.min.z + 4.0) then throw "barrel dropped"

	local keep = barrel.pos
	in coordsys world move barrel [0, 10, 0]
	select #(base, head, barrel)
	viewport.setLayout #layout_1
	try (
		local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
		vpt.VisualStyleMode = #Realistic
		vpt.ShowEdgedFaces = false
	) catch ()
	grab #view_top (shotDir + @"\export_split_top.png")
	grab #view_persp_user (shotDir + @"\export_split_persp.png")
	barrel.pos = keep

	local baseLip = lipCenter base base.max.z 0.2
	local headLip = lipCenter head head.min.z 0.2
	if baseLip == undefined or headLip == undefined then throw "lip missing"
	local baseC = baseLip[1]
	local headC = headLip[1]
	note ("baseLip " + (baseC as string) + " n " + (baseLip[2] as string))
	note ("headLip " + (headC as string) + " n " + (headLip[2] as string))
	local seat = [baseC.x - headC.x, baseC.y - headC.y, base.max.z - head.min.z]
	note ("seat " + (seat as string))
	shiftVerts head seat
	shiftVerts barrel seat

	local zmin = base.min.z
	if head.min.z < zmin do zmin = head.min.z
	if barrel.min.z < zmin do zmin = barrel.min.z
	local zmax = base.max.z
	if head.max.z > zmax do zmax = head.max.z
	if barrel.max.z > zmax do zmax = barrel.max.z
	local height = zmax - zmin
	if height < 1.0 then throw "flat"
	local fit = 157.4803149606299 / height
	baseLip = lipCenter base base.max.z 0.2
	if baseLip == undefined then throw "base lip missing"
	local pivot = baseLip[1]
	pivot.z = base.max.z
	local neckZ = (pivot.z - zmin) * fit
	note ("srcHeight " + (height as string) + " fit " + (fit as string))
	note ("pivot " + (pivot as string) + " neckIn " + (neckZ as string) + " neckM " + ((neckZ * 0.0254) as string))

	local snaps = #()
	for node in #(base, head, barrel) do (
		local pts = #()
		for i = 1 to node.numverts do (
			local p = worldVert node i
			append pts [((p.x - pivot.x) * fit), ((p.y - pivot.y) * fit), ((p.z - zmin) * fit)]
		)
		append snaps pts
	)
	commit base snaps[1]
	commit head snaps[2]
	commit barrel snaps[3]
	local headPos = [0, 0, neckZ]
	for i = 1 to head.numverts do setVert head i ((getVert head i) - headPos)
	for i = 1 to barrel.numverts do setVert barrel i ((getVert barrel i) - headPos)
	update head
	update barrel

	local root = Point pos:[0, 0, 0] name:"10002" size:0.05 box:false cross:false axistripod:false centermarker:false
	base.parent = root
	head.parent = root
	barrel.parent = head
	base.name = "TurretBase"
	head.name = "TurretHead"
	barrel.name = "Barrel"
	base.pos = [0, 0, 0]
	head.pos = headPos
	barrel.pos = [0, 0, 0]
	note ("base " + (base.min as string) + " " + (base.max as string))
	note ("head " + (head.min as string) + " " + (head.max as string) + " pos " + (head.pos as string))
	note ("barrel " + (barrel.min as string) + " " + (barrel.max as string))

	local kick = 2.2 * fit
	note ("kick " + (kick as string))
	head.pos.controller = Position_XYZ()
	barrel.pos.controller = Position_XYZ()
	frameRate = 30
	animationRange = interval 0f 6f
	with animate on (
		at time 0f (
			head.pos = headPos
			barrel.pos = [0, 0, 0]
		)
		at time 2f (
			head.pos = headPos
			barrel.pos = [0, kick, 0]
		)
		at time 6f (
			head.pos = headPos
			barrel.pos = [0, 0, 0]
		)
	)
	sliderTime = 0f

	if (doesFileExist texPath) do (
		local bm = Bitmaptexture filename:texPath
		local std = Standardmaterial name:"mg2_skin"
		std.diffuse = color 255 255 255
		std.ambient = color 180 180 180
		std.diffuseMap = bm
		std.diffuseMapEnable = true
		std.showInViewport = true
		showTextureMap std bm true
		base.material = std
		head.material = std
		barrel.material = std
	)

	select #(root, base, head, barrel)
	try (FBXExporterSetParam "Animation" true) catch ()
	try (FBXExporterSetParam "BakeAnimation" true) catch ()
	try (FBXExporterSetParam "BakeFrameStart" 0) catch ()
	try (FBXExporterSetParam "BakeFrameEnd" 6) catch ()
	try (FBXExporterSetParam "SplitAnimationIntoTakes" "0|6|Fire") catch ()
	try (FBXExporterSetParam "Cameras" false) catch ()
	try (FBXExporterSetParam "Lights" false) catch ()
	try (FBXExporterSetParam "EmbedTextures" true) catch ()
	try (FBXExporterSetParam "AxisConversionMethod" "None") catch ()
	try (FBXExporterSetParam "UpAxis" "Z") catch ()
	try (FBXExporterSetParam "ConvertUnit" "m") catch ()
	try (FBXExporterSetParam "ShowWarnings" false) catch ()
	local exported = exportFile outPath #noPrompt selectedOnly:true using:FBXEXP
	note ("exported " + (exported as string))
	if exported != true then throw "export failed"
	writeLine statusPath "OK"
	quitMax quiet:true
) catch (
	local msg = "unknown"
	try (msg = getCurrentException() as string) catch ()
	note ("ERROR=" + msg)
	try (note (getCurrentExceptionStackTrace())) catch ()
	writeLine statusPath ("FAIL " + msg)
	quitMax quiet:true
)
