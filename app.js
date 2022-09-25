// -------------------------------------------- //
// --------------- Quick-access --------------- //
// -------------------------------------------- //
const $cht_inp = $('#chat-input')
const $cht_snd = $('#send-message')
const $chat = $('#messages')
const $skip = $('#voteskip')
const $req_inp = $('#request-input')
const $req_snd = $('#send-request')

// -------------------------------------------- //
// ----------------- WebSocket ---------------- //
// -------------------------------------------- //
let token = (localStorage.chat_token) ? localStorage.chat_token : 'unreceived'
let username
let color

//* WS response template
class WSR {
	token = token
	username = username? username : 'undefined'
	color = color? color : ''
	content

	/**
	 * WebSocket server response template
	 * @param {string} type 
	 * @param {object} content 
	 */
	constructor(content = '') {
		this.content = content
	}

	get string() {return JSON.stringify(this)}
}
//* Chat handling
let ws
setInterval(() => {
	if (ws == undefined) {
		ws = new WebSocket('ws://localhost:8000/')
		ws.onopen = function(ev) {
			console.log('System: Chat WebSocket connected.')
			ws.send(new WSR().string)
			$([$cht_inp[0], $cht_snd[0], $skip[0], $req_inp[0], $req_snd[0]])
				.removeAttr('disabled')
			$cht_inp.attr('placeholder', username == undefined? 'Set a username' : 'Type a message')
			$req_inp.attr('placeholder', username == undefined? 'Set a username first' : 'Insert a link, video ID, or search string')
			$(document.body).removeClass('disconnected')
		}
		ws.onclose = function() {
			$cht_snd.attr('disabled', '')
			$cht_inp.attr('disabled', '')
				.attr('placeholder', 'Disconnected. Retrying...')
			$(document.body).addClass('disconnected')
			console.log('System: Chat WebSocket disconnected. Retrying...')
			ws = undefined
		}
		ws.onmessage = function(e) {
			const msg = JSON.parse(e.data)
			console.log('System: Received:')
			console.log(msg)
			if (msg.type == 'token') {
				console.log('System: Received and stored session token')
				token = msg.token
				return
			}
			if (msg.type == 'message')
				AddMessage(msg.username, msg.content, msg.order, msg.color)
			if (msg.type == 'history') {
				$chat.children().filter((_, e) => Array.from(e.classList).includes('innate') == false).remove()
				msg.history.forEach((m) => AddMessage(m.username, m.content, m.order, m.color))
			}
		}
	}
}, 1000)

// -------------------------------------------- //
// ------------------- Setup ------------------ //
// -------------------------------------------- //
$cht_snd.on('click', SendMessage)
$cht_inp.on('keypress', (e) => {if (e.key == 'Enter') $cht_snd.trigger('click')})

let mobile_mode = window.matchMedia("(max-width: 600px)").matches
window.matchMedia("(max-width: 600px)").addEventListener('change', (e) => {
	mobile_mode = e.matches
	ScrollChat()
})

// -------------------------------------------- //
// ----------------- Functions ---------------- //
// -------------------------------------------- //
function SendMessage() {
	const msg = $cht_inp.val().trim().replaceAll(/\s+/g, ' ')
	if (msg.length == 0) return
	if (!username) {
		username = msg
		$cht_inp.attr('placeholder', 'Type a message')
		$req_inp.attr('placeholder', 'Insert a link, video ID, or search string')
		$cht_inp.val('')
		return
	}
	if (msg.slice(0, 6) == 'color=') {
		color = msg.slice(6)
		$cht_inp.val('')
		return
	}
	ws.send(new WSR(msg).string)
	$cht_inp.val('')
}
function AddMessage(user='<<System>>', content='', order=0, color='') {
	const doScroll = Math.abs($chat[0].scrollTop) + Math.abs($chat[0].clientHeight) == $chat[0].scrollHeight
	if (user == '<<System>>')
		$chat.append(
			$('<div class="message sysmsg"></div>')
				.css('order', order)
				.append(
					$('<span></span>')
						.text(content)
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