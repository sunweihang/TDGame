-- The long barrel tip is not the aim. Use the midpoint of both muzzles.
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
-- Midpoint of the two muzzle clusters. Yaw is degrees, -90 means -Y.
fn muzzleMid mesh = (
	local z0 = mesh.min.z
	local h = amax 0.001 (mesh.max.z - z0)
	local maxr = 0.0
	for i = 1 to mesh.numverts do (
		local p = getVert mesh i
		local t = (p.z - z0) / h
		if t > 0.30 and t < 0.70 do (
			local r = length [p.x, p.y, 0]
			if r > maxr do maxr = r
		)
	)
	local lim = maxr * 0.90
	local far = #()
	for i = 1 to mesh.numverts do (
		local p = getVert mesh i
		local t = (p.z - z0) / h
		if t > 0.30 and t < 0.70 do (
			if (length [p.x, p.y, 0]) >= lim do append far p
		)
	)
	if far.count < 4 then throw "no muzzles"
	local meanx = 0.0
	for p in far do meanx += p.x
	meanx /= far.count
	local left = [0, 0, 0]
	local right = [0, 0, 0]
	local nl = 0
	local nr = 0
	for p in far do (
		if p.x < meanx then (
			left += p
			nl += 1
		) else (
			right += p
			nr += 1
		)
	)
	if nl < 1 or nr < 1 then throw "one muzzle"
	left /= nl
	right /= nr
	local mid = (left + right) * 0.5
	note ("muzzles " + (left as string) + " " + (right as string) + " mid " + (mid as string) + " n " + (far.count as string))
	mid
)

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	writeLine statsPath "fix"
	makeDir shotDir all:true
	loadMaxFile maxPath quiet:true
	local mesh = getNodeByName "mg2"
	if mesh == undefined then throw "mg2 missing"
	update mesh
	local mid = muzzleMid mesh
	local yaw = atan2 mid.y mid.x
	local delta = -90.0 - yaw
	while delta > 180.0 do delta -= 360.0
	while delta < -180.0 do delta += 360.0
	note ("yaw " + (yaw as string) + " delta " + (delta as string))
	if (abs delta) > 0.15 do (
		in coordsys world about [0, 0, mid.z] rotate mesh (angleaxis delta [0, 0, 1])
		resetXForm mesh
		collapseStack mesh
		update mesh
	)
	mid = muzzleMid mesh
	yaw = atan2 mid.y mid.x
	note ("finalYaw " + (yaw as string) + " bounds " + (mesh.min as string) + " " + (mesh.max as string))
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
	try (
		local vpt2 = NitrousGraphicsManager.GetActiveViewportSetting()
		vpt2.VisualStyleMode = #Realistic
	) catch ()
	grab #view_top (shotDir + @"\top_fixed_shaded.png")
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
