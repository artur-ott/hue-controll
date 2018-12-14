#!/usr/local/bin/node

const http = require('http'),
	https = require('https'),
	urlParser = require('url'),
	fs = require('fs'),
	WebSocketServer = require('websocket').server,
	isEqualArray = (a1, a2) => {
		if (!a1.length || a1.length !== a2.length) return false;
		return a1.map(el1 => a2.findIndex(el2 => JSON.stringify(el2) === JSON.stringify(el1))).filter(el => el >= 0).length > 0;
	},
	promiseOrCallback = (promise, cb) => {
		var promiseResult = promise;

    if (cb && typeof cb === "function") {
				function resolveValue(value) {
						if (cb) {
							cb(null, value);
						}
				}
		
				function resolveError(err) {
						if (cb) {
							cb(err, null);
						}
				}
		
				promise.then(resolveValue).catch(resolveError);
        // Do not return the promise, as the callbacks will have forced it to resolve
        promiseResult = null;
    }

    return promiseResult;
	},
	callUrl = (url) => {
		return new Promise(
			function (resolve, reject) {
				http.get(`http://${bridge.internalipaddress}/api/${username}/${url}`, (res) => {
					res.setEncoding('utf8');
					let rawData = '';
					res.on('data', (chunk) => { rawData += chunk; });
					res.on('end', () => {
						try {
							resolve(JSON.parse(rawData));
						} catch (e) {
							reject(new Error(`Could not convert to JSON: ${rawData}`));
						}
					});
				}).on('error', (e) => {
					reject(new Error(`Could not get the call for ${url}!`));
				});
			}
		);
	},
	putBodyUrl = (url, data) => {
		return new Promise(
			function (resolve, reject) {
				const parsedUrl = urlParser.parse(`http://${bridge.internalipaddress}/api/${username}/`);
				const options = {
					hostname: parsedUrl.host,
					path: parsedUrl.pathname + url,
					method: 'PUT',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'Content-Length': Buffer.byteLength(JSON.stringify(data))
					}
				};
				
				const req = http.request(options, (res) => {
					res.setEncoding('utf8');
					let rawData = '';
					res.on('data', (chunk) => { rawData += chunk; });
					res.on('end', () => {
						try {
							resolve(JSON.parse(rawData));
						} catch (e) {
							reject(new Error(`Could not convert to JSON: ${rawData}`));
						}
					});
				});
				
				req.on('error', (e) => {
					reject(new Error(`Could not put the request for ${url}!`));
				});
				
				// write data to request body
				req.write(JSON.stringify(data));
				req.end();
			}
		);
	},
	getBridges = (cb) => {
		return promiseOrCallback(new Promise(
			function (resolve, reject) {
				https.get('https://discovery.meethue.com/', (res) => {
					res.setEncoding('utf8');
					let rawData = '';
					res.on('data', (chunk) => { rawData += chunk; });
					res.on('end', () => {
						try {
							resolve(JSON.parse(rawData));
						} catch (e) {
							reject(new Error(`Could not convert to JSON: ${rawData}`));
						}
					});
				}).on('error', (e) => {
					reject(new Error(`Could not descover bridges!`));
				});
			}
		), cb)
	},
	location = require('location.js').init(http, connection);

const getLightState = (id, cb) => {
	return promiseOrCallback(callUrl(`lights/${id}`), cb);
},
getConfig = (cb) => {
	return promiseOrCallback(callUrl(''), cb);
},
changeState = (id, state, cb) => {
	return promiseOrCallback(putBodyUrl(`lights/${id}/state`,state), cb);
};

let connection = null,
	bridges = [],
	bridge = null,
	username = 'idLi8rS9pQM7-TiLhCvlJH0rkJWcUoY0cKC-jOc1',
	openWeatherKey = '09c1e35c3145d7d015d54f792199f071',
	currentState = {};
	
fs.readFile('index.html', 'utf8', function(err, contents) {
  let server = http.createServer(function (req, res) {
	  res.write(contents); //write a response to the client
	  res.end(); //end the response
	}).listen(80);
	
	let wsServer = new WebSocketServer({
	  httpServer: server
	});
	wsServer.on('request', function(request) {
	  connection = request.accept(null, request.origin);
		console.log('Connected!');
		bridges = [];

	  // This is the most important callback for us, we'll handle
	  // all messages from users here.
	  connection.on('message', function(message) {
			if (message.type === 'utf8') {
				parseData(JSON.parse(message.utf8Data));
			}
	  });

	  connection.on('close', function(connection) {
			console.log('Connection closed!');
	  });
	});
});

function parseData(data) {
	if (data.key === undefined) return; // ping
	console.log(data);
	switch (data.key) {
		case 'discover':
			discover();
		break;
		case 'bridge':
			bridgeSelected(data.data);
		break;
		case 'username':
			usernameChanged(data.data);
		break;
		case 'light-state':
			lightState(data.data);
		break;
		case 'light-state-on':
			lightStateOn(data.data);
		break;
		case 'light-state-brightness':
			lightStateBrightness(data.data);
		break;
		case 'light-state-hue':
			lightStateHue(data.data);
		break;
		case 'light-state-sat':
			lightStateSat(data.data);
		break;
		case 'light-state-shuffle':
			lightStateShuffle(data.data);
		break;
		default:
			console.error(`No command "${data.key}" found!`);
	}
}

function discover() {
	getBridges((err, foundBridge) => {
		if (err || isEqualArray(foundBridge, bridges)) return;
		bridges = foundBridge;
		bridge = null;
		currentState = {};

		connection.sendUTF(JSON.stringify({
			key: "discover",
			data: bridges
		}));
	});
}

function usernameChanged(userName) {
	username = userName;
}

function bridgeSelected(id) {
	let bridgeIndex = bridges.findIndex(bridge => bridge.id === id);
	if (bridgeIndex === -1 && username.length <= 0) return;
	let oldBridge = bridge;
	bridge = bridges[bridgeIndex];
	getConfig((err, config) => {
		if (err) {
			bridge = oldBridge;
			return;
		}
		connection.sendUTF(JSON.stringify({
			key: "config",
			data: config
		}));
		connection.sendUTF(JSON.stringify({
			key: "lights",
			data: config.lights
		}));
	});
}

function _initLightState(id, state) {
	let lightState = {
		on: state.on,
		bri: state.bri,
		effect: state.effect,
		location: ''
	};
	currentState[id] = lightState;
}

function lightState(id) {
	getLightState(id, (err, state) => {
		if (err) return;
		_initLightState(id, state.state);
		connection.sendUTF(JSON.stringify({
			key: "light-state",
			data: Object.assign({ id }, state)
		}));
	});
}

function lightStateOn(data) {
	currentState[data.id].on = data.value;
	changeState(data.id, {
		on: data.value
	}, () => {});
}

function lightStateBrightness(data) {
	if (!currentState[data.id].on) return;
	currentState[data.id].bri = data.value;
	changeState(data.id, {
		bri: parseInt(data.value)
	}, () => {});
}

function lightStateHue(data) {
	if (!currentState[data.id].on) return;
	changeState(data.id, {
		hue: parseInt(data.value)
	}, () => {});
}

function lightStateSat(data) {
	if (!currentState[data.id].on) return;
	changeState(data.id, {
		sat: parseInt(data.value)
	}, () => {});
}

function lightStateSat(data) {
	if (!currentState[data.id].on) return;
	changeState(data.id, {
		sat: parseInt(data.value)
	}, () => {});
}

function lightStateShuffle(data) {
	if (!currentState[data].on) return;
	currentState[data].effect = currentState[data].effect !== 'none' ? 'none':'colorloop';
	changeState(data, {
		effect: currentState[data].effect
	}, () => {});
}
