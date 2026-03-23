on resolveRepoRoot()
	set appPath to POSIX path of (path to me)
	return do shell script "cd " & quoted form of (appPath & "/../..") & " && pwd"
end resolveRepoRoot

on run
	set repoRoot to my resolveRepoRoot()
	set launcherMessage to "网页前端本身不能冷启动提供它自己的 agent，所以这里用一个 Mac 启动器来负责启动、打开和停止本地服务。"
	set choice to button returned of (display dialog launcherMessage buttons {"取消", "停止 Agent", "打开控制台", "启动 Agent"} default button "启动 Agent" with title "Screen Pilot Launcher")
	
	if choice is "启动 Agent" then
		try
			do shell script "cd " & quoted form of repoRoot & " && ./scripts/dev/start-local-agent.command"
			display notification "本地 agent 启动命令已执行，浏览器会自动打开控制台。" with title "Screen Pilot"
		on error errMsg
			display dialog errMsg buttons {"好"} default button "好" with title "Screen Pilot Launcher"
		end try
	else if choice is "打开控制台" then
		do shell script "open http://127.0.0.1:8788"
	else if choice is "停止 Agent" then
		try
			do shell script "cd " & quoted form of repoRoot & " && ./scripts/dev/stop-local-agent.command"
			display notification "本地 agent 已停止。" with title "Screen Pilot"
		on error errMsg
			display dialog errMsg buttons {"好"} default button "好" with title "Screen Pilot Launcher"
		end try
	end if
end run
