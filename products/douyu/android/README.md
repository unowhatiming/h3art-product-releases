# 豆屿拼豆工作室 Android

适用于 Android 8.0 及以上。安装 APK 后从桌面打开，在手机上选图、生成和编辑图纸。图片与项目由设备上的 WebView 处理。应用安装包包含界面、生成逻辑和色板，无联网权限。

- 使用系统文件选择器选择照片、项目或自定义色板。
- 导出图纸、材料清单或项目时选择保存位置。飞行模式下请选择设备本地目录。
- PNG 用于查看和分享。`.beads.json` 用于备份、换设备和继续编辑。清理应用数据或卸载前先导出项目。

## 构建

需要 Windows PowerShell、JDK 17、Android SDK Platform 35 和 Build Tools 35.0.0。

```powershell
./android/build-apk.ps1 -SdkRoot 'C:/Android/sdk' -JavaHome 'C:/Java/jdk-17'
```

构建会验证 APK 签名和对齐。首次构建会生成本机签名材料，保存在 `%LOCALAPPDATA%/DouyuAndroidSigning`。同一设备上的后续安装包需使用相同签名才能覆盖升级和保留应用数据。
