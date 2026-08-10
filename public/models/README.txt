Drop your .glb model files in this folder.

Expected filenames (all optional):
  car.glb
  building_a.glb  building_b.glb  building_c.glb
  tree_a.glb      tree_b.glb
  rock.glb
  streetlight.glb

The buildings and trees are POOLS, not fixed slots - you can add
building_d.glb, building_e.glb, tree_c.glb and so on. Each one needs a
single line in src/world/modelManifest.js with role: 'building' or
role: 'tree', and then every town on the map uses it. Nothing else to edit.

Keep Textures/colormap.png where it is: the Kenney models all point at it,
and without it they load fine but render plain white.

See MODELS.md in the project root for where to download them
and how to fix scale/orientation problems.
