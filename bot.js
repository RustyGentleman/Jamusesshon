//* Imports

const fetch = require('node-fetch')
const tmi = require('tmi.js')
const http = require('http')
const fs = require('fs')
const path = require('path')

const host = 'localhost'
const port = 8000

//* Server stuff

const server = http.createServer((req, res) => {
	console.log('\u001b[1;31mSRV\u001b[5m:\u001b[0m Request for ' + req.url + ' by method ' + req.method)
	if (req.method == 'GET') {
		 let fileUrl
		 if (req.url == '/') fileUrl = '/index.html'
		 else fileUrl = req.url

		 let filePath = path.resolve('.' + fileUrl)
		 const fileExt = path.extname(filePath)
		 if (fileExt == '.html') {
			  fs.exists(filePath, (exists) => {
					if (!exists) {
						 filePath = path.resolve('./404.html')
						 res.statusCode = 404
						 res.setHeader('Content-Type', 'text/html')
						 fs.createReadStream(filePath).pipe(res)
						 return
					}
					res.statusCode = 200
					res.setHeader('Content-Type', 'text/html')
					fs.createReadStream(filePath).pipe(res)
			  })
		 }
		 else if (fileExt == '.css') {
			  res.statusCode = 200
			  res.setHeader('Content-Type', 'text/css')
			  fs.createReadStream(filePath).pipe(res)
		 }
		 else {
			  filePath = path.resolve('./404.html')
			  res.statusCode = 404
			  res.setHeader('Content-Type', 'text/html')
			  fs.createReadStream(filePath).pipe(res)
		 }
	}
	else {
		 filePath = path.resolve('./public/404.html')
		 res.statusCode = 404
		 res.setHeader('Content-Type', 'text/html')
		 fs.createReadStream(filePath).pipe(res)
	}
})
server.listen(port, host, () => {
	console.log(`\u001b[1;31mSRV\u001b[5m:\u001b[0m running at http://${host}:${port}/`)
})

//* Constants

const TOKEN = 'oauth:itr6kpsm79utizopb23o2xqo9xsf5t'
const CHAN = '#rogue_v'
const YT_API_KEY = 'AIzaSyBonYTnI1BofAwrIKjuZFfzTgcChnstV38'

const client = new tmi.Client({
	connection: {
		secure: true,
		reconnect: true
	},
	identity: {
		username: 'HuskTendril',
		password: TOKEN
	 },
	channels: [ 'Rogue_V' ]
})
client.connect()

//* Queue class

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
	constructor() {
		this.list = []
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
		return this.list.shift()
	}
}
const queue = new Queue()

//* Code starts here

let chatter_count = 0
let skip_votes = 0
let skip_threshold = 0.5
const votes_needed = () => Math.max(1, Math.floor(chatter_count * skip_threshold))

console.log(`\u001b[1;32mTWT\u001b[5m:\u001b[0m Bot ${'HuskTendril'} active`)
UpdateChatterCount()
setInterval(UpdateChatterCount, 60000)

client.on('message', async (channel, tags, message, self) => {
	const user = tags['display-name']
	console.log(`\u001b[1;32mTWT\u001b[5m:\u001b[0m \u001b[1;35m${user}\u001b[5m:\u001b[0m ${message}`)
	client.color('SpringGreen')

	if(message.toLowerCase() === '#test')
	Action('I am alive')
	if(message.toLowerCase() === '!voteskip') {
		if (++skip_votes < votes_needed())
			Action(`Skip votes: ${skip_votes}/${votes_needed()}`)
		else {
			Action(`Skipping`)
			Skip()
		}
	}
	if(message.toLowerCase() === '#skip')
		Skip()
	if(message.toLowerCase().slice(0, 10) === '#threshold')
		Action(`Threshold: ${(skip_threshold = +message.match(/\d*\.?\d/)[0])*100}% (${votes_needed()})`)
	if(message.toLowerCase().slice(0, 6) === '!queue') {
		const result = await SearchYouTube(message.slice(6).trim())
		queue.Queue(new QueueItem(user, result.title, result.id))
		Action(`Added >>${result.title}<< to the queue`)
	}
})

function Say(msg='') {
	client.say(CHAN, `► ${msg}`)
}
function Action(msg='') {
	client.action(CHAN, `► ${msg}`)
}
function UpdateChatterCount() {
	let chatters
	fetch(`https://tmi.twitch.tv/group/user/${CHAN.slice(1)}/chatters`)
	.then(response => response.json()
		.then(r => chatters = r.chatter_count)
	)
	.finally(() => {
		if (chatters != chatter_count)
			console.log(`\u001b[33m${chatters} chatters present\u001b[0m`)
		chatter_count = chatters
	})
}
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