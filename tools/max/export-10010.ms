-- Export turret 10010. Does not save over the Max scene.
-- Base stays 4.350731611251831 m across. Neck stays the yaw pivot. Muzzle stays -Y.
statusPath = @"d:\Custom\TD\temp\mg-10010\export-status.txt"
statsPath = @"d:\Custom\TD\temp\mg-10010\export-stats.txt"
maxPath = @"d:\Custom\TD\temp\mg-10010\10010.max"
outPath = @"d:\Custom\TD\assets\models\turret\10010.fbx"
texPath = @"d:\Custom\TD\temp\mg-10010\textures\turret_3d_model_basecolor.JPEG"

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
fn commit node pts = (
	asMesh node
	node.parent = undefined
	node.transform = (matrix3 1)
	node.objectOffsetPos = [0, 0, 0]
	node.objectOffsetRot = (quat 0 0 0 1)
	node.objectOffsetScale = [1, 1, 1]
	node.pos = [0, 0, 0]
	node.rotation = (quat 0 0 0 1)
	node.scale = [1, 1, 1]
	for i = 1 to pts.count do setVert node i pts[i]
	update node
)
fn ringCenter node z0 tol = (
	local acc = [0, 0, 0]
	local n = 0
	for i = 1 to node.numverts do (
		local p = getVert node i
		if (abs (p.z - z0)) > tol do continue
		acc += p
		n += 1
	)
	if n < 3 then undefined else #(acc / n, n)
)

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	writeLine statsPath "export"
	makeDir (getFilenamePath outPath) all:true
	loadMaxFile maxPath quiet:true
	note ("units " + (units.SystemType as string) + " scale " + (units.SystemScale as string))
	local base = getNodeByName "TurretBase"
	local head = getNodeByName "TurretHead"
	if base == undefined or head == undefined then throw "nodes missing"
	head.rotation = (quat 0 0 0 1)
	base = freezeMesh base
	head = freezeMesh head
	note ("base " + (base.min as string) + " " + (base.max as string) + " f " + (base.numfaces as string))
	note ("head " + (head.min as string) + " " + (head.max as string) + " f " + (head.numfaces as string))

	local zmin = base.min.z
	if head.min.z < zmin do zmin = head.min.z
	local zmax = base.max.z
	if head.max.z > zmax do zmax = head.max.z
	local height = zmax - zmin
	if height < 1.0 then throw "flat"
	local cutZ = head.min.z
	local ring = ringCenter head cutZ 0.35
	if ring == undefined then throw "neck ring missing"
	local pivot = ring[1]
	pivot.z = cutZ
	local foot = base.max.x - base.min.x
	local spanY = base.max.y - base.min.y
	if spanY > foot do foot = spanY
	if foot < 1.0 then throw "base foot missing"
	local fit = (4.350731611251831 / 0.0254) / foot
	local neckZ = (pivot.z - zmin) * fit
	note ("height " + (height as string) + " fit " + (fit as string))
	note ("pivot " + (pivot as string) + " n " + (ring[2] as string))
	note ("neckIn " + (neckZ as string) + " neckM " + ((neckZ * 0.0254) as string))

	local snaps = #()
	for node in #(base, head) do (
		local pts = #()
		for i = 1 to node.numverts do (
			local p = getVert node i
			append pts [((p.x - pivot.x) * fit), ((p.y - pivot.y) * fit), ((p.z - zmin) * fit)]
		)
		append snaps pts
	)
	commit base snaps[1]
	commit head snaps[2]
	local headPos = [0, 0, neckZ]
	for i = 1 to head.numverts do setVert head i ((getVert head i) - headPos)
	update head

	local root = Point pos:[0, 0, 0] name:"10010" size:0.05 box:false cross:false axistripod:false centermarker:false
	base.parent = root
	head.parent = root
	base.name = "TurretBase"
	head.name = "TurretHead"
	base.pos = [0, 0, 0]
	head.pos = headPos
	base.rotation = (quat 0 0 0 1)
	head.rotation = (quat 0 0 0 1)

	local ymin = 1e9
	local ymax = -1e9
	local xmin = 1e9
	local xmax = -1e9
	local z0 = 1e9
	local z1 = -1e9
	for n in #(base, head) do (
		if n.min.y < ymin do ymin = n.min.y
		if n.max.y > ymax do ymax = n.max.y
		if n.min.x < xmin do xmin = n.min.x
		if n.max.x > xmax do xmax = n.max.x
		if n.min.z < z0 do z0 = n.min.z
		if n.max.z > z1 do z1 = n.max.z
	)
	note ("inches " + (xmin as string) + " " + (ymin as string) + " " + (z0 as string) + " / " + (xmax as string) + " " + (ymax as string) + " " + (z1 as string))
	note ("metersX " + ((xmin * 0.0254) as string) + " " + ((xmax * 0.0254) as string))
	note ("metersY " + ((ymin * 0.0254) as string) + " " + ((ymax * 0.0254) as string))
	note ("metersZ " + ((z0 * 0.0254) as string) + " " + ((z1 * 0.0254) as string))
	note ("headPosM " + ((head.pos.x * 0.0254) as string) + " " + ((head.pos.y * 0.0254) as string) + " " + ((head.pos.z * 0.0254) as string))
	note ("baseWorld " + (base.min as string) + " " + (base.max as string))
	note ("headLocal " + (head.min as string) + " " + (head.max as string))

	if (doesFileExist texPath) do (
		local bm = Bitmaptexture filename:texPath
		bm.name = "10010_basecolor"
		local std = Standardmaterial name:"10010_skin"
		std.diffuse = color 255 255 255
		std.ambient = color 180 180 180
		std.specular = color 40 40 40
		std.glossiness = 20
		std.diffuseMap = bm
		std.diffuseMapEnable = true
		std.showInViewport = true
		showTextureMap std bm true
		base.material = std
		head.material = std
	)

	select #(root, base, head)
	try (FBXExporterSetParam "Animation" false) catch ()
	try (FBXExporterSetParam "Cameras" false) catch ()
	try (FBXExporterSetParam "Lights" false) catch ()
	try (FBXExporterSetParam "EmbedTextures" true) catch ()
	try (FBXExporterSetParam "AxisConversionMethod" "None") catch ()
	try (FBXExporterSetParam "UpAxis" "Z") catch ()
	try (FBXExporterSetParam "ConvertUnit" "m") catch ()
	try (FBXExporterSetParam "ShowWarnings" false) catch ()
	try (FBXExporterSetParam "SmoothingGroups" true) catch ()
	local exported = exportFile outPath #noPrompt selectedOnly:true using:FBXEXP
	note ("exported " + (exported as string) + " " + outPath)
	if exported != true then throw "export failed"
	writeLine statusPath "OK"
) catch (
	local msg = "unknown"
	try (msg = getCurrentException() as string) catch ()
	note ("ERROR=" + msg)
	try (note (getCurrentExceptionStackTrace())) catch ()
	writeLine statusPath ("FAIL " + msg)
)
quitMax quiet:true
