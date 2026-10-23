function Write-SpriteMeta {
  param(
    [string]$Path,
    [string]$Uuid,
    [int]$W,
    [int]$H,
    [int]$Border
  )
  $hw = $W / 2.0
  $hh = $H / 2.0
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
      "displayName": "$(Split-Path $Path -LeafBase)",
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
      "displayName": "$(Split-Path $Path -LeafBase)",
      "id": "f9941",
      "name": "spriteFrame",
      "userData": {
        "trimThreshold": 1,
        "rotated": false,
        "offsetX": 0,
        "offsetY": 0,
        "trimX": 0,
        "trimY": 0,
        "width": $W,
        "height": $H,
        "rawWidth": $W,
        "rawHeight": $H,
        "borderTop": $Border,
        "borderBottom": $Border,
        "borderLeft": $Border,
        "borderRight": $Border,
        "packable": false,
        "pixelsToUnit": 100,
        "pivotX": 0.5,
        "pivotY": 0.5,
        "meshType": 0,
        "vertices": {
          "rawPosition": [-$hw, -$hh, 0, $hw, -$hh, 0, -$hw, $hh, 0, $hw, $hh, 0],
          "indexes": [0, 1, 2, 2, 1, 3],
          "uv": [0, $H, $W, $H, 0, 0, $W, 0],
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
  Set-Content -Path $Path -Value $json -Encoding UTF8
}

$dir = 'd:\Custom\TD\assets\resources\ui\hud'
Write-SpriteMeta "$dir\frame.png.meta" '7c1a9e20-4b55-4d1e-9a10-111111111101' 1060 528 56
Write-SpriteMeta "$dir\level-card.png.meta" '7c1a9e20-4b55-4d1e-9a10-111111111102' 859 847 60
Write-SpriteMeta "$dir\wave-card.png.meta" '7c1a9e20-4b55-4d1e-9a10-111111111103' 1036 401 60
Write-SpriteMeta "$dir\gold-card.png.meta" '7c1a9e20-4b55-4d1e-9a10-111111111104' 563 189 40
Write-SpriteMeta "$dir\seg-on.png.meta" '7c1a9e20-4b55-4d1e-9a10-111111111105' 111 98 0
Write-SpriteMeta "$dir\seg-off.png.meta" '7c1a9e20-4b55-4d1e-9a10-111111111106' 141 124 0
Write-SpriteMeta "$dir\skull.png.meta" '7c1a9e20-4b55-4d1e-9a10-111111111107' 490 564 0
Write-SpriteMeta "$dir\coin.png.meta" '7c1a9e20-4b55-4d1e-9a10-111111111108' 544 566 0

@'
{
  "ver": "1.2.0",
  "importer": "directory",
  "imported": true,
  "uuid": "7c1a9e20-4b55-4d1e-9a10-111111111100",
  "files": [],
  "subMetas": {},
  "userData": {}
}
'@ | Set-Content -Path "$dir.meta" -Encoding UTF8
Write-Output 'metas written'
