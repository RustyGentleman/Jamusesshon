//# ----------------- Imports ----------------- //
const fetch = require('node-fetch')
const tmi = require('tmi.js')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { type } = require('os')
const WebSocketServer = require('websocket').server

//# ---------------- Constants ---------------- //
const YT_API_KEY = 'no:)'
const LOG_RESET = '\u001b[0m'
const LOG_SRV_O = '\u001b[30;42;1mSRV'
const LOG_SYS_O = '\u001b[30;43;1mSYS'
const LOG_CHT_O = '\u001b[30;44;1mCHT'
const LOG_SRV = `${LOG_SRV_O}:${LOG_RESET}`
const LOG_SYS = `${LOG_SYS_O}:${LOG_RESET}`
const LOG_CHT = `${LOG_CHT_O}:${LOG_RESET}`

const host = 'localhost'
const port_server = 8000

const UNSTARTED = -10
const ENDED = 0
const PLAYING = 1
const PAUSED = 2
const BUFFERING = 3
const CUED = 5
const PlayerState = {
	'-10': 'UNSTARTED',
	0: 'ENDED',
	1: 'PLAYING',
	2: 'PAUSED',
	3: 'BUFFERING',
	5: 'CUED',
}

// --------------- Server stuff --------------- //
//* HTTP server
const server = http.createServer((req, res) => {
	console.log(`${LOG_SRV} [${req.remoteAddress}] ${req.method} ${req.url}`)
	if (req.method == 'GET') {
		const file_url = (req.url == '/')? '/index.html' : req.url
		let file_path = path.resolve('.' + file_url)
		const file_ext = path.extname(file_path)
		
		if (file_ext == '.html') {
			fs.exists(file_path, (exists) => {
				if (!exists) {
					file_path = path.resolve('./404.html')
					res.statusCode = 404
					res.setHeader('Content-Type', 'text/html')
					fs.createReadStream(file_path).pipe(res)
					return
				}
				res.statusCode = 200
				res.setHeader('Content-Type', 'text/html')
				fs.createReadStream(file_path).pipe(res)
			})
		}
		else if (file_ext == '.css' | file_ext == '.map' | file_ext == '.sass') {
			res.statusCode = 200
			res.setHeader('Content-Type', 'text/css')
			fs.createReadStream(file_path).pipe(res)
		}
		else if (file_ext == '.js') {
			res.statusCode = 200
			res.setHeader('Content-Type', 'text/javascript')
			fs.createReadStream(file_path).pipe(res)
		}
		else if (file_ext == '.svg') {
			res.statusCode = 200
			res.setHeader('Content-Type', 'image/svg+xml')
			fs.createReadStream(file_path).pipe(res)
		}
		else if (file_ext == '.mp3') {
			res.statusCode = 200
			res.setHeader('Content-Type', 'audio/mpeg')
			fs.createReadStream(file_path).pipe(res)
		}
		else { //* 404
			file_path = path.resolve('./404.html')
			res.statusCode = 404
			res.setHeader('Content-Type', 'text/html')
			fs.createReadStream(file_path).pipe(res)
		}
	}
	else { //* 404
		filePath = path.resolve('/404.html')
		res.statusCode = 404
		res.setHeader('Content-Type', 'text/html')
		fs.createReadStream(filePath).pipe(res)
	}
})
server.listen(port_server, host, () => console.log(`${LOG_SRV} Live at http://${host}:${port_server}/`))

// -------------- WebSocket stuff ------------- //
//* WS response template
class WSR {
	type

	/**
	 * WebSocket server response template
	 * @param {string} type 
	 * @param {object} content 
	 */
	constructor(type, content={}) {
		this.type = type
		Object.keys(content).forEach((k) => this[k] = content[k])
	}

	toString() {
		return JSON.stringify(this)
	}
}
//* Client class
class Client {
	static list = []
	token
	ip
	username
	color
	player_state
	vote = false

	static get count() 	{return Client.list.filter(c => c.username != undefined).length}
	static get ready() 	{return Client.list.filter(c => c.player_state == CUED).length}
	static get done()		{return Client.list.filter(c => c.player_state == ENDED).length}
	get tag() 		{return `<span class="username" style="color:${this.color}">[${this.username}]</span>`}
	get mention() 	{return `<span class="username mention" style="color:${this.color}">@${this.username}</span>`}
	set username(un) {
		queue.list.filter(r => r.requester == this.username).forEach(r => r.requester = un)
		this.username = un
	}
	set color(color) {
		queue.list.filter(r => r.requester == this.username).forEach(r => r.requesterColor = color)
		this.color = color
	}

	/**
	 * Chat client, for keeping track of things.
	 * @param {{token?:string, ip?:string, username?:string, color?:string, player_state?:number, vote?:boolean}} obj
	 */
	constructor(obj) {
		if (obj == undefined) return
		Object.keys(obj).forEach((k) => this[k] = obj[k])
	}

	/**
	 * Returns a list of clients with parameters that match the `obj` parameter.
	 * Returns an empty list if there are no matches.
	 * @param {{token?:string, ip?:string, username?:string, color?:string, player_state?:number, vote?:boolean}} obj An object whose parameters will be searched in the list of clients
	 */
	static search(obj) {
		const keys = Object.keys(obj)
		let ret = []
		Client.list.forEach((c) => {
			keys.forEach((k) => {
				if (c[k] == obj[k])
					ret.push(c)
			})
		})
		return ret
	}
	/**
	 * Registers the client into the client list, if it's not already registered.
	 */
	register() {
		if (Client.search(this).length > 0) return false
		Client.list.push(this)
		return true
	}
	/**
	 * Removes the client from the client list.
	 */
	unregister() {
		Client.list = Client.list.filter(c => c != this)
		// queue.Unqueue(this.username)
	}
	/**
	 * Set missing parameters
	 * @param {{token?:string, ip?:string, username?:string, color?:string, player_state?:number, voteskip?:boolean}} obj
	 */
	set(obj){
		if (obj == undefined) return
		Object.keys(obj).forEach((k) => this[k] = obj[k])
	}
	/**
	 * Attempts to set a client's username. Returns false if the username is taken, otherwise returns true.
	 * Also reflects the change in all items in queue requested by the user.
	 * @param {string} un New username
	 */
	set_username(un){
		if (Client.search({username: un}).length) return false
		this.username = un
		return true
	}
}

//* WebSocket server
let message_list = []
let msg_index = 0
const wsserver = new WebSocketServer({httpServer: server})
wsserver.on('request', function(rq) {
	const client = new Client({ip: rq.remoteAddress})
	// if (client.register() == false) {
	// 	rq.reject(409, 'Client IP already has a connected session')
	// 	return
	// }
	const connection = rq.accept(null, rq.origin)
	client.register()
	//- Send token, chat history, queue and current video, if there is one
	connection.sendUTF(new WSR('token', {token: client.token = rq.key}))
	connection.sendUTF(new WSR('history', {history: message_list}))
	connection.sendUTF(new WSR('queue', {queue: [queue.current, ...queue.list]}))

	if (queue.current) {
		connection.sendUTF(new WSR('video', queue.current))
		connection.sendUTF(new WSR('player', {order: PLAYING}))
	}

	console.log(`${LOG_CHT} [${client.ip}] has connected`)

	connection.on('message', async (message) => {
		try {
			const msg = JSON.parse(message.utf8Data)

			if (msg.set_color)
				client.color = msg.set_color
			if (msg.set_username) {
				const initial = client.username
				const success = client.set_username(msg.set_username)
				connection.sendUTF(new WSR('set_username', {username: msg.set_username, success: success}))
				if (success)
					if (initial == undefined) {
						SendSystemMessage(`${client.tag} has entered the chat`)
						console.log(`${LOG_CHT} [${client.username}] has entered the chat`)
					}
					else {
						SendSystemMessage(`${client.tag.replace(msg.set_username, initial)} is now ${client.tag}`)
						console.log(`${LOG_CHT} [${initial}] is now [${client.username}]`)
					}
			}
			if (msg.message) {
				//- Admin commands (localhost only)
				if (rq.remoteAddress == '127.0.0.1') {
					if (msg.message == '##start') {
						// SendSystemMessage('Force-starting at an admin\'s request')
						queue.Dequeue()
						return
					}
					if (msg.message == '##skip') {
						SendSystemMessage('Skipping at an admin\'s request')
						queue.Dequeue()
						return
					}
					// if (msg.message == '##play' || msg.message == '##resume') {
					// 	SendSystemMessage('Playing at an admin\'s request')
					// 	queue.pause(false, true)
					// 	return
					// }
					// if (msg.message == '##pause') {
					// 	SendSystemMessage('Pausing at an admin\'s request')
					// 	queue.Pause(true, true)
					// 	return
					// }
				}
				let message_content = msg.message
				if (message_content.includes('@')) {
					console.log(message_content.match(/@\w+/g))
					message_content.match(/@\w+/g).forEach(at => {
						if (Client.search({username: at.slice(1)}).length == 0) return
						const user = Client.search({username: at.slice(1)})[0]
						if (message_content.includes(user.mention)) return
						message_content = message_content.replaceAll(at, user.mention)
						console.log(user.mention)
					})
				}
				const message_object = {
					username: client.username,
					message: message_content,
					order: msg_index++,
					color: client.color
				}
				message_list.push(message_object)
				broadcast(new WSR('message', message_object))
				console.log(`${LOG_CHT_O}:\u001b[0;34m ${client.username}@${connection.remoteAddress}:${LOG_RESET} ${msg.message}`)
			}
			if (msg.query) {
				const result = await SearchYouTube(msg.query)
				// queue.Queue(new QueueItem(client.username, client.color, result.title, result.id))
				queue.Queue(new QueueItem({
					requester: client.username,
					requesterColor: client.color,
					title: result.snippet.title,
					channel: result.snippet.channelTitle,
					thumbnail: result.snippet.thumbnails.medium.url,
					id: result.id.videoId,
				}))
				SendSystemMessage(`${client.tag} has requested:\n<span class="media-title">[${result.snippet.title}]</span>`)
				console.log(`${LOG_SYS} [${client.username}] added [${result.snippet.title}] to the queue`)
				broadcast(new WSR('queue', {queue: [queue.current, ...queue.list]}))
			}
			if (msg.vote != undefined) {
				if (queue.current == undefined || client.vote == msg.vote)
					connection.sendUTF(new WSR('confirmvote', {vote: client.vote}))
				else {
					client.vote = msg.vote
					connection.sendUTF(new WSR('confirmvote', {vote: msg.vote}))
					console.log(`${LOG_CHT} [${client.username}] has voted to skip. ${queue.votes}/${queue.votes_needed}`)
					SendSystemMessage(`${client.tag} has ${client.vote? 'voted to skip':'removed their vote'}`)
				}
			}
			if (msg.player_state != undefined)
				(client.player_state = msg.player_state)
		} catch (e) {console.error(e); console.log(message)}
	})
	connection.on('close', (reasonCode, description) => {
		if (client.username != undefined) {
			console.log(`${LOG_CHT} [${client.username}@${client.ip}] has disconnected`)
			SendSystemMessage(`${client.tag} has left the chat</span>`)
		}
		client.unregister()
	})
})

// --------------- Queue system --------------- //
//* Classes
class QueueItem {
	requester
	requesterColor
	title
	channel
	thumbnail
	id
	state = UNSTARTED
	time = 0

	/**
	 * 
	 * @param {{requester?:string, requesterColor?:string, title?:string, channel?:string, thumbnail?:string, id?:string}} obj 
	 */
	constructor(obj) {
		Object.keys(obj).forEach((k) => this[k] = obj[k])
	}
}
class Queue {
	list = []
	current
	current_start
	skip_threshold = 0.5
	int_skip_check
	int_ready_check
	int_done_check

	get votes()				{return Client.list.filter(c => c.username != undefined && c.vote == true).length}
	get votes_needed() 	{return Math.max(1, Math.floor(Client.count * queue.skip_threshold))}
	get empty() {
		return this.list.length == 0
	}

	constructor() {
		this.int_skip_check = setInterval(() => {
			if (Client.count <= 0 || this.current == undefined) return
			if (this.votes >= this.votes_needed)
				this.Skip()
		}, 1000)
		this.int_ready_check = setInterval(() => {
			if (Client.ready < Client.count || this.current == undefined) return
			broadcast(new WSR('player', {order: PLAYING}))
			this.current.state = PLAYING
		}, 1000)
		this.int_done_check = setInterval(() => {
			if (Client.count <= 0 || Client.done < Client.count || this.current == undefined || this.current?.state == ENDED) return
			const requester = Client.search({username: this.current.requester})[0]
			SendSystemMessage(`That was <span class="media-title">[${this.current.title}]</span>,\nrequested by ${requester? requester.tag : `<span class="disconnected-client" style="color:${this.current.requester.color}">[${this.current.requester}]</span>`}`)
			this.current.state = ENDED
			if (queue.empty) return
			queue.Dequeue()
		}, 1000)
	}

	/**
	 * Remove all videos from a requester, optionally with title matching a `title`
	 * @param {string} requester User who made the request
	 * @param {string} title Optional. String the entry's title has to match
	 */
	Unqueue(requester, title='') {
		let size = this.list.length
		this.list = this.list.filter(i => title? !(i.requester == requester && i.title.includes(title)) : !(i.requester == requester))
		return size - this.list.length
	}
	/**
	 * Adds item to the end of the queue, and dequeues it if it's the only one
	 * @param {QueueItem} item Item to be added to the queue
	 */
	Queue(item) {
		this.list.push(item)
	}
	/**
	 * Sends next video on queue out to be played
	 */
	Dequeue() {
		if (this.empty) {
			SendSystemMessage('Cannot dequeue: queue is empty')
			return
		}
		this.current = this.list.shift()
		this.current.start_time = Date.now()
		const requester = Client.search({username: this.current.requester})[0]
		broadcast(new WSR('video', this.current))
		broadcast(new WSR('queue', {queue: [queue.current, ...queue.list]}))
		broadcast(new WSR('confirmvote', {vote: false}))
		Client.list.forEach(c => c.vote = false)
		SendSystemMessage(`Cuing <span class="media-title">[${this.current.title}]</span>\nrequested by ${requester? requester.tag : `<span class="disconnected-client" style="color:${this.current.requester.color}">[${this.current.requester}]</span>`}`)
	}
	/**
	 * Resets the queue
	 */
	Reset() {
		this.list = []
		this.skipvotes = []
		this.skip_threshold = 0.5
	}
	Skip() {
		if (this.empty) {
			SendSystemMessage('Cannot skip: queue is empty')
			Client.list.forEach(c => c.vote = false)
			broadcast(new WSR('confirmvote', {vote: false}))
			return
		}
		this.Dequeue()
		SendSystemMessage('Skipping current video')
	}
	// Pause(pause, admin=false) {
	// 	this.current.state = pause
	// 	broadcast(new WSR('player', {order: PAUSED}))
	// 	if (admin) return
	// 	SendSystemMessage(`${pause? 'Pausing':'Resuming'} playback`)
	// }
}

//* Code
const queue = new Queue()

//* Functions
async function SearchYouTube(query) {
	let full
	const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURI(query)}&type=video&order=relevance&key=${YT_API_KEY}`)
	try {
		const r = await res.json()
		return full = r.items[0]
	} finally {
		return full
	}
}
/**
 * Sends stringified message to all WebSocket clients
 * @param {stringified} content Stringified message
 */
function broadcast(content) {
	wsserver.connections.forEach(c => c.sendUTF(content))
}
/**
 * Sends a chat message as the system to all clients
 * @param {string} msg Message
 */
function SendSystemMessage(msg, bc=true) {
	const message = {
		username: '<<System>>',
		message: msg,
		order: msg_index++,
	}
	if (bc) {
		message_list.push(message)
		broadcast(new WSR('message', message))
	}
	else
		return new WSR('message', message)
}