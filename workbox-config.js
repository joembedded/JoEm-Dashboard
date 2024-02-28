module.exports = {
	globDirectory: '.',
	globPatterns: [
		'**/*.{css,txt,ttf,woff2,html,js,webmanifest,md,ico,svg,png}'
	],
	swDest: 'sw.js',
	ignoreURLParametersMatching: [
		/^utm_/,
		/^fbclid$/
	]
};