extends Node2D

## Select fruit nodes from the scene tree using the node picker (same as enemylist.gd).
## Add the instanced fruit node from fruits.tscn into each slot.
@export var fruit_nodes: Array[Node] = []
