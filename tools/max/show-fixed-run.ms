(
  try
  (
    fileIn @"d:\Custom\TD\tools\max\show-fixed.ms"
  )
  catch
  (
    local f = createFile @"d:\Custom\TD\temp\creature-optimize\show-fixed-status.txt"
    format "FAIL %\n" (getCurrentException()) to:f
    close f
  )
)
