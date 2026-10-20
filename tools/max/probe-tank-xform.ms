statsPath = @"d:\Custom\TD\temp\player-tank\xform-stats.txt"
statusPath = @"d:\Custom\TD\temp\player-tank\xform-status.txt"
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
    loadMaxFile @"d:\Custom\TD\temp\player-tank\player-tank-turret.max" quiet:true
    for n in #($TankBody, $TankTurret) do (
        note (n.name + " transform " + (n.transform as string))
        note (n.name + " objecttransform " + (n.objecttransform as string))
        note (n.name + " offsetPos " + (n.objectOffsetPos as string) + " offsetRot " + (n.objectOffsetRot as string) + " offsetScale " + (n.objectOffsetScale as string))
        note (n.name + " rotCtrl " + ((classof n.rotation.controller) as string) + " scale " + (n.scale as string))
        note (n.name + " v1 default " + ((getVert n 1) as string))
        note (n.name + " v1 local " + ((in coordsys local getVert n 1) as string))
        note (n.name + " v1 world " + ((in coordsys world getVert n 1) as string))
        note (n.name + " bounds " + (n.min as string) + " " + (n.max as string))
    )
    note "done"
) catch (
    note ("ERROR=" + (getCurrentException() as string))
)
quitMax quiet:true
