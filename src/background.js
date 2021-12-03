var path, value, copyPathMenuEntryId, copyValueMenuEntryId;

async function getDefaultTheme() {
	return await (await fetch("jsonview.css")).text();
}

function copy(value) {
	var selElement, selRange, selection;
	selElement = document.createElement("span");
	selRange = document.createRange();
	selElement.innerText = value;
	document.body.appendChild(selElement);
	selRange.selectNodeContents(selElement);
	selection = window.getSelection();
	selection.removeAllRanges();
	selection.addRange(selRange);
	document.execCommand("Copy");
	document.body.removeChild(selElement);
}

function refreshMenuEntry() {
	var options = localStorage.options ? JSON.parse(localStorage.options) : {};
	if (options.addContextMenu && !copyPathMenuEntryId) {
		copyPathMenuEntryId = chrome.contextMenus.create({
			title: "Copy path",
			contexts: ["page", "link"],
			onclick: function (info, tab) {
				copy(path);
			}
		});
		copyValueMenuEntryId = chrome.contextMenus.create({
			title: "Copy value",
			contexts: ["page", "link"],
			onclick: function (info, tab) {
				copy(value);
			}
		});
	}
	if (!options.addContextMenu && copyPathMenuEntryId) {
		chrome.contextMenus.remove(copyPathMenuEntryId);
		chrome.contextMenus.remove(copyValueMenuEntryId);
		copyPathMenuEntryId = null;
	}
}

var options = {};
if (localStorage.options)
	options = JSON.parse(localStorage.options);
if (typeof options.addContextMenu == "undefined") {
	options.addContextMenu = true;
	localStorage.options = JSON.stringify(options);
}

if (!localStorage.theme)
	getDefaultTheme().then(theme => {
		localStorage.theme = theme;
		refreshMenuEntry();
	});
else
	refreshMenuEntry();

chrome.runtime.onConnect.addListener(function (port) {
	port.onMessage.addListener(function (msg) {
		var workerFormatter, workerJSONLint, json = msg.json;

		function onWorkerJSONLintMessage(event) {
			var message = JSON.parse(event.data);
			workerJSONLint.removeEventListener("message", onWorkerJSONLintMessage, false);
			workerJSONLint.terminate();
			port.postMessage({
				ongetError: true,
				error: message.error,
				loc: message.loc,
				offset: msg.offset
			});
		}

		function onWorkerFormatterMessage(event) {
			var message = event.data;
			workerFormatter.removeEventListener("message", onWorkerFormatterMessage, false);
			workerFormatter.terminate();
			if (message.html)
				port.postMessage({
					onjsonToHTML: true,
					html: message.html,
					theme: localStorage.theme
				});
			if (message.error) {
				workerJSONLint = new Worker("workerJSONLint.js");
				workerJSONLint.addEventListener("message", onWorkerJSONLintMessage, false);
				workerJSONLint.postMessage(json);
			}
		}

		if (msg.init)
			port.postMessage({
				oninit: true,
				options: localStorage.options ? JSON.parse(localStorage.options) : {}
			});
		if (msg.copyPropertyPath) {
			path = msg.path;
			value = msg.value;
		}
		if (msg.jsonToHTML) {
			workerFormatter = new Worker("workerFormatter.js");
			workerFormatter.addEventListener("message", onWorkerFormatterMessage, false);
			workerFormatter.postMessage({
				json: json,
				fnName: msg.fnName
			});
		}
	});
});
chrome.runtime.onMessage.addListener(message => {
	if (message == "refreshMenuEntry")
		refreshMenuEntry();
});