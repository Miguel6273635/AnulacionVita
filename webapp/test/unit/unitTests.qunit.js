/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"z/anulacion/anulacion/test/unit/AllTests"
	], function () {
		QUnit.start();
	});
});
