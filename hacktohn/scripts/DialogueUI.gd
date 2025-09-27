# DialogueUI.gd
extends Control

@onready var name_label = $Panel/MarginContainer/VBoxContainer/CharacterNameLabel
@onready var text_label = $Panel/MarginContainer/VBoxContainer/DialogueTextLabel
@onready var next_button = $NextButton

var dialogue_queue: Array = []
var current_line_index: int = 0
var is_typing: bool = false
var typing_speed: float = 0.03

func _ready():
	next_button.pressed.connect(on_next_pressed)
	hide()
	
func _input(event):
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == Key.KEY_H:  # Correct constant
			next_button.emit_signal("pressed")

func start_dialogue(dialogues: Array):
	dialogue_queue = dialogues
	current_line_index = 0
	show()
	show_next_line()

func show_next_line():
	if current_line_index >= dialogue_queue.size():
		hide()
		return
	
	var dialogue = dialogue_queue[current_line_index]
	name_label.text = dialogue.character
	text_label.text = ""
	is_typing = true
	# Start typing asynchronously
	_type_text(dialogue.lines[0])

func _type_text(line: String) -> void:
	text_label.text = ""
	is_typing = true
	var char_index = 0
	var char_count = line.length()

	# Using async-style loop
	async_typing(line, char_index, char_count)

func async_typing(line: String, char_index: int, char_count: int) -> void:
	while char_index < char_count:
		text_label.text += line[char_index]
		char_index += 1
		await get_tree().create_timer(typing_speed).timeout
	is_typing = false

func on_next_pressed():
	if is_typing:
		# Finish current line instantly
		text_label.text = dialogue_queue[current_line_index].lines[0]
		is_typing = false
	else:
		current_line_index += 1
		show_next_line()
