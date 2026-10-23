$utf8 = New-Object System.Text.UTF8Encoding $false

function Write-SpriteMeta([string]$Png, [string]$Uuid) {
  $img = [System.Drawing.Image]::FromFile($Png)
  $w = $img.Width
  $h = $img.Height
  $img.Dispose()
  $name = [IO.Path]::GetFileNameWithoutExtension($Png)
  $inv = [Globalization.CultureInfo]::InvariantCulture
  $hw = ($w / 2.0).ToString($inv)
  $hh = ($h / 2.0).ToString($inv)
  $tex = "$Uuid@6c48a"
  $sf = "$Uuid@f9941"
  $json = @"
{
  "ver": "1.0.27",
  "importer": "image",
  "imported": true,
  "uuid": "$Uuid",
  "files": [".json", ".png"],
  "subMetas": {
    "6c48a": {
      "importer": "texture",
      "uuid": "$tex",
      "displayName": "$name",
      "id": "6c48a",
      "name": "texture",
      "userData": {
        "wrapModeS": "clamp-to-edge",
        "wrapModeT": "clamp-to-edge",
        "imageUuidOrDatabaseUri": "$Uuid",
        "isUuid": true,
        "visible": false,
        "minfilter": "linear",
        "magfilter": "linear",
        "mipfilter": "none",
        "anisotropy": 0
      },
      "ver": "1.0.22",
      "imported": true,
      "files": [".json"],
      "subMetas": {}
    },
    "f9941": {
      "importer": "sprite-frame",
      "uuid": "$sf",
      "displayName": "$name",
      "id": "f9941",
      "name": "spriteFrame",
      "userData": {
        "trimThreshold": 1,
        "rotated": false,
        "offsetX": 0,
        "offsetY": 0,
        "trimX": 0,
        "trimY": 0,
        "width": $w,
        "height": $h,
        "rawWidth": $w,
        "rawHeight": $h,
        "borderTop": 0,
        "borderBottom": 0,
        "borderLeft": 0,
        "borderRight": 0,
        "packable": false,
        "pixelsToUnit": 100,
        "pivotX": 0.5,
        "pivotY": 0.5,
        "meshType": 0,
        "vertices": {
          "rawPosition": [-$hw, -$hh, 0, $hw, -$hh, 0, -$hw, $hh, 0, $hw, $hh, 0],
          "indexes": [0, 1, 2, 2, 1, 3],
          "uv": [0, $h, $w, $h, 0, 0, $w, 0],
          "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
          "minPos": [-$hw, -$hh, 0],
          "maxPos": [$hw, $hh, 0]
        },
        "isUuid": true,
        "imageUuidOrDatabaseUri": "$tex",
        "atlasUuid": "",
        "trimType": "none"
      },
      "ver": "1.0.12",
      "imported": true,
      "files": [".json"],
      "subMetas": {}
    }
  },
  "userData": {
    "type": "sprite-frame",
    "fixAlphaTransparencyArtifacts": false,
    "hasAlpha": true,
    "redirect": "$tex"
  }
}
"@
  [IO.File]::WriteAllText("$Png.meta", $json.Replace("`r`n", "`n") + "`n", $utf8)
  Write-Output "$name ${w}x${h}"
}

Add-Type -AssemblyName System.Drawing
$dir = 'd:\Custom\TD\assets\resources\ui\hud'
Write-SpriteMeta "$dir\glass-level.png" '7c1a9e20-4b55-4d1e-9a10-11111111110b'
Write-SpriteMeta "$dir\glass-wave.png" '7c1a9e20-4b55-4d1e-9a10-11111111110c'
Write-SpriteMeta "$dir\glass-gold.png" '7c1a9e20-4b55-4d1e-9a10-11111111110d'
Write-SpriteMeta "$dir\seg-on.png" '7c1a9e20-4b55-4d1e-9a10-111111111105'
Write-SpriteMeta "$dir\seg-off.png" '7c1a9e20-4b55-4d1e-9a10-111111111106'
Write-SpriteMeta "$dir\skull.png" '7c1a9e20-4b55-4d1e-9a10-111111111107'
Write-SpriteMeta "$dir\bar-track.png" '7c1a9e20-4b55-4d1e-9a10-11111111110e'
Write-SpriteMeta "$dir\level-num.png" '2681121a-6f4a-4fde-8daa-1f4feb7281e5'
Write-SpriteMeta "$dir\digit-0.png" '7c1a9e20-4b55-4d1e-9a10-11111111110f'
Write-SpriteMeta "$dir\digit-1.png" '7c1a9e20-4b55-4d1e-9a10-111111111110'
Write-SpriteMeta "$dir\digit-2.png" '7c1a9e20-4b55-4d1e-9a10-111111111111'
Write-SpriteMeta "$dir\digit-3.png" '7c1a9e20-4b55-4d1e-9a10-111111111112'
Write-SpriteMeta "$dir\digit-4.png" '7c1a9e20-4b55-4d1e-9a10-111111111113'
Write-SpriteMeta "$dir\digit-5.png" '7c1a9e20-4b55-4d1e-9a10-111111111114'
Write-SpriteMeta "$dir\digit-6.png" '7c1a9e20-4b55-4d1e-9a10-111111111115'
Write-SpriteMeta "$dir\digit-7.png" '7c1a9e20-4b55-4d1e-9a10-111111111116'
Write-SpriteMeta "$dir\digit-8.png" '7c1a9e20-4b55-4d1e-9a10-111111111117'
Write-SpriteMeta "$dir\digit-9.png" '7c1a9e20-4b55-4d1e-9a10-111111111118'
