-- Barrels are parallel to Y but point +Y. Turn them to -Y, still straight.
statusPath = @"d:\Custom\TD\temp\mg2-lv2-status.txt"
statsPath = @"d:\Custom\TD\temp\mg2-lv2-stats.txt"
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

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	writeLine statsPath "flip"
	makeDir shotDir all:true
	loadMaxFile maxPath quiet:true
	local mesh = getNodeByName "mg2"
	if mesh == undefined then throw "mg2 missing"
	local c = mesh.center
	in coordsys world about c rotate mesh (angleaxis 180 [0, 0, 1])
	resetXForm mesh
	collapseStack mesh
	update mesh
	local z0 = mesh.min.z
	local cx = (mesh.min.x + mesh.max.x) * 0.5
	local cy = (mesh.min.y + mesh.max.y) * 0.5
	in coordsys world move mesh [-cx, -cy, -z0]
	resetXForm mesh
	collapseStack mesh
	update mesh
	note ("bounds " + (mesh.min as string) + " " + (mesh.max as string))
	select mesh
	viewport.setLayout #layout_1
	viewport.setType #view_top
	try (
		local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
		vpt.VisualStyleMode = #Wireframe
	) catch ()
	max zoomext sel
	completeRedraw()
	redrawViews()
	grab #view_top (shotDir + @"\top_fixed.png")
	viewport.setType #view_front
	try (
		local vpt2 = NitrousGraphicsManager.GetActiveViewportSetting()
		vpt2.VisualStyleMode = #Realistic
	) catch ()
	max zoomext sel
	grab #view_front (shotDir + @"\front_fixed.png")
	viewport.setType #view_top
	try (
		local vpt3 = NitrousGraphicsManager.GetActiveViewportSetting()
		vpt3.VisualStyleMode = #Wireframe
	) catch ()
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
