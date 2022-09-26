// -------------------------------------------- //
// --------------- Quick-access --------------- //
// -------------------------------------------- //
const $cht_inp = $('#chat-input')
const $cht_snd = $('#send-message')
const $chat = $('#messages')
const $skip = $('#voteskip')
const $req_inp = $('#request-input')
const $req_snd = $('#send-request')
const $vol = $('#volume')
const $vid_title = $('#video-title')

// -------------------------------------------- //
// ----------------- WebSocket ---------------- //
// -------------------------------------------- //
const DEFAULT_COLOR = 'rgb(0, 183, 255)'
let token = (localStorage.chat_token) ? localStorage.chat_token : 'unreceived'
let username
let color = DEFAULT_COLOR

//* WS response template
class WSR {
	token = token
	username = username? username : 'undefined'
	color = color? color : ''

	constructor(content=undefined) {
		if (content == undefined) return
		Object.keys(content).forEach((k) => this[k] = content[k])
	}

	toString() {
		if (this.username == 'undefined') return
		return JSON.stringify(this)
	}
}
//* Chat handling
let ws
setInterval(() => {
	if (ws == undefined) {
		ws = new WebSocket(window.location.href.replace('https', 'wss').replace('http', 'ws'))
		ws.onopen = function(ev) {
			console.log('System: Chat WebSocket connected.')
			ws.send(JSON.stringify(new WSR()))
			$([$cht_inp[0], $cht_snd[0],]).removeAttr('disabled')
			if (username != undefined)
			$([$req_inp[0], $req_snd[0], $skip[0]]).removeAttr('disabled')
			else if (localStorage.username)
			$cht_inp.val(localStorage.username)
			$cht_inp.attr('placeholder', username == undefined? 'Set a username' : 'Type a message')
			$req_inp.attr('placeholder', username == undefined? 'Set a username first' : 'Insert a link, video ID, or search string')
			$(document.body).removeClass('disconnected')
		}
		ws.onclose = function() {
			$([$cht_inp[0], $cht_snd[0], $skip[0], $req_inp[0], $req_snd[0]])
			.attr('disabled', '')
			$cht_inp.attr('placeholder', 'Disconnected. Retrying...')
			$(document.body).addClass('disconnected')
			console.log('System: Chat WebSocket disconnected. Retrying...')
			ws = undefined
		}
		ws.onmessage = function(e) {
			const msg = JSON.parse(e.data)
			console.log(msg)

			if (msg.type == 'token') {
				console.log('System: Received and stored session token')
				token = msg.token
				return
			}
			if (msg.type == 'message')
				AddMessage(msg.username, msg.message, msg.order, msg.color)
			if (msg.type == 'history') {
				$chat.children().filter((_, e) => Array.from(e.classList).includes('innate') == false).remove()
				msg.history.forEach((m) => AddMessage(m.username, m.message, m.order, m.color))
			}
			if (msg.type == 'confirmvote')
				msg.vote? $skip.addClass('voted') : $skip.removeClass('voted')
			if (msg.type == 'video') {
				$skip.removeClass('voted')
				$vid_title.html(msg.title)
				player.cueVideoById(msg.id)
				start_time = msg.start_time
				console.log(`Player: Delayed by ${(Date.now() - msg.start_time)/1000}`)
				const playvideo = setInterval(() => {
					player.seekTo((Date.now() - msg.start_time) / 1000, true)
					player.playVideo()
					$skip.removeClass('voted')
					console.log('Trying to play bcause video arrived')
					if (player.getPlayerState() == PLAYING)
						clearInterval(playvideo)
				}, 50)
			}
			if (msg.type == 'player')
				switch (msg.order) {
					case PLAYING:
						player.playVideo()
						break
					case ENDED:
						player.pauseVideo()
				}
			// if (msg.type == 'catchup')
				// if (Math.abs(Date.now() - (msg.start_time + player.getCurrentTime()*1000)) > 300)
				// 	player.seekTo((Date.now() - start_time) / 1000, true)
		}
	}
}, 1000)

// -------------------------------------------- //
// ------------------- Setup ------------------ //
// -------------------------------------------- //
//* Event handlers
$cht_snd.on('click', SendMessage)
$cht_inp.on('keypress', (e) => {if (e.key == 'Enter') $cht_snd.trigger('click')})
$req_snd.on('click', SendRequest)
$req_inp.on('keypress', (e) => {if (e.key == 'Enter') $req_snd.trigger('click')})
$vol.on('input', function(){
	player.setVolume(+this.value)
	$vol.next().css('width', `${this.value}%`)
})
$skip.on('click', SendVoteskip)

//* Layout change listeners
let mobile_mode = window.matchMedia("(max-width: 600px)").matches
window.matchMedia("(max-width: 600px)").addEventListener('change', (e) => {
	mobile_mode = e.matches
	ScrollChat()
})

//* Player
const ENDED = 0
const PLAYING = 1
const PAUSED = 2
const BUFFERING = 3
const CUED = 5
const PlayerState = {
	0: 'ENDED',
	1: 'PLAYING',
	2: 'PAUSED',
	3: 'BUFFERING',
	5: 'CUED',
}
let player

function onYouTubeIframeAPIReady() {
	player = new YT.Player('player', {
		playerVars: {
			'autoplay': 1,
			'playsinline': 1,
			'controls': 0,
			'disablekb': 1,
			'fs': 0,
			'iv_load_policy': 3,
			'modestbranding': 1,
		},
		events: {
			'onPlayerReady ': (e) => player.playVideo(),
			'onStateChange': (e) => {
				if (!username) return
				if (e.data == CUED ||/* e.data == PLAYING || e.data == BUFFERING ||*/ e.data == ENDED) {
					ws.send(new WSR({playstate: PlayerState[e.data]}))
				}
			}
		}
	})
}

//* Player auto catch-up
let start_time
setInterval(() => {
	if (player.getPlayerState() != PLAYING) return
	if (Math.abs(Date.now() - (start_time + player.getCurrentTime()*1000)) > 300)
		player.seekTo((Date.now() - start_time) / 1000, true)
}, 1000)

// -------------------------------------------- //
// ----------------- Functions ---------------- //
// -------------------------------------------- //
function SendMessage() {
	const msg = $cht_inp.val().trim().replaceAll(/\s+/g, ' ')
	if (msg.length == 0) return
	if (!username) {
		username = msg
		localStorage.setItem('username', msg)
		$cht_inp.attr('placeholder', 'Type a message')
		$req_inp.attr('placeholder', 'Insert a link, video ID, or search string')
		$([$req_inp[0], $req_snd[0], $skip[0]]).removeAttr('disabled')
		$cht_inp.val('')
		return
	}
	if (msg == 'color=')
		color = DEFAULT_COLOR
	if (msg.slice(0, 6) == 'color=') {
		color = msg.slice(6)
		$cht_inp.val('')
		return
	}
	ws.send(new WSR({message: msg}))
	$cht_inp.val('')
}
function SendRequest() {
	const query = $req_inp.val().trim().replaceAll(/\s+/g, ' ')
	ws.send(new WSR({query: query}))
	$req_inp.val('')
}
function SendVoteskip() {
	const vote = !$skip.hasClass('voted')
	ws.send(new WSR({vote: vote}))
}
function AddMessage(user, content, order=0, color='') {
	const doScroll = Math.abs($chat[0].scrollTop) + Math.abs($chat[0].clientHeight) == $chat[0].scrollHeight
	content = content.replaceAll(/\s+/g, ' ').replaceAll('\n', '<br>').trim()
	if (user == '<<System>>')
		$chat.append(
			$('<div class="message sysmsg"></div>')
				.css('order', order)
				.append(
					$('<span></span>')
						.html(content)
				)
		)
	else
		$chat.append(
			$('<div class="message"></div>')
				.css('order', order)
				.append(
					$('<span class="username"></span>')
						.text(user+': ')
						.css('color', color)
				)
				.append(
					$('<span class="content"></span>')
						.text(content)
				)
		)
	if (doScroll) ScrollChat()
}
function ScrollChat() {
	$chat.scrollTop(mobile_mode? -$chat[0].scrollHeight : $chat[0].scrollHeight)
}