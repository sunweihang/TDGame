(
  local f = createFile @"d:\Custom\TD\temp\creature-optimize\show-compile.txt"
  format "start\n" to:f
  flush f
  try
  (
    fileIn @"d:\Custom\TD\tools\max\show-creature.ms"
    format "filein returned\n" to:f
  )
  catch
  (
    format "ERR %\n" (getCurrentException()) to:f
    format "STACK %\n" (getCurrentExceptionStackTrace()) to:f
  )
  flush f
  close f
)
