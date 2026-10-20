# Image analysis — turret 10000 clay reference

Reference: `reference.png`, a clay workbench render of `assets/models/turret/turret_animated.fbx` after a -90 degree X turn so the file's Z-up rest pose becomes Y-up, muzzle toward +Z. One elevated three-quarter view. Background is flat dark gray.

## Suitability

Conditional pass. One isolated hard-surface object, readable silhouette, large enough in frame. Hidden faces are inferred by X-mirror. The clay shader removes the real albedo, so hull color is not measured from these pixels.

## Layer 1

Sci-fi laser turret. Hard-surface mechanical emplacement. `primaryDomain: object`. Identity confidence 0.85 against the project turret. Part-boundary confidence from this single view is about 0.65.

## Layer 2

Oriented file bounds, then scaled so height is 4.00 m (the project height for turret 10000):

- file size X 0.759, Y 0.747, Z 0.923, base on Y = 0
- meter scale 4 / 0.747
- resulting envelope about X 4.07, Y 4.00, Z 4.95

Bilateral symmetry across X. Shape language is geometric, chamfered, stacked. Not organic.

## Layer 3

Macro: chamfered base slab, cylindrical neck, head housing, barrel.
Meso: four feet, muzzle collar, two side housings.
Micro: panel seams, a cyan accent band (inferred, not in the clay), muzzle bore.

## Layer 4

Feet butt against the underside corners of the base. Neck sockets into the top center of the base. Head sits on the neck. Barrel overlaps the front face of the head and runs toward +Z. Yaw pivot is the neck ring at Y = 1.51.

## Layer 5 and 6

The clay pixels are one mid-gray dielectric, roughness about 0.4. Inference, not a measurement from this image: the turret basecolor atlas and the first material import are a dark blue-gray painted hull with cyan emissive panel accents. Finish class for the hull is satin paint, metalness low, not raw metal. Confidence 0.55.

## Hidden

Back of the head, the far side, and the underside except the feet. Those faces are mirrored from the visible side, not observed.
