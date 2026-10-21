-- Lengthen the short barrel so both muzzles end on the same plane.
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
fn frontVerts mesh side = (
	local out = #()
	for i = 1 to mesh.numverts do (
		local p = getVert mesh i
		if p.z < 13.0 or p.z > 21.0 do continue
		if p.y > -14.0 do continue
		if side < 0 then (
			if p.x < -3.0 and p.x > -12.0 do append out #(i, p)
		) else (
			if p.x > 3.0 and p.x < 12.0 do append out #(i, p)
		)
	)
	out
)
fn minYOf items = (
	local y = items[1][2].y
	for it in items do if it[2].y < y do y = it[2].y
	y
)
fn shiftItems mesh items y0 y1 label = (
	local cap = #()
	local ring = #()
	for it in items do (
		local dy = it[2].y - y0
		if dy < 0.8 then append cap it
		else if dy < 2.8 then append ring it
	)
	local capDelta = y1 - y0
	local ringDelta = capDelta * 0.67
	note (label + " cap " + (cap.count as string) + " d " + (capDelta as string) + " ring " + (ring.count as string) + " d " + (ringDelta as string))
	for it in cap do (
		local p = it[2]
		setVert mesh it[1] [p.x, p.y + capDelta, p.z]
	)
	for it in ring do (
		local p = it[2]
		setVert mesh it[1] [p.x, p.y + ringDelta, p.z]
	)
	#(cap.count, ring.count)
)

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	writeLine statsPath "even"
	makeDir shotDir all:true
	loadMaxFile maxPath quiet:true
	local mesh = getNodeByName "mg2"
	if mesh == undefined then throw "mg2 missing"
	update mesh
	local left = frontVerts mesh -1
	local right = frontVerts mesh 1
	if left.count < 8 or right.count < 8 then throw "barrel verts missing"
	local yL = minYOf left
	local yR = minYOf right
	note ("muzzleY " + (yL as string) + " " + (yR as string) + " n " + (left.count as string) + "/" + (right.count as string))
	local short = left
	local long = right
	local yShort = yL
	local yLong = yR
	local tag = "left"
	if yL < yR do (
		short = right
		long = left
		yShort = yR
		yLong = yL
		tag = "right"
	)
	shiftItems mesh short yShort yLong tag
	update mesh
	local left2 = frontVerts mesh -1
	local right2 = frontVerts mesh 1
	note ("after " + ((minYOf left2) as string) + " " + ((minYOf right2) as string))
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
	grab #view_top (shotDir + @"\top_even.png")
	viewport.setType #view_front
	try (
		local vpt2 = NitrousGraphicsManager.GetActiveViewportSetting()
		vpt2.VisualStyleMode = #Realistic
	) catch ()
	max zoomext sel
	grab #view_front (shotDir + @"\front_even.png")
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
