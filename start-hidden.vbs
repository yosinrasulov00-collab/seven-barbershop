Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd /c npm run start", 0, False
WScript.Sleep 2000
WshShell.Run "http://localhost:3000", 1, False
