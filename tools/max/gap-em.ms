-- List vertical gaps and the neck band for the three railguns.
statusPath = @"d:\Custom\TD\temp\em-gap-status.txt"
statsPath = @"d:\Custom\TD\temp\em-gap-stats.txt"

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
fn scan id z0 z1 = (
	local maxPath = @"d:\Custom\TD\temp\em-" + id + @"\" + id + ".max"
	loadMaxFile maxPath quiet:true
	local mesh = getNodeByName id
	if mesh == undefined then throw ("no mesh " + id)
	note ("==== " + id + " faces " + (mesh.numfaces as string))
	local rows = #()
	for v = 1 to mesh.numverts do (
		local p = getVert mesh v
		append rows p
	)
	fn byZ a b = if a.z < b.z then -1 else if a.z > b.z then 1 else 0
	qsort rows byZ
	local prev = rows[1].z
	for p in rows do (
		local gap = p.z - prev
		if gap > 0.35 do (
			note ("GAP z " + (prev as string) + " -> " + (p.z as string) + " span " + (gap as string))
		)
		prev = p.z
	)
	note ("-- band " + (z0 as string) + " " + (z1 as string))
	prev = -1.0
	for p in rows do (
		if p.z < z0 or p.z > z1 do continue
		local gap = p.z - prev
		local r = length [p.x, p.y, 0]
		if gap > 0.15 or r < 12.0 do (
			note ("z " + (p.z as string) + " r " + (r as string) + " y " + (p.y as string) + " x " + (p.x as string) + " gap " + (gap as string))
		)
		prev = p.z
	)
)

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	writeLine statsPath "gap"
	scan "10014" 4.5 10.5
	scan "10015" 1.5 13.0
	scan "10016" 8.0 16.5
	writeLine statusPath "OK"
) catch (
	local msg = "unknown"
	try (msg = getCurrentException() as string) catch ()
	note ("ERROR=" + msg)
	try (note (getCurrentExceptionStackTrace())) catch ()
	writeLine statusPath ("FAIL " + msg)
)
quitMax quiet:true
