# Dialogue.gd
class_name Dialogue

var character : String
var lines : Array

func _init(character_name: String, dialogue_lines: Array):
	character = character_name
	lines = dialogue_lines
