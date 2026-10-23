-- Find the empty column between the blue plinth and the red nest.
statusPath = @"d:\Custom\TD\temp\ft-10007\gap-status.txt"
statsPath = @"d:\Custom\TD\temp\ft-10007\gap-stats.txt"
maxPath = @"d:\Custom\TD\temp\ft-10007\10007.max"

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

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	writeLine statsPath "gap"
	loadMaxFile maxPath quiet:true
	local mesh = getNodeByName "TurretBase"
	if mesh == undefined then mesh = getNodeByName "10007"
	if mesh == undefined then throw "no mesh"
	local rows = #()
	for v = 1 to mesh.numverts do (
		local p = getVert mesh v
		if p.z < 3.5 or p.z > 8.5 do continue
		append rows p
	)
	fn byZ a b = if a.z < b.z then -1 else if a.z > b.z then 1 else 0
	qsort rows byZ
	note ("count " + (rows.count as string))
	local prev = -1.0
	for p in rows do (
		local gap = p.z - prev
		local r = length [p.x, p.y, 0]
		note ("z " + (p.z as string) + " r " + (r as string) + " y " + (p.y as string) + " gap " + (gap as string))
		prev = p.z
	)
	writeLine statusPath "OK"
) catch (
	local msg = "unknown"
	try (msg = getCurrentException() as string) catch ()
	note ("ERROR=" + msg)
	writeLine statusPath ("FAIL " + msg)
)
quitMax quiet:true