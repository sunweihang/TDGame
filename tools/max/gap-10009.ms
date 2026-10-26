-- Fine waist profile for turret 10009. Does not save.
statusPath = @"d:\Custom\TD\temp\ice-10009\gap-status.txt"
statsPath = @"d:\Custom\TD\temp\ice-10009\gap-stats.txt"
maxPath = @"d:\Custom\TD\temp\ice-10009\10009.max"

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
	local mesh = getNodeByName "10009"
	if mesh == undefined then throw "no mesh"
	if classof mesh != Editable_mesh do convertToMesh mesh
	local step = 0.25
	local zA = 4.0
	local zB = 12.0
	local bins = int ((zB - zA) / step)
	local counts = #()
	local rads = #()
	for b = 1 to bins do (
		append counts 0
		append rads 0.0
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
	)
	local gapStart = -1.0
	for b = 1 to bins do (
		local lo = zA + ((b - 1) * step)
		if counts[b] < 1 then (
			if gapStart < 0 do gapStart = lo
			continue
		)
		if gapStart >= 0 do (
			note ("gap " + (gapStart as string) + " -> " + (lo as string))
			gapStart = -1.0
		)
		note ("z " + (lo as string) + " n " + (counts[b] as string) + " r " + (rads[b] as string))
	)
	writeLine statusPath "OK"
) catch (
	local msg = "unknown"
	try (msg = getCurrentException() as string) catch ()
	note ("ERROR=" + msg)
	writeLine statusPath ("FAIL " + msg)
)
quitMax quiet:true
