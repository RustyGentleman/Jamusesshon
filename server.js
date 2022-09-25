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
const port_ws = 8001

// -------------------------------------------- //
// --------------- Server stuff --------------- //
//* HTTP server
const server = http.createServer((req, res) => {
	if (req.url == '/')
		console.log(`${LOG_SRV} Page request`)
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
	constructor(type, content) {
		this.content = content
		this.content.type = type
	}

	get string() {return JSON.stringify(this.content)}
}

//* WebSocket server
let message_list = []
let msg_index = 0
const wsserver = new WebSocketServer({httpServer: server})
wsserver.on('request', function(request) {
	const connection = request.accept(null, request.origin)
	console.log(`${LOG_CHT} [${request.remoteAddress}] has connected`)
	connection.sendUTF(new WSR('history', {history: message_list}).string)

	connection.on('message', (message) => {
		try {
			const msg = JSON.parse(message.utf8Data)
			console.log(`${LOG_CHT} ${message.utf8Data}`)

			if (msg.token == 'unreceived') {
				connection.sendUTF(new WSR('token', {token: request.key}).string)
				return
			}
			if (msg.content) {
				const message_object = {
					username: msg.username,
					content: msg.content,
					order: msg_index++,
					color: msg.color
				}
				message_list.push(message_object)
				wsserver.connections.forEach(c => c.sendUTF(new WSR('message', message_object).string))
			}
		} catch (e) {console.error(e)}
	})
	connection.on('close', (reasonCode, description) => console.log(`${LOG_CHT} [${request.remoteAddress}] has connected`))
})

// -------------------------------------------- //
// --------------- Queue system --------------- //
// -------------------------------------------- //
//* Classes
class QueueItem {
	requester
	title
	id
	
	constructor(requester, title, id) {
		this.requester = requester
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
	skipvotes = []
	skip_threshold = 0.5

	get votes_needed() {
		return Math.max(1, Math.floor(chatter_count() * queue.skip_threshold))
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
	 * Adds item to the end of the queue and returns the length of the queue
	 * @param {QueueItem} item Item to be added to the queue
	 */
	Queue(item) {
		return this.list.push(item)
	}
	/**
	 * Dequeues first item in the list and returns it
	 */
	Dequeue() {
		return this.current = this.list.shift()
	}
	/**
	 * Resets the queue
	 */
	Reset() {
		this.list = []
		this.skipvotes = []
		this.skip_threshold = 0.5
	}
	Voteskip(username) {
		if (this.skipvotes.includes(username)) return
		this.skipvotes.push(username)
		if (this.skipvotes.length < this.votes_needed)
		Action(`Skip votes: ${this.skipvotes}/${votes_needed()}`)
		else {
			Action(`Skipping`)
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