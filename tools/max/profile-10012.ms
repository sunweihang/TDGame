-- Height profile of turret 10012, used to place the neck cut.
statusPath = @"d:\Custom\TD\temp\mg-10012\profile-status.txt"
statsPath = @"d:\Custom\TD\temp\mg-10012\profile-stats.txt"
maxPath = @"d:\Custom\TD\temp\mg-10012\10012.max"

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
	writeLine statsPath "profile"
	loadMaxFile maxPath quiet:true
	local mesh = getNodeByName "10012"
	if mesh == undefined then throw "no mesh"
	if classof mesh != Editable_mesh do convertToMesh mesh
	note ("name " + mesh.name + " verts " + (mesh.numverts as string) + " faces " + (mesh.numfaces as string))
	note ("bbox " + (mesh.min as string) + " " + (mesh.max as string))
	local zA = mesh.min.z
	local hh = amax 0.001 (mesh.max.z - zA)
	local bins = 40
	local rads = #()
	local counts = #()
	local cens = #()
	for b = 1 to bins do (
		append rads 0.0
		append counts 0
		append cens [0, 0, 0]
	)
	for v = 1 to mesh.numverts do (
		local p = getVert mesh v
		local b = int (((p.z - zA) / hh) * bins)
		if b < 0 do b = 0
		if b > (bins - 1) do b = bins - 1
		b += 1
		counts[b] += 1
		cens[b] += p
	)
	for b = 1 to bins do (
		if counts[b] < 1 do (
			note ("bin " + (b as string) + " empty")
			continue
		)
		cens[b] /= counts[b]
		local r0 = 0.0
		local rC = 0.0
		local lo = zA + ((b - 1) * hh / bins)
		local hiZ = zA + (b * hh / bins)
		for v = 1 to mesh.numverts do (
			local p = getVert mesh v
			if p.z < lo or (p.z >= hiZ and b < bins) do continue
			local d0 = length [p.x, p.y, 0]
			local dC = length [p.x - cens[b].x, p.y - cens[b].y, 0]
			if d0 > r0 do r0 = d0
			if dC > rC do rC = dC
		)
		rads[b] = r0
		note ("bin " + (b as string) + " z " + (lo as string) + " n " + (counts[b] as string) + " r0 " + (r0 as string) + " rC " + (rC as string) + " c " + (cens[b] as string))
	)
	writeLine statusPath "OK"
) catch (
	local msg = "unknown"
	try (msg = getCurrentException() as string) catch ()
	note ("ERROR=" + msg)
	writeLine statusPath ("FAIL " + msg)
)
quitMax quiet:true
