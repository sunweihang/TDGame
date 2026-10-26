-- Vertex gaps on the three new flamethrowers, so the neck cut sits in empty space.
statusPath = @"d:\Custom\TD\temp\ft-gap-status.txt"
statsPath = @"d:\Custom\TD\temp\ft-gap-stats.txt"

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
fn dumpGaps mesh zLo zHi = (
	local rows = #()
	for v = 1 to mesh.numverts do (
		local p = getVert mesh v
		if p.z < zLo or p.z > zHi do continue
		append rows p
	)
	fn byZ a b = if a.z < b.z then -1 else if a.z > b.z then 1 else 0
	qsort rows byZ
	note ("count " + (rows.count as string))
	local prev = zLo
	for p in rows do (
		local gap = p.z - prev
		local r = length [p.x, p.y, 0]
		if gap > 0.35 do (
			note ("GAP z " + (prev as string) + " -> " + (p.z as string) + " mid " + (((prev + p.z) * 0.5) as string) + " span " + (gap as string))
		)
		note ("z " + (p.z as string) + " r " + (r as string) + " y " + (p.y as string) + " x " + (p.x as string))
		prev = p.z
	)
)

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	writeLine statsPath "gaps"
	local jobs = #(
		#("10005", @"d:\Custom\TD\temp\ft-10005\10005.max", 8.0, 18.0),
		#("10006", @"d:\Custom\TD\temp\ft-10006\10006.max", 4.0, 14.0),
		#("10007", @"d:\Custom\TD\temp\ft-10007\10007.max", 3.0, 16.0)
	)
	for job in jobs do (
		note ("==== " + job[1])
		loadMaxFile job[2] quiet:true
		local mesh = getNodeByName job[1]
		if mesh == undefined then throw ("no mesh " + job[1])
		if classof mesh != Editable_mesh do convertToMesh mesh
		note ("bbox " + (mesh.min as string) + " " + (mesh.max as string))
		dumpGaps mesh job[3] job[4]
	)
	writeLine statusPath "OK"
) catch (
	local msg = "unknown"
	try (msg = getCurrentException() as string) catch ()
	note ("ERROR=" + msg)
	writeLine statusPath ("FAIL " + msg)
)
quitMax quiet:true
