-- Radial profile of turret 10007. Find where the dragon leaves the nest.
statusPath = @"d:\Custom\TD\temp\ft-10007\probe-status.txt"
statsPath = @"d:\Custom\TD\temp\ft-10007\probe-stats.txt"
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
	writeLine statsPath "probe"
	loadMaxFile maxPath quiet:true
	local mesh = getNodeByName "10007"
	if mesh == undefined then throw "no mesh"
	local zA = mesh.min.z
	local hh = amax 0.001 (mesh.max.z - zA)
	local bins = 40
	local inner = #()
	local outer = #()
	local mid = #()
	for b = 1 to bins do (
		append inner 0
		append outer 0
		append mid 0
	)
	local snout = (getVert mesh 1)
	local tail = snout
	for v = 1 to mesh.numverts do (
		local p = getVert mesh v
		if p.y < snout.y do snout = p
		if p.y > tail.y do tail = p
		local b = int (((p.z - zA) / hh) * bins)
		if b < 0 do b = 0
		if b > (bins - 1) do b = bins - 1
		b += 1
		local r = length [p.x, p.y, 0]
		if r < 8.0 then inner[b] += 1
		else if r > 13.0 then outer[b] += 1
		else mid[b] += 1
	)
	note ("snout " + (snout as string))
	note ("tail " + (tail as string))
	for b = 1 to bins do (
		local lo = zA + ((b - 1) * hh / bins)
		note ("bin " + (b as string) + " z " + (lo as string) + " in " + (inner[b] as string) + " mid " + (mid[b] as string) + " out " + (outer[b] as string))
	)
	writeLine statusPath "OK"
) catch (
	local msg = "unknown"
	try (msg = getCurrentException() as string) catch ()
	note ("ERROR=" + msg)
	writeLine statusPath ("FAIL " + msg)
)
quitMax quiet:true