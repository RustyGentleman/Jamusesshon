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
const $prog = $('#progress')
const $q = $('#queue')
const $qtoggle = $('#queue-toggle')

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
	color = color? color : ''

	constructor(content=undefined) {
		if (content == undefined) return
		Object.keys(content).forEach((k) => this[k] = content[k])
	}

	toString() {
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
			if (username)
				ws.send(new WSR({set_username: username, set_color: color}))
			$([$cht_inp[0], $cht_snd[0],]).removeAttr('disabled')
			if (username != undefined)
				$([$req_inp[0], $req_snd[0], $skip[0], $qtoggle[0]]).removeAttr('disabled')
			else if (localStorage.username)
				$cht_inp.val(localStorage.username)
				$cht_inp.attr('placeholder', username == undefined? 'Set a username' : 'Type a message')
				$req_inp.attr('placeholder', username == undefined? 'Set a username first' : 'Insert a link, video ID, or search string')
			$(document.body).removeClass('disconnected')
		}
		ws.onclose = function() {
			$([$cht_inp[0], $cht_snd[0], $skip[0], $req_inp[0], $req_snd[0], $qtoggle[0]])
				.attr('disabled', '')
			$skip.removeClass('voted')
			$cht_inp.attr('placeholder', 'Disconnected. Retrying...')
			$(document.body).addClass('disconnected')
			console.log('System: Chat WebSocket disconnected. Retrying...')
			ws = undefined
		}
		ws.onmessage = function(e) {
			const msg = JSON.parse(e.data)
			console.log(msg)

			if (msg.type == 'token') {
				if (token != 'unreceived') return
				console.log('System: Received and stored session token')
				token = msg.token
				return
			}
			if (msg.type == 'set_username') {
				if (msg.success == false) {
					$cht_inp.attr('placeholder', 'Set a username')
					$req_inp.attr('placeholder', 'Set a username first')
					return
				}
				username = msg.username
				localStorage.setItem('username', username)
				$cht_inp.attr('placeholder', 'Type a message')
				$req_inp.attr('placeholder', 'Insert a link, video ID, or search string')
				$([$req_inp[0], $req_snd[0], $skip[0], $qtoggle[0]]).removeAttr('disabled')
			}
			if (msg.type == 'message')
				AddMessage(msg.username, msg.message, msg.order, msg.color, true)
			if (msg.type == 'history') {
				$chat.children().filter((_, e) => Array.from(e.classList).includes('innate') == false).remove()
				msg.history.forEach((m) => AddMessage(m.username, m.message, m.order, m.color, false))
			}
			if (msg.type == 'confirmvote')
				msg.vote? $skip.addClass('voted') : $skip.removeClass('voted')
			if (msg.type == 'video') {
				$vid_title.html(`<span class="media-title">${msg.title}</span><br><span class="username" style="color:${msg.requesterColor}">[${msg.requester}]</span>`)
				player.cueVideoById(msg.id)
				start_time = msg.start_time
			}
			if (msg.type == 'player') switch (msg.order) {
				case PLAYING:
					const playvideo = setInterval(() => {
						player.seekTo((Date.now() - start_time) / 1000, true)
						player.playVideo()
						if (player.getPlayerState() == PLAYING)
							clearInterval(playvideo)
					}, 100)
					break
				case ENDED:
					player.seekTo(parseInt((start_time) / 1000) + player.getDuration())
					player.pauseVideo()
					break
				case PAUSED:
					player.pauseVideo()
					break
			}
			if (msg.type == 'queue') {
				$q.html('')
				msg.queue.forEach((e, i) => {
					if (e == undefined) return
					$q.append($(`<div class="entry${i==0?' current':''}"></div>`)
						.append($(`<a href="https://www.youtube.com/watch?v=${e.id}" target="_blank"></a>`)
							.append($(`<img src="${e.thumbnail}">`))
						)
						.append($('<div class="info"></div>')
							.append($('<div class="media-info"></div>')
								.append($(`<span class="media-title">${e.title}</span>`))
								.append($('<br>'))
								.append($(`<span class="media-channel">${e.channel}</span>`))
							)
							.append(`<span class="requester">Requester: <span class="username" style="color:${e.requesterColor}">[${e.requester}]</span></span>`)
						)
					)
				})
			}
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
	localStorage.setItem('volume', +this.value)
})
$skip.on('click', SendVoteskip)
$qtoggle.on('click', () => $q.toggle())

//* Player auto catch-up
setInterval(() => {
	if (player.getPlayerState() != PLAYING) return
	if (Math.abs(Date.now() - (start_time + player.getCurrentTime()*1000)) > 300)
		player.seekTo((Date.now() - start_time+10) / 1000, true)
}, 1000)

//* Player progress tracking
setInterval(() => {
	if (player?.getPlayerState() != PLAYING) return
	const c = player.getCurrentTime()
	const d = player.getDuration()
	$prog.text(parseInt(c/60)+':'+(''+parseInt(c%60)).padStart(2, '0')+' / '+parseInt(d/60)+':'+(''+parseInt(d%60)).padStart(2, '0'))
		.css('width', `${(c/d)*100}%`)
}, 333)

//* Sounds
const ping = new Howl({src: ['ping.mp3']})
const doop = new Howl({src: ['doop.mp3']})

//* Saved settings
if (localStorage.getItem('volume')) {
	$vol.val(+localStorage.getItem('volume'))
	$vol.next().css('width', `${+localStorage.getItem('volume')}%`)
}

//* Layout change listeners
let mobile_mode = window.matchMedia("(max-width: 600px)").matches
window.matchMedia("(max-width: 750px)").addEventListener('change', (e) => {
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
			// 'onPlayerReady ': (e) => player.playVideo(),
			'onStateChange': (e) => {
				player.setVolume($vol.val())
				if (!username) return
				if (e.data == PLAYING || e.data == CUED || e.data == PAUSED || e.data == ENDED) { 
					ws.send(new WSR({player_state: e.data}))
				}
			}
		}
	})
}

// -------------------------------------------- //
// ----------------- Functions ---------------- //
// -------------------------------------------- //
function SendMessage() {
	const msg = $cht_inp.val().trim().replaceAll(/\s+/g, ' ')
	if (msg.length == 0) return
	if (username == undefined || (msg.replaceAll(' ','').slice(0, 9) == 'username=' && msg.slice(9).replaceAll(' ','').length > 0)) {
		ws.send(new WSR({set_username: msg.replace(/\s*username\s*=\s*/, '').replaceAll(' ','')}))
		$cht_inp.val('')
		return
	}
	if (msg.replaceAll(' ','').slice(0, 6) == 'color=') {
		color = msg.replace(/\s*color\s*=\s*/,'')
		ws.send(new WSR({set_color: msg.replace(/\s*color\s*=\s*/,'')}))
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
function AddMessage(user, content, order=0, color='', sound=true) {
	const doScroll = mobile_mode?
		-$chat[0].scrollTop == $chat[0].scrollHeight - $chat[0].clientHeight
		:
		$chat[0].scrollTop == $chat[0].scrollHeight - $chat[0].clientHeight
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
						.html(content)
				)
		)
	if (sound) {
		if (content.includes(`@${username}`))
			ping.play()
		else
			doop.play()
	}
	if (doScroll) $chat.scrollTop(mobile_mode? -$chat[0].scrollHeight : $chat[0].scrollHeight)
}