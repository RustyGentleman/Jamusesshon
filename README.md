<div align=center>
	<h1>
		<img src="https://github.com/RustyGentleman/Jamusesshon/blob/master/title.svg?raw=true">
	</h1>
</div>
A server-client system for watching YouTube videos in a group.
<h2>Setup</h2>
<ul>
	<li>Obtain a <a href="https://developers.google.com/youtube/registering_an_application" target="_blank" rel="noopener noreferrer">YouTube Data API key</a> and set it in the variable <code>YT_API_KEY</code> in line 11 of <code>server.js</code>. This will be used by the server to search for videos based on clients' requests and add them to the queue.</li>
	<li>Run <code>server.js</code> on an instance of Node.js. By default, the server will bind to <code>localhost:80</code>. This can be changed in <code>server.js</code></li>
	<li>On a browser, <code>http://localhost/</code> will access the client.</li>
	<li>Use a service such as <a href="https://ngrok.com/" target="_blank" rel="noopener noreferrer">ngrok</a> to forward the localhost client for others to join.</li>
</ul>
