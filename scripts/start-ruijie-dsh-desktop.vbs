Option Explicit

Dim shell, fileSystem, scriptDirectory, workspaceRoot
Dim electronPath, mainScript, localDataRoot, dshHome, electronUserData
Dim processEnvironment, command

Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

scriptDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
workspaceRoot = fileSystem.GetParentFolderName(scriptDirectory)
electronPath = fileSystem.BuildPath(workspaceRoot, "dsh-plugin-desktop\node_modules\electron\dist\electron.exe")
mainScript = fileSystem.BuildPath(workspaceRoot, "dsh-plugin-desktop\lib\main.js")
localDataRoot = fileSystem.BuildPath(workspaceRoot, ".local-data")
dshHome = fileSystem.BuildPath(localDataRoot, "dsh-home")
electronUserData = fileSystem.BuildPath(localDataRoot, "electron-user-data")

If Not fileSystem.FileExists(electronPath) Then
  MsgBox "Ruijie Harness runtime is missing.", 16, "Ruijie Harness"
  WScript.Quit 1
End If
If Not fileSystem.FileExists(mainScript) Then
  MsgBox "Ruijie Harness build is missing.", 16, "Ruijie Harness"
  WScript.Quit 1
End If

If Not fileSystem.FolderExists(localDataRoot) Then fileSystem.CreateFolder localDataRoot
If Not fileSystem.FolderExists(dshHome) Then fileSystem.CreateFolder dshHome
If Not fileSystem.FolderExists(electronUserData) Then fileSystem.CreateFolder electronUserData

Set processEnvironment = shell.Environment("PROCESS")
processEnvironment("DSH_HOME") = dshHome
processEnvironment("RUIJIE_DSH_USER_DATA_DIR") = electronUserData
shell.CurrentDirectory = workspaceRoot

command = Quote(electronPath) & " " & Quote(mainScript)
' Window style 0 and wait=false: no console is created and the launcher exits.
shell.Run command, 0, False

Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function
