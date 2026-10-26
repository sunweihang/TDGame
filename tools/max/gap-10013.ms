-- Fine height profile for turret 10013. Does not save.
statusPath = @"d:\Custom\TD\temp\ice-10013\gap-status.txt"
statsPath = @"d:\Custom\TD\temp\ice-10013\gap-stats.txt"
maxPath = @"d:\Custom\TD\temp\ice-10013\10013.max"

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
	local mesh = getNodeByName "10013"
	if mesh == undefined then throw "no mesh"
	if classof mesh != Editable_mesh do convertToMesh mesh
	local step = 0.25
	local zA = 0.0
	local zB = 22.0
	local bins = int ((zB - zA) / step)
	local counts = #()
	local rads = #()
	local minY = #()
	local maxY = #()
	for b = 1 to bins do (
		append counts 0
		append rads 0.0
		append minY 9999.0
		append maxY -9999.0
	)
	for v = 1 to mesh.numverts do (
		local p = getVert mesh v
		if p.z < zA or p.z >= zB do continue
		local b = int ((p.z - zA) / step) + 1
		if b < 1 do b = 1
		if b > bins do b = bins
		counts[b] += 1
		local r = length [p.x, p.y, 0]
		if r > rads[b] do rads[b] = r
		if p.y < minY[b] do minY[b] = p.y
		if p.y > maxY[b] do maxY[b] = p.y
	)
	for b = 1 to bins do (
		local lo = zA + ((b - 1) * step)
		if counts[b] < 1 then (
			note ("z " + (lo as string) + " empty")
			continue
		)
		note ("z " + (lo as string) + " n " + (counts[b] as string) + " r " + (rads[b] as string) + " y " + (minY[b] as string) + " " + (maxY[b] as string))
	)
	writeLine statusPath "OK"
) catch (
	local msg = "unknown"
	try (msg = getCurrentException() as string) catch ()
	note ("ERROR=" + msg)
	writeLine statusPath ("FAIL " + msg)
)
quitMax quiet:true
