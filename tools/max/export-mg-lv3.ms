-- Export the level-3 gatling as turret 10003.
-- Hierarchy matches the other guns: 10003 / TurretBase + TurretHead / Barrel.
-- Barrel vertices are in head space. The head sits on the neck. Muzzle stays -Y.

statusPath = @"d:\Custom\TD\temp\mg3-lv3-export-status.txt"
statsPath = @"d:\Custom\TD\temp\mg3-lv3-export-stats.txt"
maxPath = @"d:\Custom\TD\temp\mg3-lv3\mg3-lv3.max"
outPath = @"d:\Custom\TD\assets\models\turret\10003.fbx"
texPath = @"d:\Custom\TD\assets\models\turret\10003_basecolor.png"

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
fn capture node = (
	local tm = node.objecttransform
	local pts = #()
	pts.count = node.numverts
	for i = 1 to node.numverts do pts[i] = (getVert node i) * tm
	pts
)
fn bounds pts = (
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
fn commit node pts = (
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

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	writeLine statsPath "start"
	loadMaxFile maxPath quiet:true
	sliderTime = 0f
	local base = getNodeByName "TurretBase"
	local gun = getNodeByName "TurretHead"
	if base == undefined or gun == undefined then throw "nodes missing"
	if classof gun == Point do throw "TurretHead is already a pivot"
	local basePts = capture base
	local gunPts = capture gun
	local bb = bounds basePts
	local gb = bounds gunPts
	local zmin = bb[1].z
	if gb[1].z < zmin do zmin = gb[1].z
	local zmax = bb[2].z
	if gb[2].z > zmax do zmax = gb[2].z
	local height = zmax - zmin
	if height < 1.0 then throw "flat"
	-- Max is inches. 157.4803 in = 4 m, so ConvertUnit "m" lands on the shared turret height.
	local fit = 157.4803149606299 / height
	local pivot = [(bb[1].x + bb[2].x) * 0.5, (bb[1].y + bb[2].y) * 0.5, bb[2].z]
	note ("srcHeight " + (height as string) + " fit " + (fit as string) + " pivot " + (pivot as string))
	local neckZ = (pivot.z - zmin) * fit
	note ("neckIn " + (neckZ as string) + " neckM " + ((neckZ * 0.0254) as string))
	for i = 1 to basePts.count do (
		local p = basePts[i]
		basePts[i] = [((p.x - pivot.x) * fit), ((p.y - pivot.y) * fit), ((p.z - zmin) * fit)]
	)
	for i = 1 to gunPts.count do (
		local p = gunPts[i]
		gunPts[i] = [((p.x - pivot.x) * fit), ((p.y - pivot.y) * fit), ((p.z - zmin) * fit) - neckZ]
	)
	commit base basePts
	commit gun gunPts
	gun.name = "Barrel"
	local barrel = gun
	local head = Point pos:[0, 0, neckZ] name:"TurretHead" size:0.05 box:false cross:false axistripod:false centermarker:false
	local root = Point pos:[0, 0, 0] name:"10003" size:0.05 box:false cross:false axistripod:false centermarker:false
	base.parent = root
	head.parent = root
	barrel.parent = head
	base.transform = (matrix3 1)
	head.transform = (matrix3 1)
	barrel.transform = (matrix3 1)
	base.pos = [0, 0, 0]
	head.pos = [0, 0, neckZ]
	barrel.pos = [0, 0, 0]
	note ("base " + (base.min as string) + " " + (base.max as string))
	note ("barrel " + (barrel.min as string) + " " + (barrel.max as string))

	local kick = 2.2 * fit
	note ("kick " + (kick as string))
	head.pos.controller = Position_XYZ()
	barrel.pos.controller = Position_XYZ()
	frameRate = 30
	animationRange = interval 0f 6f
	with animate on (
		at time 0f (
			head.pos = [0, 0, neckZ]
			barrel.pos = [0, 0, 0]
		)
		at time 2f (
			head.pos = [0, 0, neckZ]
			barrel.pos = [0, kick, 0]
		)
		at time 6f (
			head.pos = [0, 0, neckZ]
			barrel.pos = [0, 0, 0]
		)
	)
	sliderTime = 0f

	if (doesFileExist texPath) do (
		local bm = Bitmaptexture filename:texPath
		local std = Standardmaterial name:"mg3_skin"
		std.diffuse = color 255 255 255
		std.ambient = color 180 180 180
		std.diffuseMap = bm
		std.diffuseMapEnable = true
		std.showInViewport = true
		showTextureMap std bm true
		base.material = std
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
