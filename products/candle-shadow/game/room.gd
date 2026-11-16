extends Node3D

const STATIONS = {"desk":Vector3(-2.3,1.18,1.8),"shelf":Vector3(2.35,2.0,2.0),"floor":Vector3(-0.2,0.38,2.6)}
# Separate visible surfaces from the invisible reconstruction used by wall light.
const ROOM_LAYER = 1
const WALL_LAYER = 2
const MEMORY_LAYER = 4
var candle: Node3D
var light: OmniLight3D
var wall_light: OmniLight3D
var flame: MeshInstance3D
var time = 0.0
var wood: StandardMaterial3D
var dark: StandardMaterial3D
var brass: StandardMaterial3D
var paper: StandardMaterial3D
var memory: Node3D
var font: SystemFont
var rain_player: AudioStreamPlayer

func _ready():
	seed(83)
	font=SystemFont.new()
	font.font_names=PackedStringArray(["Microsoft YaHei","SimSun"])
	wood=material("493d2d")
	dark=material("192c2c")
	brass=material("9d7741",0.45,0.6)
	paper=material("c1b28f")
	_build_room()
	_build_furniture()
	_build_memory()
	_build_candle()
	_build_ambience()

func material(hex: String,rough=0.9,metal=0.0) -> StandardMaterial3D:
	var m=StandardMaterial3D.new()
	m.albedo_color=Color(hex)
	m.roughness=rough
	m.metallic=metal
	return m

func box(size:Vector3,pos:Vector3,mat:Material,solid=false,parent:Node3D=null,shadow=true) -> MeshInstance3D:
	var mesh=MeshInstance3D.new()
	var geom=BoxMesh.new()
	geom.size=size
	mesh.mesh=geom
	mesh.material_override=mat
	mesh.position=pos
	if not shadow: mesh.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	(parent if parent else self).add_child(mesh)
	if solid:
		var body=StaticBody3D.new()
		body.collision_layer=1
		body.collision_mask=4
		var collider=CollisionShape3D.new()
		var shape=BoxShape3D.new()
		shape.size=size
		collider.shape=shape
		mesh.add_child(body)
		body.add_child(collider)
	return mesh

func ball(radius:float,pos:Vector3,mat:Material,parent:Node3D=null,scale_v=Vector3.ONE) -> MeshInstance3D:
	var mesh=MeshInstance3D.new()
	var geom=SphereMesh.new()
	geom.radius=radius
	geom.height=radius*2
	geom.radial_segments=20
	geom.rings=12
	mesh.mesh=geom
	mesh.material_override=mat
	mesh.position=pos
	mesh.scale=scale_v
	(parent if parent else self).add_child(mesh)
	return mesh

func rod(a:Vector3,b:Vector3,radius:float,mat:Material,parent:Node3D=null,r2=-1.0) -> MeshInstance3D:
	var mesh=MeshInstance3D.new()
	var geom=CylinderMesh.new()
	geom.top_radius=radius if r2<0 else r2
	geom.bottom_radius=radius
	geom.height=a.distance_to(b)
	geom.radial_segments=12
	mesh.mesh=geom
	mesh.material_override=mat
	mesh.position=(a+b)*0.5
	mesh.quaternion=Quaternion(Vector3.UP,(b-a).normalized())
	(parent if parent else self).add_child(mesh)
	return mesh

func sign_text(text:String,pos:Vector3,size=36,color=Color("cfbf97"),rotation_y=0.0):
	var label=Label3D.new()
	label.text=text
	label.font=font
	label.font_size=size
	label.pixel_size=0.005
	label.position=pos
	label.modulate=color
	label.outline_size=0
	label.rotation.y=rotation_y
	add_child(label)
	return label

func target(id:String,pos:Vector3,size:Vector3):
	var area=Area3D.new()
	area.name="Target_"+id
	area.set_meta("target",id)
	area.collision_layer=2
	area.collision_mask=0
	area.position=pos
	var shape=BoxShape3D.new()
	shape.size=size
	var collider=CollisionShape3D.new()
	collider.shape=shape
	area.add_child(collider)
	add_child(area)
	return area

func _build_room():
	var env=WorldEnvironment.new()
	var setting=Environment.new()
	setting.background_mode=Environment.BG_COLOR
	setting.background_color=Color("0a151b")
	setting.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR
	setting.ambient_light_color=Color("72898d")
	setting.ambient_light_energy=0.18
	setting.tonemap_mode=Environment.TONE_MAPPER_FILMIC
	setting.fog_enabled=true
	setting.fog_light_color=Color("142426")
	setting.fog_density=0.018
	env.environment=setting
	add_child(env)
	var wall=material("97988b")
	var noise=FastNoiseLite.new()
	noise.frequency=0.055
	noise.seed=5
	var tex=NoiseTexture2D.new()
	tex.width=512
	tex.height=512
	tex.noise=noise
	var ramp=Gradient.new()
	ramp.set_color(0,Color("a7afa2"))
	ramp.set_color(1,Color("b8bba9"))
	tex.color_ramp=ramp
	wall.albedo_texture=tex
	wall.uv1_scale=Vector3(3,2,1)
	var floor_mat=material("82725a")
	var image=Image.create(512,512,false,Image.FORMAT_RGB8)
	for y in range(512):
		for x in range(512):
			var plank=int(x/64)
			var grain=sin(float(x)*8+sin(float(y)*0.02)*2)*0.015+randf()*0.03
			var shade=0.33+float(plank%3)*0.02+grain
			if x%64<2 or (y+(plank%3)*137)%400<2: shade=0.16
			image.set_pixel(x,y,Color(shade,shade*0.88,shade*0.7))
	floor_mat.albedo_texture=ImageTexture.create_from_image(image)
	floor_mat.uv1_scale=Vector3(3,3,3)
	box(Vector3(11.4,0.2,13),Vector3(0,-0.1,1.65),floor_mat,true)
	box(Vector3(11.4,5.4,0.2),Vector3(0,2.6,-4.55),wall,true).layers=WALL_LAYER
	box(Vector3(0.2,5.4,13),Vector3(-5.6,2.6,1.65),wall,true)
	box(Vector3(0.2,5.4,13),Vector3(5.6,2.6,1.65),wall,true)
	box(Vector3(11.4,5.4,0.2),Vector3(0,2.6,8.1),wall,true)
	box(Vector3(11.4,0.15,13),Vector3(0,5.25,1.65),dark)
	for z in [-3.5,0.4,4.3,7.8]: box(Vector3(11.1,0.21,0.19),Vector3(0,5.05,z),wood)
	var paint=material("254c48")
	box(Vector3(11.2,0.7,0.06),Vector3(0,0.34,-4.4),paint).layers=WALL_LAYER
	box(Vector3(11.2,0.07,0.1),Vector3(0,0.71,-4.36),wood).layers=WALL_LAYER
	box(Vector3(11.2,0.12,0.1),Vector3(0,0.08,-4.36),dark).layers=WALL_LAYER
	for side in [-1,1]:
		box(Vector3(0.06,1.2,12.8),Vector3(side*5.45,0.6,1.6),paint)
		box(Vector3(0.14,0.07,12.8),Vector3(side*5.4,1.2,1.6),wood)
	for x in range(-5,6): box(Vector3(0.045,0.65,0.03),Vector3(x,0.33,-4.35),dark).layers=WALL_LAYER
	box(Vector3(2.2,0.53,0.06),Vector3(0,4.61,-4.37),dark)
	sign_text("青 石 公 寓",Vector3(0,4.65,-4.32),45)
	sign_text("收 发 室   /   1932",Vector3(0,4.48,-4.31),17)
	target("wall",Vector3(0,2.55,-4.28),Vector3(7.3,3.7,0.15))
	# Window: emissive rain glass, timber frame, witness outside.
	var glass=material("1b4655",0.22,0.25)
	glass.emission_enabled=true
	glass.emission=Color("315968")
	glass.emission_energy_multiplier=0.4
	box(Vector3(0.1,2.4,2.6),Vector3(-5.43,2.65,-0.2),glass)
	for z in [-1.55,-0.2,1.15]:box(Vector3(0.2,2.55,0.08),Vector3(-5.32,2.65,z),wood)
	for y in [1.38,2.65,3.92]:box(Vector3(0.2,0.09,2.8),Vector3(-5.32,y,-0.2),wood)
	box(Vector3(0.55,0.13,2.95),Vector3(-5.18,1.3,-0.2),wood,true)
	var moon=OmniLight3D.new()
	moon.position=Vector3(-4.9,2.8,0.3)
	moon.light_color=Color("6aafc9")
	moon.light_energy=1.5
	moon.omni_range=8
	add_child(moon)
	target("witness",Vector3(-5.05,2.1,0.2),Vector3(0.3,1.3,1.1))
	sign_text("窗 边 · 有 人 在 等 你",Vector3(-5.07,1.63,0.2),19,Color("c3c6b4"),PI/2)
	# Door, worn notice and metal handle.
	box(Vector3(1.65,3.2,0.11),Vector3(0,1.6,7.96),wood,true)
	for x in [-0.91,0.91]:box(Vector3(0.12,3.3,0.22),Vector3(x,1.62,7.89),dark)
	box(Vector3(1.94,0.13,0.22),Vector3(0,3.28,7.89),dark)
	box(Vector3(1.26,1.08,0.03),Vector3(0,2.21,7.87),paint)
	ball(0.045,Vector3(0.59,1.44,7.8),brass)
	rod(Vector3(0.59,1.44,7.8),Vector3(0.37,1.44,7.8),0.025,brass)
	target("door",Vector3(0,1.5,7.74),Vector3(1.5,2.9,0.1))

func _build_furniture():
	# Desk and paperwork.
	box(Vector3(1.65,0.1,1.0),Vector3(-2.76,0.84,1.78),wood,true)
	for x in [-3.45,-2.08]:
		for z in [1.37,2.17]:box(Vector3(0.09,0.84,0.09),Vector3(x,0.42,z),dark,true)
	box(Vector3(1.45,0.25,0.12),Vector3(-2.76,0.65,2.25),dark,true)
	ball(0.035,Vector3(-2.76,0.65,2.33),brass)
	for i in range(5):
		var page=box(Vector3(0.49,0.008,0.38),Vector3(-3.08,0.90+i*0.009,1.75),paper)
		page.rotation.y=randf_range(-0.1,0.1)
	sign_text("维修登记",Vector3(-3.08,1.05,1.75),20)
	target("notice",Vector3(-3.13,1.02,1.78),Vector3(0.58,0.24,0.48))
	# Tall rack for lateral light.
	box(Vector3(1.18,0.08,0.76),Vector3(2.65,1.65,1.9),wood,true)
	box(Vector3(1.18,0.07,0.76),Vector3(2.65,0.68,1.9),wood,true)
	for x in [2.13,3.17]:
		for z in [1.59,2.2]:box(Vector3(0.055,1.65,0.055),Vector3(x,0.82,z),dark,true)
	for i in range(5):box(Vector3(0.12,0.35,0.34),Vector3(2.5+i*0.13,0.9,1.86),material(["61624d","435958","754c36"][i%3]))
	# Pigeonholes.
	box(Vector3(1.4,2.9,0.16),Vector3(4.56,1.46,-3.35),dark,true)
	for x in [3.81,4.3,4.8,5.29]:box(Vector3(0.06,2.95,0.8),Vector3(x,1.48,-3),wood,true)
	for row in range(7):
		box(Vector3(1.57,0.06,0.83),Vector3(4.55,0.14+row*0.46,-3),wood,true)
		for col in range(3):
			if randf()>0.2:box(Vector3(0.29,0.018,0.42),Vector3(4.02+col*0.5,0.19+row*0.46,-2.96),paper)
	box(Vector3(1.68,0.15,0.91),Vector3(4.55,3.0,-3),dark,true)
	sign_text("信 件 请 自 取",Vector3(4.55,3.3,-2.92),26)
	box(Vector3(1.55,0.8,0.75),Vector3(-4.4,0.4,-3.58),wood,true)
	for i in range(3):box(Vector3(0.76,0.17,0.46),Vector3(-4.4,0.9+i*0.18,-3.55),material("696451"))
	# Clock stuck at 21:17.
	var clock_mat=material("b5ab8c")
	var clock=rod(Vector3(4.48,3.9,-4.39),Vector3(4.48,3.9,-4.29),0.36,clock_mat)
	for i in range(12):
		var angle=float(i)*TAU/12
		ball(0.011,Vector3(4.48+sin(angle)*0.29,3.9+cos(angle)*0.29,-4.22),dark)
	rod(Vector3(4.48,3.9,-4.21),Vector3(4.26,3.94,-4.21),0.013,dark)
	rod(Vector3(4.48,3.9,-4.20),Vector3(4.76,3.84,-4.20),0.009,dark)
	# Tangible remnants. A scored plank and scattered splinters.
	for i in range(6):
		var shard=box(Vector3(0.035,0.025,0.18+randf()*0.18),Vector3(1.52+randf()*0.3,0.025,-1.48+randf()*0.4),material("a28452"))
		shard.rotation.y=randf_range(-0.7,0.3)
	box(Vector3(0.09,0.035,0.34),Vector3(1.66,0.03,-1.25),material("967542"))
	box(Vector3(0.008,0.002,0.18),Vector3(1.66,0.049,-1.25),dark)
	target("splinter",Vector3(1.66,0.17,-1.25),Vector3(0.67,0.3,0.6))
	var metal=material("475351",0.4,0.8)
	rod(Vector3(0.75,0.05,-0.2),Vector3(1.16,0.05,-0.2),0.025,metal)
	box(Vector3(0.11,0.035,0.17),Vector3(1.16,0.05,-0.2),metal)
	for i in range(14):
		var page=box(Vector3(0.2+randf()*0.15,0.004,0.26),Vector3(randf_range(-4,4),0.012,randf_range(-2.5,5.4)),paper,false,null,false)
		page.rotation.y=randf()*PI
	for id in STATIONS:
		var pos=STATIONS[id]
		rod(pos-Vector3(0,0.28,0),pos-Vector3(0,0.245,0),0.15,brass)
		rod(pos-Vector3(0,0.245,0),pos-Vector3(0,0.16,0),0.027,brass)
		target(id,pos+Vector3(0,0.03,0),Vector3(0.48,0.57,0.48))
	var rim=material("8b947a")
	rim.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA
	rim.albedo_color.a=0.35
	for i in range(44):
		var a=float(i)*TAU/44
		var b=float(i+1)*TAU/44
		rod(Vector3(cos(a)*2.2,0.012,-2.2+sin(a)*1.1),Vector3(cos(b)*2.2,0.012,-2.2+sin(b)*1.1),0.008,rim)

func ghost_limb(a:Vector3,b:Vector3,r=0.08,r2=-1.0):
	var mesh=rod(a,b,r,dark,memory,r2)
	mesh.layers=MEMORY_LAYER
	mesh.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY

func ghost_head(r:float,pos:Vector3,sc=Vector3.ONE):
	var mesh=ball(r,pos,dark,memory,sc)
	mesh.layers=MEMORY_LAYER
	mesh.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY

func _build_memory():
	memory=Node3D.new()
	add_child(memory)
	ghost_limb(Vector3(-0.98,0.08,-1.62),Vector3(-1.02,0.54,-1.66),0.075)
	ghost_limb(Vector3(-1.02,0.54,-1.66),Vector3(-0.88,0.99,-1.64),0.10)
	ghost_limb(Vector3(-0.36,0.08,-1.55),Vector3(-0.55,0.54,-1.62),0.075)
	ghost_limb(Vector3(-0.55,0.54,-1.62),Vector3(-0.88,0.99,-1.64),0.10)
	ghost_limb(Vector3(-0.88,0.94,-1.64),Vector3(-0.62,1.47,-1.62),0.16,0.21)
	ghost_head(0.18,Vector3(-0.53,1.75,-1.62),Vector3(0.87,1.12,0.9))
	ghost_head(0.05,Vector3(-0.37,1.75,-1.62),Vector3(1.2,0.65,0.7))
	ghost_limb(Vector3(-0.65,1.42,-1.58),Vector3(-0.33,1.6,-1.58),0.08,0.06)
	ghost_limb(Vector3(-0.33,1.6,-1.58),Vector3(-0.1,1.85,-1.6),0.06,0.045)
	ghost_head(0.065,Vector3(-0.08,1.88,-1.59),Vector3(0.85,1.2,0.65))
	for i in range(4):
		var z=-1.69+i*0.068
		ghost_limb(Vector3(-0.08,1.9,z),Vector3(-0.06+(i-1.5)*0.025,2.035-abs(i-1.5)*0.018,z+(i-1.5)*0.033),0.015)
	ghost_limb(Vector3(-0.12,1.87,-1.57),Vector3(-0.23,1.93,-1.47),0.02)
	ghost_limb(Vector3(-0.81,1.39,-1.72),Vector3(-1.12,1.08,-1.82),0.077,0.06)
	ghost_limb(Vector3(-1.12,1.08,-1.82),Vector3(-1,0.92,-1.95),0.055,0.04)
	ghost_head(0.1,Vector3(-1.04,0.09,-1.56),Vector3(1.35,0.65,1.8))
	ghost_head(0.1,Vector3(-0.34,0.09,-1.48),Vector3(1.35,0.65,1.8))
	ghost_limb(Vector3(0.95,1.48,-2.52),Vector3(0.46,2.03,-2.53),0.16,0.21)
	ghost_head(0.18,Vector3(0.27,2.29,-2.54),Vector3(0.9,1.12,0.95))
	ghost_head(0.05,Vector3(0.1,2.27,-2.54),Vector3(1.2,0.7,0.8))
	var cap=box(Vector3(0.38,0.07,0.34),Vector3(0.25,2.43,-2.54),dark,false,memory)
	cap.layers=MEMORY_LAYER
	cap.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
	ghost_limb(Vector3(0.87,1.48,-2.5),Vector3(1.28,1.08,-2.55),0.10,0.08)
	ghost_limb(Vector3(1.28,1.08,-2.55),Vector3(1.51,0.74,-2.54),0.075,0.055)
	ghost_limb(Vector3(0.98,1.49,-2.62),Vector3(0.85,0.95,-2.78),0.105,0.08)
	ghost_limb(Vector3(0.85,0.95,-2.78),Vector3(1.05,0.54,-2.84),0.075,0.05)
	ghost_head(0.095,Vector3(1.54,0.72,-2.5),Vector3(1.5,0.6,1.6))
	ghost_head(0.095,Vector3(1.1,0.53,-2.81),Vector3(1.5,0.6,1.6))
	ghost_limb(Vector3(0.43,1.98,-2.48),Vector3(0.2,1.77,-2.39),0.085,0.07)
	ghost_limb(Vector3(0.2,1.77,-2.39),Vector3(0.12,1.55,-2.3),0.065,0.04)
	ghost_limb(Vector3(0.58,2.05,-2.67),Vector3(0.99,2.22,-2.79),0.08,0.06)
	ghost_limb(Vector3(0.99,2.22,-2.79),Vector3(1.15,2.5,-2.73),0.065,0.04)
	ghost_limb(Vector3(0.4,2.15,-2.51),Vector3(0.08,1.97,-2.43),0.037)
	ghost_limb(Vector3(1.84,0.07,-2.86),Vector3(1.23,2.07,-2.87),0.043)
	ghost_limb(Vector3(1.11,0.07,-3.22),Vector3(0.53,2.07,-3.24),0.043)
	for i in range(1,6):
		var y=i*0.33
		ghost_limb(Vector3(1.86-y*0.305,y,-2.87),Vector3(1.13-y*0.29,y,-3.23),0.031)
	ghost_limb(Vector3(1.24,2.07,-2.87),Vector3(2,0.36,-2.05),0.043)
	ghost_limb(Vector3(2.09,0.16,-1.96),Vector3(2.18,0.025,-1.92),0.05)
	ghost_limb(Vector3(0.53,2.07,-3.24),Vector3(1.32,0.05,-2.39),0.043)
	ghost_limb(Vector3(1.51,1.4,-2.6),Vector3(0.84,1.4,-2.97),0.025)

func _build_candle():
	candle=Node3D.new()
	candle.name="Candle"
	add_child(candle)
	var wax=material("dac697")
	rod(Vector3(0,-0.25,0),Vector3(0,-0.015,0),0.067,wax,candle)
	rod(Vector3(0,-0.01,0),Vector3(0,0.035,0),0.006,dark,candle)
	for i in range(5):
		var a=i*1.4
		rod(Vector3(cos(a)*0.061,-0.045,sin(a)*0.061),Vector3(cos(a)*0.066,-0.14-randf()*0.05,sin(a)*0.066),0.01,wax,candle)
	var fire=material("ffcf79")
	fire.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	flame=ball(0.046,Vector3(0,0.075,0),fire,candle,Vector3(0.7,1.8,0.7))
	flame.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	light=OmniLight3D.new()
	light.position.y=0.08
	light.light_color=Color("ffca88")
	light.light_energy=3.6
	light.omni_range=16
	light.omni_attenuation=1.45
	light.shadow_enabled=true
	light.shadow_bias=0.04
	light.shadow_normal_bias=0.2
	light.light_cull_mask=ROOM_LAYER
	light.shadow_caster_mask=ROOM_LAYER | WALL_LAYER
	candle.add_child(light)
	# The same candle lights the wall, but only this light sees the memory casters.
	# Ground and furniture therefore never receive human/ladder silhouettes.
	wall_light=light.duplicate()
	wall_light.name="WallMemoryLight"
	# Compatibility rendering requires casters in both light and shadow masks.
	wall_light.light_cull_mask=WALL_LAYER | MEMORY_LAYER
	wall_light.shadow_caster_mask=ROOM_LAYER | WALL_LAYER | MEMORY_LAYER
	wall_light.shadow_opacity=0.82
	wall_light.shadow_blur=2.0
	candle.add_child(wall_light)
	place_candle("desk")

func place_candle(id:String):
	if not STATIONS.has(id): return
	if candle.get_parent()!=self: candle.reparent(self)
	candle.position=STATIONS[id]
	candle.rotation=Vector3.ZERO

func hold_candle(camera:Camera3D):
	candle.reparent(camera)
	candle.position=Vector3(0.36,-0.28,-0.82)
	candle.rotation=Vector3.ZERO

func _build_ambience():
	rain_player=AudioStreamPlayer.new()
	add_child(rain_player)
	var sound=AudioStreamWAV.new()
	sound.format=AudioStreamWAV.FORMAT_16_BITS
	sound.mix_rate=22050
	sound.loop_mode=AudioStreamWAV.LOOP_FORWARD
	sound.loop_end=88200
	var bytes=PackedByteArray()
	bytes.resize(176400)
	var brown=0.0
	for i in range(88200):
		brown=(brown+randf_range(-0.02,0.02))/1.022
		bytes.encode_s16(i*2,int(clamp(brown*28000,-32767,32767)))
	sound.data=bytes
	rain_player.stream=sound
	rain_player.volume_db=-24
	rain_player.play()

func _process(delta):
	time+=delta
	if is_instance_valid(light):
		light.light_energy=3.6+sin(time*7.4)*0.08+sin(time*12.9)*0.04
		wall_light.light_energy=light.light_energy
		flame.scale.y=1.8+sin(time*5)*0.06
