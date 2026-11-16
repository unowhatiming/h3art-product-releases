extends CharacterBody3D

var camera: Camera3D
var active = false
var sensitivity = 0.0023
var walk_time = 0.0
var footstep: AudioStreamPlayer

func _ready():
	collision_layer = 4
	collision_mask = 1
	var shape = CapsuleShape3D.new()
	shape.radius = 0.24
	shape.height = 1.7
	var collider = CollisionShape3D.new()
	collider.shape = shape
	collider.position.y = 0.86
	add_child(collider)
	camera = Camera3D.new()
	camera.position.y = 1.7
	camera.fov = 70
	camera.near = 0.06
	add_child(camera)
	camera.current = true
	footstep = AudioStreamPlayer.new()
	add_child(footstep)
	footstep.volume_db = -25
	var sound = AudioStreamWAV.new()
	sound.format = AudioStreamWAV.FORMAT_16_BITS
	sound.mix_rate = 22050
	var bytes = PackedByteArray()
	for i in range(2205):
		var fade = pow(1.0-float(i)/2205.0, 3)
		var sample = int((sin(i*0.021)*0.6+randf_range(-0.3,0.3))*fade*13000)
		bytes.encode_s16(_append_sample(bytes),sample)
	sound.data=bytes
	footstep.stream=sound

func _append_sample(bytes: PackedByteArray) -> int:
	var size = bytes.size()
	bytes.resize(size+2)
	return size

func _unhandled_input(event):
	if not active or Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		return
	if event is InputEventMouseMotion:
		rotate_y(-event.relative.x*sensitivity)
		camera.rotation.x = clamp(camera.rotation.x-event.relative.y*sensitivity,-1.1,1.1)
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			camera.fov = max(45.0,camera.fov-3.0)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			camera.fov = min(80.0,camera.fov+3.0)

func _physics_process(delta):
	if not active:
		velocity = Vector3.ZERO
		return
	var direction = Input.get_vector("left","right","forward","back")
	var movement = global_transform.basis * Vector3(direction.x,0,direction.y)
	var speed = 2.7 if Input.is_action_pressed("run") else 1.9
	velocity.x=move_toward(velocity.x,movement.x*speed,delta*14)
	velocity.z=move_toward(velocity.z,movement.z*speed,delta*14)
	if not is_on_floor():
		velocity.y-=18.0*delta
	else:
		velocity.y=0
	move_and_slide()
	if movement.length()>0.1 and is_on_floor():
		var previous = int(walk_time/0.47)
		walk_time+=delta
		if int(walk_time/0.47)!=previous:
			footstep.pitch_scale=randf_range(0.86,1.12)
			footstep.play()
		camera.position.y=lerp(camera.position.y,1.7+sin(walk_time*12)*0.018,0.4)
	else:
		camera.position.y=lerp(camera.position.y,1.7,delta*8)

func focus_target() -> Dictionary:
	var origin = camera.global_position
	var end = origin-camera.global_basis.z*3.4
	var query = PhysicsRayQueryParameters3D.create(origin,end,3)
	query.collide_with_areas=true
	query.exclude=[get_rid()]
	var hit = get_world_3d().direct_space_state.intersect_ray(query)
	if hit.is_empty(): return {}
	var collider=hit["collider"]
	if not collider.has_meta("target"): return {}
	return {"id":str(collider.get_meta("target")),"distance":origin.distance_to(hit["position"])}
