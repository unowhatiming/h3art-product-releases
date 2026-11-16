extends CanvasLayer

signal start_requested(continue_saved: bool)
signal modal_changed(is_open: bool)
signal progress_changed
signal restart_requested
signal quit_requested

const Case = preload("res://case_data.gd")
const IVORY: Color = Color("e8dfca")
const GOLD: Color = Color("c6a672")
const MUTED: Color = Color("91a39e")
const INK: Color = Color("102122")

var modal_open: bool = false
var records: Array = []
var hint_level: int = 0
var ending: String = ""
var witness_topics: Array = []
var answers: Dictionary = {}
var root: Control
var hud: Control
var title_screen: Control
var overlay: Control
var content: VBoxContainer
var status_label: Label
var prompt_label: Label
var count_label: Label
var objective_label: Label
var toast_label: Label
var toast_time: float = 0.0
var in_game: bool = false
var modal_kind: String = ""
var sans: SystemFont
var serif: SystemFont

func _ready() -> void:
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS
	sans = SystemFont.new()
	sans.font_names = PackedStringArray(["Microsoft YaHei", "SimSun"])
	serif = SystemFont.new()
	serif.font_names = PackedStringArray(["SimSun", "Microsoft YaHei"])
	root = Control.new()
	root.name = "NativeInterface"
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	var theme: Theme = Theme.new()
	theme.default_font = sans
	theme.default_font_size = 18
	theme.set_color("font_color", "Label", IVORY)
	theme.set_color("font_color", "Button", IVORY)
	theme.set_color("font_hover_color", "Button", Color.WHITE)
	theme.set_color("font_pressed_color", "Button", IVORY)
	theme.set_color("font_disabled_color", "Button", Color("61716b"))
	theme.set_stylebox("normal", "Button", _style(Color("172d2c"), Color("3b5147"), 12))
	theme.set_stylebox("hover", "Button", _style(Color("284239"), GOLD, 12))
	theme.set_stylebox("pressed", "Button", _style(Color("3c4934"), GOLD, 12))
	theme.set_stylebox("disabled", "Button", _style(Color("152220"), Color("253a32"), 12))
	theme.set_stylebox("focus", "Button", _style(Color(0, 0, 0, 0), GOLD, 12))
	root.theme = theme
	_build_hud()
	toast_label = _label("", 17, GOLD)
	toast_label.name = "Toast"
	toast_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	toast_label.offset_left = -420
	toast_label.offset_right = 420
	toast_label.offset_top = 98
	toast_label.offset_bottom = 134
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(toast_label)

func _process(delta: float) -> void:
	if toast_time > 0.0:
		toast_time -= delta
		toast_label.visible = toast_time > 0.0

func _style(fill: Color, border: Color, padding: int = 20) -> StyleBoxFlat:
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = border
	style.set_border_width_all(1)
	style.content_margin_left = padding
	style.content_margin_right = padding
	style.content_margin_top = padding
	style.content_margin_bottom = padding
	return style

func _label(text: String, size: int = 18, color: Color = IVORY) -> Label:
	var label: Label = Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label

func _paragraph(text: String, size: int = 20, color: Color = IVORY) -> Label:
	var label: Label = _label(text, size, color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_constant_override("line_spacing", 9)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_child(label)
	return label

func _button(text: String, action: Callable, parent: Node = null) -> Button:
	var button: Button = Button.new()
	button.text = text
	button.custom_minimum_size.y = 46
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.pressed.connect(action)
	if parent == null:
		content.add_child(button)
	else:
		parent.add_child(button)
	return button

func _line() -> void:
	var line: HSeparator = HSeparator.new()
	line.modulate = Color("627365")
	content.add_child(line)

func _spacer(height: float = 10.0) -> void:
	var space: Control = Control.new()
	space.custom_minimum_size.y = height
	space.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(space)

func _build_hud() -> void:
	hud = Control.new()
	hud.name = "HUD"
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hud)
	hud.hide()
	var name_label: Label = _label("烛 之 影   /   收发室", 20, GOLD)
	name_label.position = Vector2(32, 24)
	hud.add_child(name_label)
	objective_label = _label("将蜡烛放到不同高度，观察同一个瞬间。", 16, MUTED)
	objective_label.position = Vector2(32, 57)
	hud.add_child(objective_label)
	count_label = _label("手记  00 / 06", 18, GOLD)
	count_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	count_label.offset_left = -188
	count_label.offset_right = -32
	count_label.offset_top = 27
	count_label.offset_bottom = 58
	hud.add_child(count_label)
	var cross: Label = _label("·", 28, Color("d8ccac"))
	cross.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	cross.offset_left = -10
	cross.offset_right = 10
	cross.offset_top = -18
	cross.offset_bottom = 18
	cross.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud.add_child(cross)
	prompt_label = _label("", 20, IVORY)
	prompt_label.name = "InteractionPrompt"
	prompt_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	prompt_label.offset_left = -470
	prompt_label.offset_right = 470
	prompt_label.offset_top = -125
	prompt_label.offset_bottom = -86
	prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud.add_child(prompt_label)
	status_label = _label("烛光 / 书桌", 17, GOLD)
	status_label.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	status_label.offset_left = 32
	status_label.offset_top = -54
	status_label.offset_right = 440
	status_label.offset_bottom = -24
	hud.add_child(status_label)
	var keys: Label = _label("WASD 移动   E 交互   J 手记   R 还原   Esc 暂停", 16, MUTED)
	keys.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	keys.offset_left = -535
	keys.offset_right = -28
	keys.offset_top = -53
	keys.offset_bottom = -24
	keys.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	hud.add_child(keys)

func show_title(has_save: bool) -> void:
	in_game = false
	_remove_overlay()
	hud.hide()
	if is_instance_valid(title_screen):
		title_screen.queue_free()
	title_screen = Control.new()
	title_screen.name = "TitleScreen"
	title_screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(title_screen)
	var wash: ColorRect = ColorRect.new()
	wash.color = Color(0.015, 0.055, 0.058, 0.83)
	wash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	title_screen.add_child(wash)
	var frame: MarginContainer = MarginContainer.new()
	frame.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	frame.add_theme_constant_override("margin_left", 96)
	frame.add_theme_constant_override("margin_top", 68)
	frame.add_theme_constant_override("margin_bottom", 42)
	frame.add_theme_constant_override("margin_right", 96)
	title_screen.add_child(frame)
	var column: VBoxContainer = VBoxContainer.new()
	column.add_theme_constant_override("separation", 16)
	frame.add_child(column)
	column.add_child(_label("第一章   /   雨夜收发室", 18, GOLD))
	var stretch_top: Control = Control.new()
	stretch_top.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(stretch_top)
	var title: Label = _label("烛 之 影", 84)
	title.add_theme_font_override("font", serif)
	column.add_child(title)
	column.add_child(_label("C A N D L E   /   S H A D O W", 16, GOLD))
	column.add_child(_label("一只伸出的手。一个被看错的瞬间。", 23, IVORY))
	column.add_child(_label("走进现场，挪动烛光。让影子，归还距离。", 18, MUTED))
	var gap: Control = Control.new()
	gap.custom_minimum_size.y = 12
	column.add_child(gap)
	var actions: HBoxContainer = HBoxContainer.new()
	actions.add_theme_constant_override("separation", 14)
	column.add_child(actions)
	var begin: Button = _button("开始调查   →", func() -> void:
		if has_save:
			_confirm_restart(true)
		else:
			start_requested.emit(false), actions)
	begin.name = "StartInvestigation"
	if has_save:
		_button("续读案卷", func() -> void: start_requested.emit(true), actions)
	_button("操作说明", _show_controls, actions)
	_button("退出", func() -> void: quit_requested.emit(), actions)
	var stretch_bottom: Control = Control.new()
	stretch_bottom.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(stretch_bottom)
	column.add_child(_label("第一人称短篇推理   ·   本地自动保存   ·   约 10–15 分钟", 15, MUTED))
	modal_open = true
	modal_kind = "title"
	modal_changed.emit(true)
	begin.grab_focus()

func enter_game() -> void:
	in_game = true
	if is_instance_valid(title_screen):
		title_screen.queue_free()
		title_screen = null
	_close_modal()
	hud.show()
	_update_count()

func set_status(holding: bool, station: String, prompt: String) -> void:
	var names: Dictionary = {"desk": "书桌烛台", "shelf": "高架烛台", "floor": "地面烛台"}
	status_label.text = "烛光 / 手持中 · 靠近烛台按 E 放下" if holding else "烛光 / " + str(names.get(station, station))
	prompt_label.text = prompt

func is_modal_open() -> bool:
	return modal_open

func _remove_overlay() -> void:
	if is_instance_valid(overlay):
		root.remove_child(overlay)
		overlay.queue_free()
		overlay = null

func _close_modal() -> void:
	_remove_overlay()
	modal_open = not in_game
	modal_kind = "" if in_game else "title"
	hud.visible = in_game
	modal_changed.emit(modal_open)

func _open_modal(kind: String, kicker: String, title: String) -> void:
	_remove_overlay()
	modal_kind = kind
	modal_open = true
	hud.hide()
	overlay = Control.new()
	overlay.name = "Modal_" + kind
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(overlay)
	var wash: ColorRect = ColorRect.new()
	wash.color = Color(0.006, 0.018, 0.019, 0.78)
	wash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(wash)
	var panel: PanelContainer = PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	panel.offset_left = -430
	panel.offset_right = 430
	panel.offset_top = -300
	panel.offset_bottom = 300
	panel.add_theme_stylebox_override("panel", _style(INK, Color("6c7156"), 28))
	overlay.add_child(panel)
	var layout: VBoxContainer = VBoxContainer.new()
	layout.add_theme_constant_override("separation", 16)
	panel.add_child(layout)
	var top: HBoxContainer = HBoxContainer.new()
	layout.add_child(top)
	var eyebrow: Label = _label(kicker, 14, GOLD)
	eyebrow.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(eyebrow)
	var close_button: Button = _button("返回  Esc", _close_modal, top)
	close_button.name = "CloseModal"
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.name = "ScrollableContent"
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	layout.add_child(scroll)
	content = VBoxContainer.new()
	content.name = "Content"
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation", 15)
	scroll.add_child(content)
	var heading: Label = _paragraph(title, 33)
	heading.add_theme_font_override("font", serif)
	_line()
	modal_changed.emit(true)
	close_button.grab_focus()

func inspect(id: String) -> void:
	if not in_game or not Case.EVIDENCE.has(id):
		return
	if id == "witness":
		_show_witness()
		return
	var entry: Dictionary = Case.EVIDENCE[id]
	_open_modal("evidence", "现场观察  /  OBSERVATION", str(entry.title))
	_paragraph(str(entry.source), 16, GOLD)
	_paragraph(str(entry.body), 22)
	_spacer()
	_paragraph(str(entry.note), 18, MUTED)
	_spacer()
	_button("已记入案卷 · 返回现场" if records.has(id) else "记入手记   →", func() -> void: _record(id)).name = "RecordEvidence"

func _record(id: String) -> void:
	if not records.has(id):
		records.append(id)
		_update_count()
		progress_changed.emit()
		show_toast("已记入手记 · " + str(Case.EVIDENCE[id].title))
	_close_modal()

func _show_witness(topic: String = "") -> void:
	if not topic.is_empty() and not witness_topics.has(topic):
		witness_topics.append(topic)
		progress_changed.emit()
	_open_modal("witness", "窗边谈话  /  WITNESS", "隔着一扇窗的人")
	_paragraph("他一直在重复“我看见了”。但他看见的，究竟是什么？", 17, MUTED)
	var line: String = "“灯突然灭了，里面只剩烛光。我看见阿远的手往徐师傅背上一伸，人就从梯子上掉下来了……我当时觉得，是他推的。”"
	if topic == "view":
		line = "“我站在窗外，只看得见墙。两个影子叠在一起，他的胳膊正伸过去。我当时以为……他推了人。你问我有没有看见手碰到人？那倒没有。”"
	elif topic == "sound":
		line = "“声音……让我想想。先是咔的一声，像木头裂了。然后才是当啷一声，像工具砸在地上。这个顺序，我记得。”"
	_paragraph(line, 21)
	_button(("✓  " if witness_topics.has("view") else "追问  ") + "你直接看到了人，还是墙上的影子？", func() -> void: _show_witness("view")).name = "AskView"
	_button(("✓  " if witness_topics.has("sound") else "追问  ") + "仔细想想，你先听见了什么声音？", func() -> void: _show_witness("sound")).name = "AskSound"
	var ready: bool = witness_topics.has("view") and witness_topics.has("sound")
	var record_button: Button = _button("已记入案卷 · 返回现场" if records.has("witness") else "记下完整证词   →", func() -> void:
		if ready or records.has("witness"):
			_record("witness"))
	record_button.name = "RecordWitness"
	record_button.disabled = not ready and not records.has("witness")
	_paragraph("区分亲眼所见，与事后推测。" if ready else "追问视线与声音，补全这份证词。", 15, GOLD)

func _update_count() -> void:
	count_label.text = "手记  %02d / 06" % records.size()
	var complete: bool = true
	for id: String in Case.ESSENTIAL:
		if not records.has(id):
			complete = false
	objective_label.text = "证据已经相互照应。按 R 写下你的还原。" if complete else "将蜡烛放到不同高度，观察同一个瞬间。"

func show_notebook() -> void:
	if not in_game:
		return
	_open_modal("notebook", "调查手记  /  FIELD NOTES", "光照不到的，写下来。")
	_paragraph("已记录 %d / 6 项。事实可以并列，结论需要彼此印证。" % records.size(), 17, GOLD)
	for id: String in Case.ORDER:
		var entry: Dictionary = Case.EVIDENCE[id]
		var present: bool = records.has(id)
		_paragraph(("%02d  " % (Case.ORDER.find(id) + 1)) + (str(entry.title) if present else "尚未记录"), 22, IVORY if present else MUTED)
		_paragraph(str(entry.short) if present else "继续观察现场。这一页，留给新的发现。", 17, MUTED)
		_line()
	_paragraph(Case.HINTS[hint_level], 18, GOLD)
	var hint_button: Button = _button("再展开一条提示  %d / 3" % hint_level, func() -> void:
		hint_level = mini(hint_level + 1, 3)
		progress_changed.emit()
		show_notebook())
	hint_button.disabled = hint_level >= 3
	_button("写下我的还原   →", show_report)
	_button("继续观察", _close_modal)

func show_report() -> void:
	if not in_game:
		return
	_open_modal("report", "事件还原  /  RECONSTRUCTION", "熄灯之后，发生了什么？")
	_paragraph("选择能被手中证据支持的经过。提交后仍可返回现场继续调查。", 17, MUTED)
	for question: Dictionary in Case.QUESTIONS:
		_paragraph(str(question.title), 21, GOLD)
		var group: ButtonGroup = ButtonGroup.new()
		var key: String = str(question.key)
		for option: Array in question.options:
			var choice: CheckBox = CheckBox.new()
			choice.name = "Choice_" + str(option[0]).replace("-", "_")
			choice.text = str(option[1])
			choice.custom_minimum_size.y = 40
			choice.button_group = group
			choice.button_pressed = answers.get(key, "") == option[0]
			choice.add_theme_font_size_override("font_size", 18)
			choice.add_theme_color_override("font_color", IVORY)
			var value: String = str(option[0])
			choice.pressed.connect(func() -> void: answers[key] = value)
			content.add_child(choice)
		_line()
	_paragraph("当前手记：%d / 6 项。结论的完整度，取决于解释与证据是否相符。" % records.size(), 16, MUTED)
	_button("封存这次判断   →", _submit_report).name = "SubmitReconstruction"
	_button("我再看看", _close_modal)

func test_reconstruction(proposed: Dictionary) -> String:
	if proposed.get("cause", "") == "push" or proposed.get("hand", "") == "attack":
		return "blame"
	var correct: bool = proposed.get("cause", "") == "ladder" and proposed.get("hand", "") == "rescue" and proposed.get("sound", "") == "wood-first"
	for id: String in Case.ESSENTIAL:
		if not records.has(id):
			correct = false
	return "truth" if correct else "partial"

func _submit_report() -> void:
	if not answers.has("cause") or not answers.has("hand") or not answers.has("sound"):
		show_toast("请先完成三个判断，再封存案卷。")
		return
	ending = test_reconstruction(answers)
	progress_changed.emit()
	_show_ending()

func _show_ending() -> void:
	var title: String = "事故，尚未被说清"
	var label: String = "结局二 · 未闭合的证据链"
	var quote: String = "你开始怀疑最初的说法，却还没把当晚连成一条线。"
	var body: String = "记录与解释还没有彼此印证。重新比对梯脚的断口、伸手的距离，以及两种声音的先后顺序。猜对一段经过，并不等于已经证明它。"
	if ending == "blame":
		title = "影子成了指控"
		label = "结局一 · 先入为主"
		quote = "你把重叠的影子，写成了一个人的过错。"
		body = "阿远的手与徐师傅的背，在墙上重合了。但一面墙无法保留两个人之间的距离。关于“推搡”的判断，仍然缺少直接证据。回到现场，换一个光源，看看这两条轮廓是否仍然相接。"
	elif ending == "truth":
		title = "一只没能抓住的手"
		label = "结局三 · 还原当晚"
		quote = "那不是推人的手。那是一只慢了一瞬的手。"
		body = "徐师傅站在折梯上维修线路。一侧梯脚原有的裂痕在承重后断开，他随之坠落。阿远伸手去接，却没能抓住。工具随后碰落在地，发出目击者听到的金属声。"
	_open_modal("ending", "案卷回响  /  AFTER THE LIGHT", title)
	_paragraph(label, 16, GOLD)
	_paragraph(quote, 23)
	_paragraph(body, 19, MUTED)
	if ending == "truth":
		_paragraph("旧裂痕与新断口 → 梯脚失去支撑\n侧影中的空隙 → 伸手却未接触\n先木裂，后金属声 → 断裂在前，工具落地在后", 17, GOLD)
		_paragraph("本章完。谢谢你，没有停在第一眼。", 20)
	else:
		var missing: PackedStringArray = PackedStringArray()
		for id: String in Case.ESSENTIAL:
			if not records.has(id):
				missing.append(str(Case.EVIDENCE[id].title))
		if not missing.is_empty():
			_paragraph("尚需查证：" + "、".join(missing), 17, GOLD)
	_button("返回现场", _close_modal)
	_button("翻阅手记", show_notebook)
	_button("重新开始", func() -> void: _confirm_restart(false))

func _confirm_restart(from_title: bool) -> void:
	_open_modal("confirm", "重新开卷", "从第一眼重新开始？")
	_paragraph("重新开始会替换本案的已存进度，清空手记与还原结果。", 21)
	_button("清空并重新调查", func() -> void:
		if from_title:
			start_requested.emit(false)
		else:
			restart_requested.emit())
	_button("保留当前案卷", _close_modal)

func toggle_pause() -> void:
	if not in_game:
		if modal_kind != "title":
			_close_modal()
		return
	if modal_open:
		_close_modal()
		return
	_open_modal("pause", "雨还在下  /  PAUSED", "让目光歇一会儿。")
	_paragraph("现场暂停。调查进度已随记录自动保存。", 19, MUTED)
	_button("继续调查   →", _close_modal)
	_button("调查手记", show_notebook)
	_button("操作说明", _show_controls)
	_button("重新开始", func() -> void: _confirm_restart(false))
	_button("保存并退出", func() -> void:
		progress_changed.emit()
		quit_requested.emit())

func _show_controls() -> void:
	_open_modal("controls", "如何调查  /  CONTROLS", "让光，替你提问。")
	_paragraph("W A S D   步行移动\n鼠标   环顾现场\nE   调查准星指向的近处物件 / 拿放蜡烛\nJ   翻阅手记     R   还原事件\nEsc   暂停 / 关闭当前面板", 21)
	_paragraph("先观察书桌烛光下的墙影。再走到书桌拿起蜡烛，将它放到高架或地面烛台。改变光源高度，观察同一个现场。", 19, MUTED)
	_paragraph("靠近物件并用准星对准，出现 E 提示后交互。阅读线索后记入手记；窗边证词需要追问两次。", 18, GOLD)
	_button("明白了", _close_modal)

func get_records() -> Array:
	return records.duplicate()

func export_progress() -> Dictionary:
	return {"version": 1, "records": records.duplicate(), "hint_level": hint_level,
		"ending": ending, "witness_topics": witness_topics.duplicate(), "answers": answers.duplicate()}

func import_progress(data: Dictionary) -> void:
	records.clear()
	var saved_records = data.get("records", [])
	if saved_records is Array:
		for id in saved_records:
			if id is String and Case.EVIDENCE.has(id) and not records.has(id):
				records.append(id)
	var saved_hint = data.get("hint_level", 0)
	hint_level = clampi(int(saved_hint), 0, 3) if saved_hint is int or saved_hint is float else 0
	ending = str(data.get("ending", ""))
	if ending not in ["", "blame", "partial", "truth"]:
		ending = ""
	witness_topics.clear()
	var topics = data.get("witness_topics", [])
	if topics is Array:
		for topic in topics:
			if topic in ["view", "sound"] and not witness_topics.has(topic):
				witness_topics.append(topic)
	answers.clear()
	var saved_answers = data.get("answers", {})
	if saved_answers is Dictionary:
		for question: Dictionary in Case.QUESTIONS:
			for option: Array in question.options:
				if saved_answers.get(question.key, "") == option[0]:
					answers[question.key] = option[0]
	if is_instance_valid(count_label):
		_update_count()

func show_toast(text: String) -> void:
	toast_label.text = text
	toast_label.show()
	toast_time = 4.5
	root.move_child(toast_label, -1)
