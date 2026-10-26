-- Side and front clay shots of turret 10013. Does not save.
-- Red slab is the low gap. Green slab is the upper gap.
statusPath = @"d:\Custom\TD\temp\ice-10013\shot-status.txt"
shotDir = @"d:\Custom\TD\temp\ice-10013\shots"

fn writeLine path text = (
	local f = createFile path
	if f != undefined do (
		format "%\n" text to:f
		close f
	)
)
fn clay node ink = (
	local std = Standardmaterial name:(node.name + "_clay")
	std.diffuse = ink
	std.selfIllumAmount = 100
	node.material = std
)
fn slab z0 ink tag = (
	local box = Box width:28 length:28 height:0.12 name:tag
	box.pos = [0, 0, z0]
	clay box ink
	box
)

try (
	setQuietMode true
	writeLine statusPath "RUNNING"
	makeDir shotDir all:true
	loadMaxFile @"d:\Custom\TD\temp\ice-10013\10013.max" quiet:true
	local mesh = getNodeByName "10013"
	if mesh == undefined then throw "no mesh"
	clay mesh (color 150 170 190)
	slab 2.25 (color 220 40 40) "CutLow"
	slab 4.625 (color 40 200 80) "CutHigh"
	local bbMin = mesh.min
	local bbMax = mesh.max
	local center = (bbMin + bbMax) * 0.5
	local size = bbMax - bbMin
	local dist = amax size.x (amax size.y size.z)
	local tgt = Targetobject name:"_CamTarget"
	tgt.pos = center
	local cam = Targetcamera name:"_PreviewCam" fov:30
	cam.target = tgt
	cam.pos = center + [dist * 2.2, 0, 0]
	render camera:cam outputfile:(shotDir + @"\side.png") outputwidth:720 outputheight:960 vfb:false
	cam.pos = center + [0, -dist * 2.2, 0]
	render camera:cam outputfile:(shotDir + @"\front.png") outputwidth:720 outputheight:960 vfb:false
	writeLine statusPath "OK"
) catch (
	local msg = "unknown"
	try (msg = getCurrentException() as string) catch ()
	writeLine statusPath ("FAIL " + msg)
)
quitMax quiet:true
