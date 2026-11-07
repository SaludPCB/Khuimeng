Output docs/demo.gif

Require khuimeng

Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 420
Set Padding 20
Set WindowBar Colorful
Set Theme "Catppuccin Mocha"

# Clean prompt with no username or local path
Hide
Type "export PS1='$ '"
Enter
Type "clear"
Enter
Show

Sleep 2s
Type@85ms 'khuimeng --mock "write an add(a, b) function"'
Sleep 1s
Enter

# Give ample time for users to read the dual-gate verdict flow
Sleep 10s
