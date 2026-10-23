-- Leave the cut turret 10010 open. TurretHead yaws on local Z.
maxPath = @"d:\Custom\TD\temp\mg-10010\10010.max"
statusPath = @"d:\Custom\TD\temp\mg-10010\open-status.txt"

fn writeLine path text = (
	local f = createFile path
	if f != undefined do (
		format "%\n" text to:f
		close f
	)
)

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	loadMaxFile maxPath quiet:true
	local base = getNodeByName "TurretBase"
	local head = getNodeByName "TurretHead"
	if base == undefined or head == undefined then throw "split nodes missing"
	select #(base, head)
	viewport.setLayout #layout_4
	try (
		for i = 1 to 4 do (
			viewport.activeViewport = i
			local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
			vpt.VisualStyleMode = #Realistic
			vpt.ShowEdgedFaces = true
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
	select head
	try (setRefCoordsys #local) catch ()
	max rotate
	writeLine statusPath "OPEN"
) catch (
	local msg = "unknown"
	try (msg = getCurrentException() as string) catch ()
	writeLine statusPath ("FAIL " + msg)
)
