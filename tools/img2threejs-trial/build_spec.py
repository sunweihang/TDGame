"""Author the turret 10000 ObjectSculptSpec from the clay reference and measured bounds."""

import json
import math
from pathlib import Path

FIX = Path(r"d:\Custom\TD\tools\img2threejs\forge\tests\fixtures\reference_target_conformance_spec.json")
OUT = Path(r"d:\Custom\TD\tools\img2threejs-trial\object-sculpt-spec.json")
fixture = json.loads(FIX.read_text(encoding="utf-8"))


def action(role, pivot, axis, sockets=None):
    return {
        "animationRole": role,
        "pivot": {
            "mode": "explicit",
            "localPosition": pivot,
            "axis": axis,
            "confidence": 0.7,
        },
        "transformChannels": {
            "translate": True,
            "rotate": role != "static",
            "scale": False,
            "bend": False,
            "twist": False,
            "detach": False,
            "visibility": True,
            "materialState": False,
        },
        "sockets": sockets or [],
        "collider": {
            "type": "box",
            "offset": [0, 0, 0],
            "scale": [1, 1, 1],
            "isTrigger": False,
        },
        "destruction": {
            "fractureGroup": "hull",
            "seamRefs": [],
            "detachableFragments": [],
        },
    }


def box(cid, name, level, role, size, pos, material, features, parent=None, rot=None, confidence=0.7):
    w, h, d = size
    return {
        "id": cid,
        "name": name,
        "level": level,
        "role": role,
        "importance": 0.9 if level == "macro" else 0.6,
        "confidence": confidence,
        "primitive": "box",
        "topologyClass": "assembled-solid",
        "topologyRationale": "Chamfered rigid hull plate. The silhouette is a discrete faceted solid, so a scaled box is the blockout primitive.",
        "geometryDescriptor": {
            "topologyIntent": name,
            "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.06, "segments": 1},
            "uvStrategy": "generated procedural coordinates",
            "normalStrategy": "vertex normals from generated geometry",
        },
        "parent": parent,
        "attachment": None,
        "dimensions": {
            "width": w,
            "height": h,
            "depth": d,
            "units": "meters",
            "confidence": confidence,
        },
        "transform": {"position": pos, "rotation": rot or [0, 0, 0]},
        "material": material,
        "materialLayers": [material],
        "colorMaterialRecipe": {
            "dominantAlbedo": "rgba(44, 54, 66, 1.0)",
            "secondaryAlbedo": "rgba(26, 32, 40, 1.0)",
            "materialClass": "metal",
            "materialClassConfidence": 0.55,
            "evidence": ["clay-three-quarter"],
            "samplingNotes": "Clay reference is a single mid-gray. Hull albedo is inferred from turret_basecolor.png, not from these pixels.",
        },
        "localFeatures": features,
        "evidenceRefs": ["clay-three-quarter"],
        "actionProfile": action("static", [0, 0, 0], [0, 1, 0]),
    }


def tube(cid, name, level, role, start, end, radius, material, features, parent=None, confidence=0.68):
    length = (
        (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2 + (end[2] - start[2]) ** 2
    ) ** 0.5
    mid = [(start[i] + end[i]) * 0.5 for i in range(3)]
    return {
        "id": cid,
        "name": name,
        "level": level,
        "role": role,
        "importance": 0.85 if level == "macro" else 0.55,
        "confidence": confidence,
        "primitive": "cylinder",
        "topologyClass": "assembled-solid",
        "topologyRationale": "A straight revolved solid. Cylinder matches the neck, barrel, and collar; they are not boxes.",
        "geometryDescriptor": {
            "topologyIntent": name,
            "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.02, "segments": 1},
            "uvStrategy": "generated procedural coordinates",
            "normalStrategy": "vertex normals from generated geometry",
        },
        "parent": parent,
        "attachment": {
            "parentId": parent or "root",
            "parentSocket": cid + "-mount",
            "contactType": "socket",
            "localStart": start,
            "localEnd": end,
            "baseRadius": radius,
            "endRadius": radius,
            "overlap": 0.04,
            "embedDepth": 0.04,
            "gapTolerance": 0.01,
        },
        "dimensions": {
            "width": radius * 2,
            "height": round(length, 4),
            "depth": radius * 2,
            "units": "meters",
            "confidence": confidence,
        },
        "transform": {"position": [round(v, 4) for v in mid], "rotation": [0, 0, 0]},
        "material": material,
        "materialLayers": [material],
        "colorMaterialRecipe": {
            "dominantAlbedo": "rgba(44, 54, 66, 1.0)",
            "secondaryAlbedo": "rgba(57, 208, 234, 1.0)",
            "materialClass": "metal",
            "materialClassConfidence": 0.55,
            "evidence": ["clay-three-quarter"],
            "samplingNotes": "Radius and axis come from the oriented mesh bounds. Color is inferred.",
        },
        "localFeatures": features,
        "evidenceRefs": ["clay-three-quarter"],
        "actionProfile": action("yaw" if cid == "neck" else "static", [0, 0, 0], [0, 1, 0] if cid == "neck" else [0, 0, 1]),
    }


def material(mid, name, color, roughness, metalness, emissive=None):
    payload = {
        "id": mid,
        "name": name,
        "type": "standard",
        "shaderModel": "MeshPhysicalMaterial",
        "baseColor": color,
        "color": color,
        "albedo": {
            "dominant": color,
            "secondary": ["#c5d4e0", "#3d4c58"],
            "samplingNotes": "Light blue-gray painted metal read from the textured hero render of turret 10000.",
        },
        "colorVariation": {
            "palette": [color, "#c5d4e0", "#3d4c58"],
            "pattern": "panel-breaks",
            "amplitude": 0.06,
            "heightCorrelation": 0.1,
        },
        "roughness": {"base": roughness, "variation": 0.08},
        "metalness": {"base": metalness, "variation": 0.04},
        "clearcoat": 0.4,
        "clearcoatRoughness": 0.3,
        "localOverrides": [],
        "textureless": {
            "declared": True,
            "evidence": ["hero.png panel breaks are geometric, not grain"],
        },
    }
    if emissive:
        payload["emissive"] = emissive
        payload["emissiveIntensity"] = 2.2
        payload["roughness"]["base"] = 0.28
        payload["clearcoat"] = 0.15
    return payload


def ring(sides, radius):
    pts = []
    for i in range(sides):
        a = (i / sides) * math.pi * 2 + math.pi / sides
        pts.append([round(math.cos(a) * radius, 4), round(math.sin(a) * radius, 4)])
    return pts


def solid(cid, name, level, role, primitive, descriptor, pos, material, features, rot=None, confidence=0.7):
    return {
        "id": cid,
        "name": name,
        "level": level,
        "role": role,
        "importance": 0.9 if level == "macro" else 0.55,
        "confidence": confidence,
        "primitive": primitive,
        "topologyClass": "assembled-solid",
        "topologyRationale": "Hard-surface plate or turned solid. The plan or profile is authored, not a unit box.",
        "geometryDescriptor": descriptor,
        "parent": None,
        "attachment": None,
        "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "meters", "confidence": confidence},
        "transform": {"position": pos, "rotation": rot or [0, 0, 0]},
        "material": material,
        "materialLayers": [material],
        "colorMaterialRecipe": {
            "dominantAlbedo": "rgba(142, 164, 182, 1.0)",
            "secondaryAlbedo": "rgba(61, 76, 88, 1.0)",
            "materialClass": "metal",
            "materialClassConfidence": 0.6,
            "evidence": ["clay-three-quarter"],
            "samplingNotes": "Albedo from the textured turret render. Profile sizes are in meters.",
        },
        "localFeatures": features,
        "evidenceRefs": ["clay-three-quarter"],
        "actionProfile": action("static", [0, 0, 0], [0, 1, 0]),
    }


hull = material("hullPaint", "Machined hull", "#8ea4b6", 0.36, 0.62)
dark = material("darkPanel", "Recessed panel", "#3d4c58", 0.5, 0.45)
glow = material("cyanGlow", "Cyan emissive accent", "#14343c", 0.28, 0.1, "#3ad7ff")
glow["localOverrides"] = [
    {
        "id": "cyan-band",
        "kind": "emissive",
        "description": "Cyan band on the barrel sleeve, inferred from the basecolor atlas.",
        "roughness": 0.22,
    }
]
hull["localOverrides"] = [
    {
        "id": "panel-seam-darkening",
        "kind": "seam",
        "description": "Cavity darkening along the head panel breaks.",
        "roughness": 0.7,
    }
]

feet = []
foot_ids = []
for name, x, z in (
    ("foot-px-pz", 1.45, 1.05),
    ("foot-nx-pz", -1.45, 1.05),
    ("foot-px-nz", 1.45, -1.45),
    ("foot-nx-nz", -1.45, -1.45),
):
    foot_ids.append(name)
    feet.append(
        solid(
            name,
            "Corner foot",
            "meso",
            "foot",
            "extrude",
            {"profile2D": {"points": [[-0.22, -0.28], [0.22, -0.28], [0.22, 0.28], [-0.22, 0.28]], "depth": 0.12}, "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"},
            [x, 0, z],
            "darkPanel",
            [{"id": name + "-pad", "description": "Small pad under the base corner.", "confidence": 0.6, "level": "meso", "evidence": ["clay-three-quarter"]}],
            [-math.pi / 2, 0, 0],
            confidence=0.6,
        )
    )

RX = round(math.pi / 2, 6)
components = [
    solid(
        "baseHull", "Octagonal base", "macro", "body", "extrude",
        {"profile2D": {"points": ring(8, 1.72), "depth": 0.5}, "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"},
        [0, 0.2, -0.15], "hullPaint",
        [{"id": "base-chamfer", "description": "Eight-sided base plan.", "confidence": 0.75, "level": "macro", "evidence": ["clay-three-quarter"]}],
        [-RX, 0, 0],
    ),
    solid(
        "baseDeck", "Base deck", "macro", "body", "extrude",
        {"profile2D": {"points": ring(8, 1.28), "depth": 0.16}, "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"},
        [0, 0.7, -0.15], "darkPanel",
        [{"id": "base-panel-seam", "description": "Inset deck on the base.", "confidence": 0.6, "level": "micro", "evidence": ["clay-three-quarter"]}],
        [-RX, 0, 0],
    ),
    solid(
        "neck", "Yaw neck", "macro", "collar", "lathe",
        {"latheProfile": {"points": [[0.68, -0.2], [0.6, -0.05], [0.5, 0.08], [0.54, 0.18]], "segments": 28}, "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"},
        [0, 1.33, 0.02], "hullPaint",
        [{"id": "neck-ring", "description": "Turned neck under the yaw line.", "confidence": 0.7, "level": "macro", "evidence": ["clay-three-quarter"]}],
    ),
    solid(
        "headHousing", "Head housing", "macro", "housing", "extrude",
        {"profile2D": {"points": [[-1.05, -0.9], [-0.7, -1.0], [0.7, -1.0], [1.05, -0.9], [1.15, -0.4], [1.15, 0.55], [0.85, 0.95], [-0.85, 0.95], [-1.15, 0.55], [-1.15, -0.4]], "depth": 1.05}, "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"},
        [0, 1.58, -0.05], "hullPaint",
        [
            {"id": "head-facet", "description": "Chamfered housing plan.", "confidence": 0.7, "level": "macro", "evidence": ["clay-three-quarter"]},
            {"id": "head-groove", "description": "Side step in the housing plan.", "confidence": 0.5, "level": "micro", "evidence": ["clay-three-quarter"]},
        ],
        [-RX, 0, 0],
    ),
    solid(
        "barrel", "Stepped barrel", "macro", "barrel", "lathe",
        {"latheProfile": {"points": [[0.46, -0.9], [0.44, -0.65], [0.32, -0.48], [0.3, 0.35], [0.28, 0.5], [0.4, 0.72], [0.36, 0.9]], "segments": 28}, "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"},
        [0, 2.15, 1.75], "hullPaint",
        [{"id": "muzzle-bore", "description": "Stepped barrel along +Z.", "confidence": 0.7, "level": "macro", "evidence": ["clay-three-quarter"]}],
        [RX, 0, 0],
    ),
    solid(
        "muzzleCollar", "Muzzle glow ring", "meso", "collar", "lathe",
        {"latheProfile": {"points": [[0.5, -0.05], [0.58, -0.01], [0.58, 0.04], [0.5, 0.08]], "segments": 28}, "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"},
        [0, 2.15, 2.58], "cyanGlow",
        [{"id": "collar-step", "description": "Emissive step at the muzzle.", "confidence": 0.55, "level": "meso", "evidence": ["clay-three-quarter"]}],
        [RX, 0, 0],
    ),
    solid(
        "sidePodPos", "Side housing +X", "meso", "housing", "extrude",
        {"profile2D": {"points": ring(6, 0.28), "depth": 0.7}, "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"},
        [1.25, 1.85, 0.1], "darkPanel",
        [{"id": "pod-pos-face", "description": "Side block on +X.", "confidence": 0.5, "level": "meso", "evidence": ["clay-three-quarter"]}],
        [-RX, 0, 0],
    ),
    solid(
        "sidePodNeg", "Side housing -X", "meso", "housing", "extrude",
        {"profile2D": {"points": ring(6, 0.28), "depth": 0.7}, "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"},
        [-1.25, 1.85, 0.1], "darkPanel",
        [{"id": "pod-neg-face", "description": "Side block on -X, mirrored in X.", "confidence": 0.45, "level": "meso", "evidence": ["clay-three-quarter"]}],
        [-RX, 0, 0],
    ),
    *feet,
]

components[3]["actionProfile"] = action(
    "pitch",
    [0, -0.7, 0],
    [1, 0, 0],
    [{"id": "pitch", "localPosition": [0, -0.7, 0], "axis": [1, 0, 0]}],
)
components[2]["actionProfile"] = action(
    "yaw",
    [0, 0.18, 0],
    [0, 1, 0],
    [{"id": "yaw", "localPosition": [0, 0.18, 0], "axis": [0, 1, 0]}],
)

details = [
    {"id": "base-chamfer-detail", "description": "Chamfered octagonal base plan.", "priority": "critical", "componentRef": "baseHull", "materialRef": "hullPaint", "evidenceRef": "clay-three-quarter", "confidence": 0.75, "realization": "geometry", "kind": "bevel", "mapsTo": {"ref": "base-chamfer"}},
    {"id": "neck-ring-detail", "description": "Cylindrical neck at the yaw line.", "priority": "critical", "componentRef": "neck", "materialRef": "hullPaint", "evidenceRef": "clay-three-quarter", "confidence": 0.7, "realization": "geometry", "kind": "contour", "mapsTo": {"ref": "neck"}},
    {"id": "head-mass-detail", "description": "Faceted head housing.", "priority": "critical", "componentRef": "headHousing", "materialRef": "hullPaint", "evidenceRef": "clay-three-quarter", "confidence": 0.7, "realization": "geometry", "kind": "contour", "mapsTo": {"ref": "headHousing"}},
    {"id": "barrel-axis-detail", "description": "Barrel along +Z.", "priority": "critical", "componentRef": "barrel", "materialRef": "hullPaint", "evidenceRef": "clay-three-quarter", "confidence": 0.7, "realization": "geometry", "kind": "contour", "mapsTo": {"ref": "barrel"}},
    {"id": "muzzle-step-detail", "description": "Larger collar at the muzzle.", "priority": "important", "componentRef": "muzzleCollar", "materialRef": "cyanGlow", "evidenceRef": "clay-three-quarter", "confidence": 0.6, "realization": "geometry", "kind": "ridge", "mapsTo": {"ref": "muzzleCollar"}},
    {"id": "foot-set-detail", "description": "Four corner feet.", "priority": "important", "componentRef": "foot-px-pz", "materialRef": "darkPanel", "evidenceRef": "clay-three-quarter", "confidence": 0.6, "realization": "geometry", "kind": "contour", "mapsTo": {"ref": "foot-px-pz"}},
    {"id": "panel-seam-detail", "description": "Panel seam darkening on the hull.", "priority": "important", "componentRef": "baseHull", "materialRef": "hullPaint", "evidenceRef": "clay-three-quarter", "confidence": 0.5, "realization": "material", "kind": "seam", "mapsTo": {"ref": "panel-seam-darkening"}},
    {"id": "cyan-band-detail", "description": "Cyan emissive band. Inferred from the atlas, absent in the clay.", "priority": "important", "componentRef": "muzzleCollar", "materialRef": "cyanGlow", "evidenceRef": "turret-basecolor-atlas", "confidence": 0.45, "realization": "material", "kind": "emissive", "mapsTo": {"ref": "cyan-band"}},
    {"id": "side-groove-detail", "description": "Groove on the head side.", "priority": "important", "componentRef": "headHousing", "materialRef": "hullPaint", "evidenceRef": "clay-three-quarter", "confidence": 0.45, "realization": "material", "kind": "groove", "mapsTo": {"ref": "head-groove"}},
]

spec = {
    "targetName": "Turret 10000",
    "targetId": "turret-10000",
    "schemaVersion": fixture["schemaVersion"],
    "terminologyProfile": fixture["terminologyProfile"],
    "sourceImage": r"d:\Custom\TD\tools\img2threejs-trial\reference.png",
    "referenceCamera": {
        "solved": False,
        "fovDegrees": 39.6,
        "aspect": 1.0,
        "orientation": {"yaw": 40.0, "pitch": 22.0, "roll": 0.0},
        "positionHint": [3.2, 1.6, 4.2],
        "note": "Elevated three-quarter clay render. Camera was not solved for projection.",
    },
    "suitability": "conditional",
    "scores": {
        "object_isolation": 3,
        "silhouette_readability": 3,
        "depth_inference": 2,
        "primitive_decomposition": 3,
        "material_procedurality": 2,
        "occlusion_risk": 2,
        "interaction_fit": 3,
    },
    "preSpecAssessment": {
        "objectClass": {
            "primaryType": "sci-fi laser turret",
            "primaryDomain": "object",
            "formLanguage": ["geometric", "hard-surface", "chamfered"],
            "structureKind": ["articulated assembly", "stacked modules"],
            "motionPotential": ["yaw at neck", "pitch at head"],
            "materialFamilies": ["painted metal", "emissive accent"],
            "notes": "Project turret 10000. One clay view. Hidden side mirrored. Colors inferred.",
        },
        "complexity": {
            "tier": "moderate",
            "scores": {
                "silhouetteComplexity": 2,
                "componentCount": 2,
                "hierarchyDepth": 2,
                "repetitionDensity": 1,
                "materialLayerCount": 2,
                "localDetailDensity": 2,
                "occlusionRisk": 2,
                "actionReadinessNeed": 2,
            },
            "estimatedCounts": {
                "macroComponents": 4,
                "mesoComponents": 7,
                "microFeatureGroups": 4,
                "materialLayers": 3,
                "repetitionSystems": 1,
            },
            "reasoning": [
                "Four silhouette masses: base, neck, head, barrel.",
                "Meso: muzzle collar, two side housings, four feet.",
                "One repetition: the four feet.",
                "Three materials: hull paint, recessed panel, cyan accent.",
            ],
        },
        "specDepthDecision": {
            "requiredDepth": "moderate",
            "minimumComponentLevels": ["macro", "meso", "micro"],
            "needsRepetitionSystems": True,
            "needsMaterialLocalOverrides": True,
            "needsMultipleReviewViews": True,
            "needsActionReadyHierarchy": True,
            "rationale": "The silhouette is a few rigid masses, with a repeated foot set and panel/emissive overrides.",
        },
        "unknownsToResolveBeforeImplementation": [],
        "detailInventory": {
            "scanMethod": "grid-3x3",
            "targetMinDetails": 8,
            "note": "Identity details from the clay silhouette plus inferred cyan accent.",
            "details": details,
        },
        "anatomy": {"applies": False},
    },
    "qualityContract": {
        "qualityBar": "moderate",
        "definitionOfDone": [
            "Base on Y=0, muzzle toward +Z, yaw ring near Y=1.51, envelope near 4.07 x 4.00 x 4.95 m.",
            "Silhouette reads as base, neck, head, and barrel from the three-quarter view.",
            "Hidden faces stay marked as mirrored inference.",
        ],
        "minimumSpecDepth": {
            "macroComponents": 4,
            "mesoComponents": 4,
            "microFeatureGroups": 4,
            "materialLayers": 3,
            "repetitionSystems": 1,
            "reviewViewpoints": 3,
        },
        "featureGroups": [
            {
                "id": "silhouette",
                "name": "Stacked turret silhouette",
                "required": True,
                "qualityCriteria": ["Base, neck, head, and barrel occupy the measured envelope."],
                "evidenceRefs": ["clay-three-quarter"],
                "failureModes": ["A single box with no barrel."],
            },
            {
                "id": "yaw-pivot",
                "name": "Neck yaw pivot",
                "required": True,
                "qualityCriteria": ["A cylindrical neck ends at about Y=1.51 and exposes a yaw socket."],
                "evidenceRefs": ["clay-three-quarter"],
                "failureModes": ["Head welded to the base with no neck."],
            },
            {
                "id": "barrel-axis",
                "name": "Barrel axis",
                "required": True,
                "qualityCriteria": ["Barrel centerline is +Z and clears the head front."],
                "evidenceRefs": ["clay-three-quarter"],
                "failureModes": ["Barrel points up or sideways."],
            },
        ],
        "visualDeltaChecks": ["silhouette delta", "barrel axis delta", "neck height delta"],
        "antiShallowSpecRules": ["Do not treat the clay gray as the hull albedo."],
        "mustNotDo": ["Do not claim the unseen back is measured."],
    },
    "qualityTargets": {
        "targetFidelity": 0.65,
        "mustMatch": ["macro silhouette", "yaw height", "barrel axis"],
        "niceToHave": ["panel grooves", "exact chamfer plan"],
        "fpsTarget": 60,
        "reviewViewpoints": ["front-three-quarter", "front", "side"],
    },
    "selfCorrectLoop": fixture["selfCorrectLoop"],
    "featureReviewTargets": [
        {
            "id": "stacked-silhouette",
            "name": "Base neck head barrel stack",
            "tier": "critical",
            "passIds": ["blockout", "structural-pass"],
            "minimumScore": 0.7,
            "mustPass": True,
            "componentRefs": ["baseHull", "neck", "headHousing", "barrel"],
            "evidenceRefs": ["clay-three-quarter"],
        },
        {
            "id": "barrel-forward",
            "name": "Barrel points +Z",
            "tier": "critical",
            "passIds": ["blockout"],
            "minimumScore": 0.7,
            "mustPass": True,
            "componentRefs": ["barrel"],
            "evidenceRefs": ["clay-three-quarter"],
        },
        {
            "id": "feet",
            "name": "Four corner feet",
            "tier": "important",
            "passIds": ["structural-pass"],
            "minimumScore": 0.6,
            "mustPass": False,
            "componentRefs": foot_ids,
            "evidenceRefs": ["clay-three-quarter"],
        },
    ],
    "sculptPipeline": {
        "passGateMode": "locked-sequential",
        "passOrder": fixture["sculptPipeline"]["passOrder"],
        "currentPass": "blockout",
        "completedPasses": [],
        "lastCompletedPass": "",
        "blockedReason": "blockout requires a render review before the next pass",
        "nextRequiredEvidence": ["blockout render", "comparison sheet"],
    },
    "lookDevTargets": fixture["lookDevTargets"],
    "actionReadiness": fixture["actionReadiness"],
    "assumptions": [
        "File bounds scaled so height is 4.00 m, matching turret 10000.",
        "Unseen side is an X mirror.",
        "Hull color is inferred from the basecolor atlas because the reference is clay.",
    ],
    "coordinateFrame": {
        "front": "+Z",
        "up": "+Y",
        "scaleReference": "meters, height 4.00",
    },
    "silhouette": {
        "boundingShape": "stacked chamfered slab, cylinder neck, box head, cylinder barrel",
        "aspectRatios": ["width:height ~ 4.07:4.00", "width:depth ~ 4.07:4.95"],
        "symmetry": "bilateral across X",
        "dominantCurves": ["base chamfer", "neck cylinder", "barrel cylinder"],
        "negativeSpaces": ["gap under the head beside the neck", "gap between the feet"],
        "landmarks": ["yaw ring at Y=1.51", "muzzle at +Z"],
    },
    "viewEvidence": [
        {
            "id": "clay-three-quarter",
            "view": "primary",
            "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
            "observations": [
                "Isolated turret on a dark ground, clay shading.",
                "Base on the ground, mass stacked upward, a long barrel.",
            ],
            "confidence": 0.7,
        }
    ],
    "componentTree": components,
    "materials": [hull, dark, glow],
    "repetitionSystems": [
        {
            "id": "cornerFeet",
            "kind": "explicit-set",
            "level": "meso",
            "count": 4,
            "elementComponentIds": foot_ids,
            "target": "foot",
            "parent": "root",
            "realization": "Four foot meshes are authored. This system records the repetition and does not emit a second cluster.",
            "evidence": ["clay-three-quarter"],
            "confidence": 0.6,
            "buildsGeometry": True,
            "instances": 4,
            "placement": {"mode": "explicit", "axis": [0, 1, 0], "radius": 0},
        }
    ],
    "buildPasses": [
        {"id": "blockout", "goal": "Base, neck, head, barrel masses.", "componentRefs": ["baseHull", "neck", "headHousing", "barrel"], "acceptance": ["silhouette reads as a turret"]},
        {"id": "structural-pass", "goal": "Feet, collar, side housings.", "componentRefs": foot_ids + ["muzzleCollar", "sidePodPos", "sidePodNeg"], "acceptance": ["feet sit on Y=0"]},
        {"id": "form-refinement", "goal": "Chamfer and bore read.", "componentRefs": ["baseHull", "barrel"], "acceptance": ["base plan is not a sharp cube"]},
        {"id": "material-pass", "goal": "Hull, recess, cyan accent.", "componentRefs": ["baseHull", "muzzleCollar"], "acceptance": ["three materials are distinct"]},
        {"id": "surface-pass", "goal": "Panel seam darkening.", "componentRefs": ["headHousing"], "acceptance": ["seam override exists"]},
        {"id": "lighting-pass", "goal": "Key, fill, contact shadow.", "componentRefs": ["baseHull"], "acceptance": ["ground contact is visible"]},
        {"id": "interaction-pass", "goal": "Yaw and pitch sockets.", "componentRefs": ["neck", "headHousing"], "acceptance": ["sockets exist"]},
        {"id": "optimization-pass", "goal": "Stay inside the triangle budget.", "componentRefs": ["baseHull"], "acceptance": ["budget recorded"]},
    ],
    "visualEvidence": [],
    "reviewHistory": [],
    "lodPlan": fixture.get("lodPlan", {}),
    "performanceBudget": {
        "qualityPriority": "real-time",
        "targetTriangles": 5000,
        "maxDrawCalls": 20,
        "textureSize": 1024,
        "fpsTarget": 60,
        "optimizationPolicy": "low tessellation tier",
    },
    "lightingFromPhoto": [
        "key light from the upper front-left of the clay render",
        "fill light from the opposite side, lower intensity",
        "rim light on the barrel silhouette",
        "exposure about 1.0 with ACES filmic tone mapping",
        "contact shadow under the base and feet",
    ],
    "proceduralStrategy": ["Primitives only.", "No mesh import in the factory."],
    "animationAnchors": ["neck yaw socket", "head pitch socket"],
    "destructionAnchors": ["hull fracture group"],
    "risks": [
        "Single clay view. Back and underside are mirrored guesses.",
        "Cyan accent is inferred from the atlas, not from the reference pixels.",
        "Chamfer is noted on the spec but the blockout primitive is still a box or cylinder.",
    ],
    "localSpecSearch": {
        "collection": "core_3d",
        "queries": ["hard surface turret cylinder neck barrel painted metal"],
        "note": "Generic hard-surface primitive assembly. No domain plugin.",
    },
}

look = spec["lookDevTargets"]
material_pass = look.get("materialPass", {})
extraction = material_pass.get("referencePbrExtraction", {})
extraction["requiredWhenSourceImagePresent"] = False
extraction["skipReason"] = "Clay reference has no albedo. Solid paint scalars are inferred. extract_pbr_evidence would only recover gray."
material_pass["referencePbrExtraction"] = extraction
look["materialPass"] = material_pass
spec["lookDevTargets"] = look

spec["buildPasses"][0]["componentRefs"] = [item["id"] for item in components]
OUT.write_text(json.dumps(spec, indent=2), encoding="utf-8")
print("wrote", OUT, "components", len(components))
