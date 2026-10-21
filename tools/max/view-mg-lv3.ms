-- Open the level-3 gatling scene and leave 3ds Max running.

statusPath = @"d:\Custom\TD\temp\mg3-lv3-view-status.txt"
maxPath = @"d:\Custom\TD\temp\mg3-lv3\mg3-lv3.max"

fn writeLine path text = (
	local f = createFile path
	if f != undefined do (
		format "%\n" text to:f
		close f
	)
)
fn clickOk = (
	local hwnd = DialogMonitorOPS.GetWindowHandle()
	if hwnd != 0 do (
		local pressed = UIAccessor.PressButtonByName hwnd "OK"
		if not pressed do pressed = UIAccessor.PressButtonByName hwnd "Yes"
		if not pressed do pressed = UIAccessor.PressButtonByName hwnd "Continue"
	)
	true
)

try (
	writeLine statusPath "RUNNING"
	DialogMonitorOPS.RegisterNotification clickOk id:#mg3view
	DialogMonitorOPS.Enabled = true
	DialogMonitorOPS.ShowNotification()
	loadMaxFile maxPath useFileUnits:true quiet:true
	select geometry
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
	writeLine statusPath "OPEN"
) catch (
	local msg = "unknown"
	try (msg = getCurrentException() as string) catch ()
	writeLine statusPath ("FAIL " + msg)
)
try (DialogMonitorOPS.Enabled = false) catch ()
try (DialogMonitorOPS.UnRegisterNotification id:#mg3view) catch ()
