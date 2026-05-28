extends Node2D

## Instance enemy scenes as children of enemies.tscn, then pick them here with the node picker.
## main.gd uses scene_file_path on each node to load fresh copies for spawning.
@export var enemy_nodes: Array[Node] = []
