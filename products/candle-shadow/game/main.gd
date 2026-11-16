extends Node3D

const Room = preload("res://room.gd")
const Player = preload("res://player.gd")
const Interface = preload("res://ui.gd")
var save_path = "user://save.json"
var room
var player
var ui
var started=false
var holding=false
var station="desk"
var current_target={}
var saved_data={}
var test_failures=[]
var test_checks=[]
var test_mode=false

func _ready():
	get_tree().auto_accept_quit=false
	var args=OS.get_cmdline_user_args()
	for arg in args:
		if arg=="--self-test" or arg.begins_with("--capture-dir="):
			test_mode=true
			save_path="user://automation-save.json"
	_install_inputs()
	room=Room.new()
	add_child(room)
	player=Player.new()
	add_child(player)
	player.position=Vector3(0,0.05,6.6)
	ui=Interface.new()
	add_child(ui)
	ui.start_requested.connect(_start)
	ui.restart_requested.connect(func():_start(false))
	ui.modal_changed.connect(_modal_changed)
	ui.progress_changed.connect(_save)
	ui.quit_requested.connect(_quit)
	saved_data=_read_save()
	ui.show_title(not saved_data.is_empty())
	if "--self-test" in args:
		test_mode=true
		_run_self_test.call_deferred()
	for arg in args:
		if arg.begins_with("--capture-dir="):
			test_mode=true
			_capture_sequence.call_deferred(arg.trim_prefix("--capture-dir="))

func _install_inputs():
	var bindings={"forward":[KEY_W,KEY_UP],"back":[KEY_S,KEY_DOWN],"left":[KEY_A,KEY_LEFT],"right":[KEY_D,KEY_RIGHT],"run":[KEY_SHIFT]}
	for action in bindings:
		if not InputMap.has_action(action):InputMap.add_action(action)
		for code in bindings[action]:
			var key=InputEventKey.new()
			key.physical_keycode=code
			InputMap.action_add_event(action,key)

func _start(resume:bool):
	started=true
	if resume and not saved_data.is_empty():
		ui.import_progress(saved_data.get("ui",{}))
		station=str(saved_data.get("station","desk"))
		if not Room.STATIONS.has(station):station="desk"
		holding=saved_data.get("holding",false)==true
		var position_data=saved_data.get("position",[0,0.05,6.6])
		if position_data is Array and position_data.size()==3 and _valid_number(position_data[0]) and _valid_number(position_data[2]):
			player.position=Vector3(clamp(float(position_data[0]),-4.9,4.9),0.05,clamp(float(position_data[2]),-3.3,7.3))
		else:player.position=Vector3(0,0.05,6.6)
	else:
		ui.import_progress({})
		holding=false
		station="desk"
		player.position=Vector3(0,0.05,6.6)
	player.rotation=Vector3.ZERO
	player.camera.rotation=Vector3.ZERO
	player.camera.fov=70
	room.place_candle(station)
	if holding:room.hold_candle(player.camera)
	ui.enter_game()
	ui.show_toast("走近左侧书桌，瞄准烛台按 E 拿起蜡烛。" if not resume else "案卷已续读。J 打开手记，Esc 暂停。")
	_save()

func _modal_changed(open:bool):
	player.active=started and not open
	Input.mouse_mode=Input.MOUSE_MODE_CAPTURED if player.active and not test_mode else Input.MOUSE_MODE_VISIBLE

func _input(event):
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode==KEY_F11:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if DisplayServer.window_get_mode()==DisplayServer.WINDOW_MODE_FULLSCREEN else DisplayServer.WINDOW_MODE_FULLSCREEN)
			get_viewport().set_input_as_handled()
		if event.keycode==KEY_ESCAPE:
			ui.toggle_pause()
			get_viewport().set_input_as_handled()
		elif started and not ui.modal_open:
			match event.physical_keycode:
				KEY_E: _interact()
				KEY_J: ui.show_notebook()
				KEY_R: ui.show_report()
				KEY_F5:
					_save()
					ui.show_toast("调查进度已保存。")
	if event is InputEventMouseButton and event.pressed and event.button_index==MOUSE_BUTTON_LEFT and started and not ui.modal_open and not test_mode:
		Input.mouse_mode=Input.MOUSE_MODE_CAPTURED

func _physics_process(_delta):
	if not started or ui.modal_open:return
	current_target=player.focus_target()
	var prompt=""
	if not current_target.is_empty():prompt=_prompt(str(current_target.id))
	ui.set_status(holding,station,prompt)
	if player.position.y < -3:
		player.position=Vector3(0,0.1,6.6)
		ui.show_toast("已回到入口。")

func _prompt(id:String) -> String:
	if Room.STATIONS.has(id):
		if holding:return "E  放下蜡烛 · "+{"desk":"书桌烛台","shelf":"高架烛台","floor":"地面烛台"}[id]
		return "E  拿起蜡烛" if station==id else "空烛台 · 先去拿起蜡烛"
	match id:
		"wall":return "先将蜡烛放稳，再检查残影。" if holding else "E  仔细观察墙上的残影"
		"splinter":return "E  蹲身查看木片"
		"notice":return "E  阅读维修登记"
		"witness":return "E  询问窗外的目击者"
		"door":return "E  查看门上的便笺"
	return ""

func _interact():
	if not started or ui.modal_open:return
	var focus=player.focus_target()
	if focus.is_empty():return
	var id=str(focus.id)
	if Room.STATIONS.has(id):
		if holding:
			holding=false
			station=id
			room.place_candle(id)
			ui.show_toast("烛火已放稳。走近墙面，观察变化后的影子。")
		elif station==id:
			holding=true
			room.hold_candle(player.camera)
			ui.show_toast("你拿起了蜡烛。右侧高架与地面还有两座烛台。")
		else:ui.show_toast("这里是空烛台。先去拿起现有的蜡烛。")
		_save()
	elif id=="wall":
		if holding:ui.show_toast("手中的光仍在移动。先找一处烛台放稳。")
		else:ui.inspect({"desk":"shadow-overlap","shelf":"shadow-hand","floor":"shadow-break"}[station])
	elif id=="door":ui.show_toast("便笺：先听完每个人的话，再写下结论。按 R 整理你的还原。")
	else:ui.inspect(id)

func _save():
	if not started:return
	var payload={"version":1,"station":station,"holding":holding,"position":[player.position.x,player.position.y,player.position.z],"ui":ui.export_progress()}
	var file=FileAccess.open(save_path,FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(payload))
		saved_data=payload
	else:ui.show_toast("本次无法保存到磁盘，但你仍可继续调查。")

func _read_save() -> Dictionary:
	if not FileAccess.file_exists(save_path):return {}
	var parsed=JSON.parse_string(FileAccess.get_file_as_string(save_path))
	if not parsed is Dictionary or parsed.get("version",0)!=1:return {}
	if not parsed.get("ui",{}) is Dictionary:return {}
	return parsed

func _valid_number(value) -> bool:
	return (value is float or value is int) and is_finite(float(value))

func _stop_audio():
	room.rain_player.stop()
	player.footstep.stop()
	room.rain_player.stream=null
	player.footstep.stream=null

func _quit():
	_save()
	_stop_audio()
	await get_tree().create_timer(0.15).timeout
	get_tree().quit()

func _notification(what):
	if what==NOTIFICATION_WM_CLOSE_REQUEST:
		_quit()
	if what==NOTIFICATION_APPLICATION_FOCUS_OUT and started and is_instance_valid(ui) and not ui.modal_open and not test_mode:
		ui.toggle_pause()

func _check(value:bool,label:String):
	if value:
		test_checks.append(label)
		print("PASS: "+label)
	else:
		test_failures.append(label)
		push_error("FAIL: "+label)

func _aim(pos:Vector3,point:Vector3):
	player.position=pos
	player.rotation=Vector3.ZERO
	player.camera.rotation=Vector3.ZERO
	player.camera.look_at(point)
	await get_tree().physics_frame
	await get_tree().physics_frame

func _run_self_test():
	_check(save_path!="user://save.json","automation uses a separate save from player progress")
	var hidden_casts=true
	for mesh in room.memory.get_children():
		hidden_casts=hidden_casts and mesh.layers==Room.MEMORY_LAYER and mesh.cast_shadow==GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
	_check(hidden_casts,"memory geometry casts shadows without visible bodies")
	_check((room.light.shadow_caster_mask & Room.MEMORY_LAYER)==0 and (room.wall_light.light_cull_mask & Room.ROOM_LAYER)==0,"memory light is restricted to wall receivers")
	_start(false)
	await get_tree().physics_frame
	_check(not holding and station=="desk","new game has one candle on desk")
	await _aim(Vector3(0,0.05,6.6),Room.STATIONS.desk)
	_interact()
	_check(not holding,"distant targets cannot be interacted with")
	await _aim(Vector3(-2.3,0.05,3.0),Room.STATIONS.desk)
	_check(player.focus_target().get("id","")=="desk","physics ray detects nearby desk candle")
	_interact()
	_check(holding and room.candle.get_parent()==player.camera,"E picks up actual candle and attaches to camera")
	await _aim(Vector3(2.35,0.05,3.0),Room.STATIONS.shelf)
	_interact()
	_check(not holding and station=="shelf" and room.candle.get_parent()==room,"E puts candle on other stand")
	_check(ui.get_records().is_empty(),"changing light does not collect evidence")
	await _aim(Vector3(0,0.05,-1.4),Vector3(0,2,-4.3))
	_interact()
	_check(ui.modal_kind=="evidence" and not player.active,"looking at wall inspects active shadow and pauses observer")
	ui._record("shadow-hand")
	_check("shadow-hand" in ui.get_records(),"recording evidence persists the side-light clue")
	await _aim(Vector3(2.35,0.05,3.0),Room.STATIONS.shelf)
	_interact()
	await _aim(Vector3(-0.2,0.05,3.5),Room.STATIONS.floor)
	_interact()
	_check(station=="floor" and not holding,"candle can be carried to low stand")
	await _aim(Vector3(0,0.05,-1.4),Vector3(0,2,-4.3))
	_interact()
	_check(ui.modal_kind=="evidence","low shadow can be examined through same wall target")
	ui._record("shadow-break")
	await _aim(Vector3(1.66,0.05,0.3),Vector3(1.66,0.15,-1.25))
	_interact()
	_check(ui.modal_kind=="evidence","physical splinter is reachable with raycast")
	ui._record("splinter")
	await _aim(Vector3(-3.8,0.05,0.2),Vector3(-5.05,2.1,0.2))
	_interact()
	_check(ui.modal_kind=="witness","window witness is spatially reachable")
	ui._show_witness("view")
	ui._show_witness("sound")
	ui._record("witness")
	_check(ui.test_reconstruction({"cause":"push","hand":"attack","sound":"wood-first"})=="blame","unsupported accusation yields blame")
	_check(ui.test_reconstruction({"cause":"ladder","hand":"rescue","sound":"wood-first"})=="truth","complete supported reconstruction yields truth")
	_save()
	var loaded=_read_save()
	_check(loaded.get("station","")=="floor" and loaded.get("ui",{}).get("records",[]).size()==4,"native save stores station and evidence")
	_start(true)
	_check(ui.get_records().size()==4 and station=="floor","continue restores saved investigation")
	ui.toggle_pause()
	_check(not player.active,"pause menu disables walking")
	ui.toggle_pause()
	_check(player.active,"closing pause returns control")
	await _aim(Vector3(5.0,0.05,4.5),Vector3(5.5,1.7,4.5))
	player.camera.rotation=Vector3.ZERO
	player.rotation=Vector3.ZERO
	Input.action_press("right")
	for i in range(45):await get_tree().physics_frame
	Input.action_release("right")
	_check(player.position.x<5.35,"native CharacterBody3D collides with wall")
	ui.import_progress({})
	_check(ui.test_reconstruction({"cause":"ladder","hand":"rescue","sound":"wood-first"})=="partial","correct guess without records cannot finish case")
	ui.enter_game()
	await _aim(Vector3(-3.13,0.05,3.0),Vector3(-3.13,1.02,1.78))
	_interact()
	_check(ui.modal_kind=="evidence","repair register is reachable through native raycast")
	ui._record("notice")
	station="desk"
	room.place_candle(station)
	await _aim(Vector3(0,0.05,-1.4),Vector3(0,2,-4.3))
	_interact()
	_check(ui.modal_kind=="evidence","initial overlapping shadow is reachable")
	ui._record("shadow-overlap")
	ui.import_progress({"records":["shadow-hand","shadow-break","splinter","witness"]})
	ui.show_report()
	for name in ["Choice_ladder","Choice_rescue","Choice_wood_first"]:
		ui.overlay.find_child(name,true,false).pressed.emit()
	ui.overlay.find_child("SubmitReconstruction",true,false).pressed.emit()
	_check(ui.ending=="truth" and ui.modal_kind=="ending","native report buttons submit to complete ending")
	saved_data={"station":"invalid","position":[{},0,[]],"ui":{"hint_level":{},"records":"bad"}}
	_start(true)
	_check(station=="desk" and ui.get_records().is_empty() and player.position.is_finite(),"malformed save fields recover to safe defaults")
	started=false
	ui.show_title(false)
	ui._show_controls()
	var escape=InputEventKey.new()
	escape.keycode=KEY_ESCAPE
	escape.pressed=true
	_input(escape)
	_check(ui.modal_kind=="title","Escape closes controls opened from title")
	var out=FileAccess.open("user://test-results.json",FileAccess.WRITE)
	out.store_string(JSON.stringify({"checks":test_checks,"failures":test_failures},"  "))
	print("NATIVE TESTS: ",test_checks.size()," passed, ",test_failures.size()," failed")
	_stop_audio()
	await get_tree().create_timer(0.15).timeout
	get_tree().quit(0 if test_failures.is_empty() else 2)

func _capture_sequence(folder:String):
	DirAccess.make_dir_recursive_absolute(folder)
	await _snapshot(folder+"/01-title.png")
	_start(false)
	player.active=false
	await _snapshot(folder+"/02-room.png")
	ui.toast_time=0
	ui.toast_label.hide()
	for id in ["desk","shelf","floor"]:
		station=id
		room.place_candle(id)
		player.position=Vector3(0,0.05,5.5)
		player.camera.look_at(Vector3(0,1.8,-3.5))
		ui.set_status(false,id,"")
		await _snapshot(folder+"/shadow-"+id+".png")
	holding=true
	room.hold_candle(player.camera)
	ui.set_status(true,station,"E 放下蜡烛")
	await _snapshot(folder+"/03-held-candle.png")
	ui.show_notebook()
	await _snapshot(folder+"/04-notebook.png")
	ui.import_progress({"records":["shadow-hand","shadow-break","splinter","witness"],"answers":{"cause":"ladder","hand":"rescue","sound":"wood-first"}})
	ui.show_report()
	await _snapshot(folder+"/05-report.png")
	ui._submit_report()
	await _snapshot(folder+"/06-ending.png")
	var license=FileAccess.open(folder+"/GODOT-LICENSE.txt",FileAccess.WRITE)
	license.store_string(Engine.get_license_text())
	print("NATIVE CAPTURE COMPLETE: ",folder)
	_stop_audio()
	await get_tree().create_timer(0.15).timeout
	get_tree().quit()

func _snapshot(path:String):
	for i in range(8):await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var image=get_viewport().get_texture().get_image()
	var result=image.save_png(path)
	print("Screenshot ",path," status ",result)
