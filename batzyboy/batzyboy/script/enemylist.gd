extends Node2D

## Drag any monster .tscn into this array in the Inspector.
## main.gd reads enemy_scenes to build the spawn pool — no code changes needed to add new monsters.
@export var enemy_scenes: Array[PackedScene] = []

pass
