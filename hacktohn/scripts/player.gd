extends CharacterBody2D

# Your dialogues
var dialogues = [
	Dialogue.new("Alice", ["Hello there!", "How are you?"]),
	Dialogue.new("Bob", ["Hi Alice!", "I’m good, thanks!"])
]

func _input(event):
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == Key.KEY_H:  # Correct constant
			$DialogueUI.start_dialogue(dialogues)
		if event.keycode == Key.KEY_G:  # Correct constant
			$DialogueUI.on_next_pressed()
