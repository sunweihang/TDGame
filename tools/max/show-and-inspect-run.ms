(
  try
  (
    fileIn @"d:\Custom\TD\tools\max\show-and-inspect.ms"
  )
  catch
  (
    local f = createFile @"d:\Custom\TD\temp\creature-optimize\back-status.txt"
    format "FAIL %\n" (getCurrentException()) to:f
    close f
  )
)
