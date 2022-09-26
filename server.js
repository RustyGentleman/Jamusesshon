// -------------------------------------------- //
//# ----------------- Imports ----------------- //
// -------------------------------------------- //
const fetch = require('node-fetch')
const tmi = require('tmi.js')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { type } = require('os')
const WebSocketServer = require('websocket').server

// -------------------------------------------- //
//# ---------------- Constants ---------------- //
// -------------------------------------------- //
const TTV_BOT_TOKEN = 'oauth:itr6kpsm79utizopb23o2xqo9xsf5t'
const CHAN = '#rogue_v'
const YT_API_KEY = 'AIzaSyBonYTnI1BofAwrIKjuZFfzTgcChnstV38'
const LOG_RESET = '\u001b[0m'
const LOG_SRV_O = '\u001b[30;42;1mSRV'
const LOG_SYS_O = '\u001b[30;43;1mSYS'
const LOG_CHT_O = '\u001b[30;44;1mCHT'
const LOG_SRV = `${LOG_SRV_O}:${LOG_RESET}`
const LOG_SYS = `${LOG_SYS_O}:${LOG_RESET}`
const LOG_CHT = `${LOG_CHT_O}:${LOG_RESET}`

const host = 'localhost'
const port_server = 8000

const ENDED = 0
const PLAYING = 1
const PAUSED = 2
const BUFFERING = 3
const CUED = 5

// -------------------------------------------- //
// --------------- Server stuff --------------- //
//* HTTP server
const server = http.createServer((req, res) => {
	console.log(`${LOG_SRV} [${req.remoteAddress}] ${req.method} ${req.url}`)
	if (req.method == 'POST') {
		let body = ''
		req.on('data', chunk => body += chunk)
		req.on('end', async () => {
			const op = JSON.parse(body)
			let status = 200
			try {
				if (op.queue) {
					const result = await SearchYouTube(op.query)
					queue.Queue(new QueueItem(op.user, result.title, result.id))
				}
				if (op.unqueue) {
					queue.Unqueue(op.user, op.query)
				}
				if (op.voteskip) {
					
				}
			}
			catch(e) {
				console.error('Exception in API:')
				console.error(e)
			}
			res.statusCode = 200
			res.end()
		})
	}
	else if (req.method == 'GET') {
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

//* WS response template
class WSR {
	content = {}

	/**
	 * WebSocket server response template
	 * @param {string} type 
	 * @param {object} content 
	 */
	constructor(type, content={}) {
		this.content = content
		this.content.type = type
	}

	toString() {
		return JSON.stringify(this.content)
	}
}

//* WebSocket server
let message_list = []
let clients_ready = []
let clients_done = []
let msg_index = 0

const wsserver = new WebSocketServer({httpServer: server})
wsserver.on('request', function(request) {
	const connection = request.accept(null, request.origin)
	console.log(`${LOG_CHT} [${request.remoteAddress}] has connected`)
	//- Send chat history
	connection.sendUTF(new WSR('history', {history: message_list}))
	//- Send current video, if there is one
	if (queue.current)
		connection.sendUTF(new WSR('video', queue.current))

	connection.on('message', async (message) => {
		// console.log(message.utf8Data)
		try {
			const msg = JSON.parse(message.utf8Data)

			if (msg.token == 'unreceived')
				connection.sendUTF(new WSR('token', {token: request.key}))
			else if (msg.message) {
				if (msg.message == '##start') {
					queue.Dequeue()
					return
				}
				const message_object = {
					username: msg.username,
					message: msg.message,
					order: msg_index++,
					color: msg.color
				}
				message_list.push(message_object)
				broadcast(new WSR('message', message_object))
				console.log(`${LOG_CHT_O}:\u001b[0;34m ${msg.username}@${connection.remoteAddress}:${LOG_RESET} ${msg.message}`)
			}
			else if (msg.query) {
				const result = await SearchYouTube(msg.query)
				queue.Queue(new QueueItem(msg.username, msg.color, result.title, result.id))
				SendSystemMessage(`${msg.color?`<span style="color:${msg.color}">`:''}[${msg.username}]${msg.color?'</span>':''} added [${result.title}] to the queue`)
				console.log(`${LOG_SYS} [${msg.username}] added [${result.title}] to the queue`)
			}
			else if (msg.vote != undefined) {
				queue.Voteskip(msg.username, msg.vote, msg.color)
				connection.sendUTF(new WSR('confirmvote', {vote: msg.vote}))
			}
			else if (msg.playstate) {
				console.log(`${LOG_CHT} ${msg.username}@${request.remoteAddress} ${msg.playstate}`)
				switch (msg.playstate) {
					case 'CUED':
						clients_ready.push(msg.username)
						console.log(`${LOG_SYS} Clients ready out of ${chatter_count()}: ${JSON.stringify(clients_ready)}`)
						if (clients_ready.length == wsserver.connections.length) {
							clients_ready = []
							broadcast(new WSR('player', {order: PLAYING}))
						}
						break
					case 'PLAYING':
						connection.sendUTF(new WSR('catchup', {start: queue.current.start_time}))
						break
					case 'ENDED':
						clients_done.push(msg.username)
						console.log(`${LOG_SYS} Clients done out of ${chatter_count()}: ${JSON.stringify(clients_done)}`)
						if (clients_done.length == 1)
							SendSystemMessage(`That was [${queue.current.title}], requested by ${msg.color?`<span style="color:${msg.color}">`:''}[${queue.current.requester}]${msg.color?'</span>':''}!${queue.empty? '' : '\nNext will be cued once all have finished'}`)
						if (clients_done.length == wsserver.connections.length) {
							clients_done = []
							queue.Dequeue()
						}
						break
				}
			}
		} catch (e) {console.error(e); console.log(message)}
	})
	connection.on('close', (reasonCode, description) => console.log(`${LOG_CHT} [${request.remoteAddress}] has disconnected`))
})

// -------------------------------------------- //
// --------------- Queue system --------------- //
// -------------------------------------------- //
//* Classes
class QueueItem {
	requester
	requesterColor
	title
	id
	
	constructor(requester, color, title, id) {
		this.requester = requester
		this.requesterColor = color
		this.title = title
		this.id = id
	}
	
	get link() {
		return `https://www.youtube.com/watch?v=${this.id}`
	}
}
class Queue {
	list = []
	current
	current_start
	skipvotes = []
	skip_threshold = 0.5

	get votes_needed() {
		return Math.max(1, Math.floor(chatter_count() * queue.skip_threshold))
	}
	get empty() {
		return this.list.length == 0
	}

	/**
	 * Remove all videos with `search` in their title
	 * @param {string} requester User who made the request
	 * @param {string} search Text to search for
	 */
	Unqueue(requester, search) {
		let size = this.list.length
		this.list = this.list.filter(i => !(i.requester == requester && i.title.includes(search)))
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
		if (this.empty) return
		this.current = this.list.shift()
		this.current.start_time = Date.now()
		broadcast(new WSR('video', this.current))
		SendSystemMessage(`Cuing [${this.current.title}], requested by ${this.current.requesterColor?`<span style="color:${this.current.requesterColor}">`:''}[${this.current.requester}]${this.current.requesterColor?'</span>':''}`)
	}
	/**
	 * Resets the queue
	 */
	Reset() {
		this.list = []
		this.skipvotes = []
		this.skip_threshold = 0.5
	}
	Voteskip(username, vote, color='') {
		if (vote == true && this.skipvotes.includes(username)) return
		console.log(queue.skipvotes)
		if (vote == true)
			this.skipvotes.push(username)
		else if (vote == false)
			this.skipvotes = this.skipvotes.filter(u => u != username)

		if (this.skipvotes.length < this.votes_needed)
			SendSystemMessage(`${color.length?`<span style="color:${color}">`:''}[${username}]${color.length?'</span>':''} has ${vote? 'voted to skip' : 'removed their vote'}.\nSkip votes: ${this.skipvotes.length}/${this.votes_needed}`)
		else {
			SendSystemMessage(`${color.length?`<span style="color:${color}">`:''}[${username}]${color.length?'</span>':''} has ${vote? 'voted to skip' : 'removed their vote'}.\nSkipping`)
			if (this.empty)
				broadcast(new WSR('player', {order: ENDED}))
			else
				this.Dequeue()
		}
	}
}

//* Code
const queue = new Queue()
let chatter_count = () => wsserver.connections.length

//* Functions
async function SearchYouTube(query) {
	let full
	const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURI(query)}&type=video&order=relevance&key=${YT_API_KEY}`)
	try {
		const r = await res.json()
		return full = r.items[0]
	} finally {
		const id = full.id.videoId
		const title = full.snippet.title.replaceAll('&#39;', '\'')
		return { id: id, title: title, full: full }
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
function SendSystemMessage(msg) {
	const message = {
		username: '<<System>>',
		message: msg,
		order: msg_index++,
	}
	message_list.push(message)
	broadcast(new WSR('message', message))
}