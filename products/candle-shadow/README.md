# 烛之影：熄灯之后

Godot 4.6 原生 Windows 3D 推理游戏 Demo。第一人称步行、碰撞、鼠标环顾、近距射线交互；可拾取蜡烛并放置于三座烛台。不同位置的实时灯光照射同一组立体剪影模型，改变墙上投影。收集六项记录、询问证人，完成事件还原。

0.2.1 更新：人物与折梯模型只参与投影，不渲染本体。记忆投影限制在案发墙及其护墙板，地板与家具不再接收人物残影；墙影减淡以保留墙面质感。

## 游玩

双击 `build/CandleShadow.exe`。无需浏览器、服务器或编辑器，操作见 `build/开始游玩.txt`。源工程位于 `game/project.godot`。

## 版本范围

一个房间、一个完整案件、三种判断结果，含标题、暂停、证据册、提示、保存/继续、重开与退出。场景、剪影和声音使用程序生成的原型资产；此版主要验证原生操作和烛光推理流程。尚无人物动画、配音、手柄支持与多个章节。

## 开发与验证

本地引擎：`tools/godot-4.6/Godot_v4.6-stable_win64_console.exe`。

```powershell
# 以下命令在本项目根目录执行。
& .\tools\godot-4.6\Godot_v4.6-stable_win64_console.exe --path .\game --editor
& .\tools\godot-4.6\Godot_v4.6-stable_win64_console.exe --headless --path .\game -- --self-test
& .\tools\godot-4.6\Godot_v4.6-stable_win64_console.exe --headless --path .\game --export-release 'Windows Desktop' ..\build\CandleShadow.exe
```

自测和截图使用独立的 `automation-save.json`，正常游玩使用 `save.json`。本次验证还将 APPDATA、LOCALAPPDATA 指向工程内目录以隔离开发数据。`-- --capture-dir=绝对路径` 是开发截图入口，运行图形渲染后自动退出。

`artifacts/` 存放实际运行截图与验证日志。导出使用官方 Windows x64 release 模板，资源嵌入 EXE。

旧网页版与历史原型保留在原目录；后续原生开发以本工程为准。
