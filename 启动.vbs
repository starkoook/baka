Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the folder where this script is located
ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Run node in that folder, hide console (0 = hidden)
WshShell.Run "cmd /c ""cd /d " & ScriptDir & " && node scripts\start.js""", 0, False
