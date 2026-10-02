/*global QUnit*/

sap.ui.define([
	"z/anulacion/anulacion/controller/Main.controller"
], function (Controller) {
	"use strict";

	QUnit.module("Main Controller");

	QUnit.test("crea el controlador principal", function (assert) {
		var oAppController = new Controller();
		assert.ok(oAppController);
	});

	QUnit.test("conserva cada línea de ToItems como selección independiente", function (assert) {
		var oController = new Controller();
		var oPayload = {
			d: {
				results: [{
					MatDoc: "5000560347",
					Status: "S",
					Message: "Vista previa de anulación",
					HuCount: 1,
					ItemCount: 4,
					ToItems: {
						results: [{
							MatDoc: "5000560347",
							SeqNo: 1,
							HuVenum: "0001523136",
							HuExidv: "00000000000606060600",
							Lifnr: "0050000713",
							Name1: "SOCIEDAD AGRÍCOLA LADERAS DEL VALLE",
							Ebeln: "4700090573",
							GrMatDoc: "5000560347",
							GrYear: "2026",
							SoVbeln: "0060105665",
							DelivVbeln: "0084102930",
							Charg: "0000219167",
							Menge: "394.000",
							Meins: "KG",
							Matnr: "000000000014000231",
							Maktx: "HARINA DE TRIGO PARA PRODUCCIÓN"
						}, {
							MatDoc: "5000560347",
							SeqNo: 2,
							HuVenum: "0001523136",
							HuExidv: "00000000000606060600",
							Lifnr: "0050000713",
							Name1: "SOCIEDAD AGRÍCOLA LADERAS DEL VALLE",
							Ebeln: "4700090575",
							GrMatDoc: "5000560345",
							GrYear: "2026",
							SoVbeln: "0060105663",
							DelivVbeln: "0084102928",
							Charg: "0000219169",
							Menge: "90.500",
							Meins: "KG",
							Matnr: "000000000014000231",
							Maktx: "HARINA DE TRIGO PARA PRODUCCIÓN"
						}, {
							MatDoc: "5000560347",
							SeqNo: 3,
							HuVenum: "0001523136",
							HuExidv: "00000000000606060600",
							Lifnr: "",
							Name1: "",
							Ebeln: "",
							GrMatDoc: "",
							GrYear: "0000",
							Matnr: "000000000024000061",
							Charg: "VITAFOODS",
							Menge: "250.000",
							Meins: "UN",
							Maktx: "MCO BANDEJA PLASTICA COSECH 50X30 AZUL"
						}, {
							MatDoc: "5000560347",
							SeqNo: 4,
							HuVenum: "0001523136",
							HuExidv: "00000000000606060600",
							Lifnr: "",
							Name1: "",
							Ebeln: "",
							GrMatDoc: "",
							GrYear: "0000",
							Matnr: "000000000024000078",
							Charg: "VITAFOODS",
							Menge: "1.000",
							Meins: "UN",
							Maktx: "MCO PALLET 1X1,20 M.PRIMA"
						}]
					}
				}]
			}
		};
		var oHeader = oController._getDeepPreviewHeader(oPayload);
		var aItems = oController._getDeepPreviewItems(oHeader);
		var aRows = oController._buildPreviewRows(
			oController._mapDeepPreviewItems(oHeader, aItems)
		);
		var oHuRow = aRows.filter(function (oRow) {
			return oController._isHU(oRow);
		})[0];
		var aOptions = oHuRow.providerOptions;

		assert.strictEqual(aRows.length, 9, "reconstruye toda la cadena documental y la HU");
		assert.strictEqual(aOptions.length, 2, "mantiene dos líneas seleccionables");
		assert.strictEqual(aOptions[0].GrMatDoc, "5000560347", "muestra el primer documento material");
		assert.strictEqual(aOptions[1].GrMatDoc, "5000560345", "muestra el segundo documento material");
		assert.strictEqual(aOptions[0].DisplayMatnr, "0014000231", "prepara el material con los últimos diez dígitos");
		assert.strictEqual(aOptions[0].Maktx, "HARINA DE TRIGO PARA PRODUCCIÓN", "conserva el nombre del material");
		assert.strictEqual(oHuRow.huMaterialDetails.length, 2, "conserva materiales de la HU aunque no tengan pedido");
		assert.strictEqual(oHuRow.huMaterialDetails[0].Maktx, "MCO BANDEJA PLASTICA COSECH 50X30 AZUL", "conserva la bandeja");
		assert.strictEqual(oHuRow.huMaterialDetails[0].Menge, "250.000", "conserva la cantidad de bandejas");
		assert.strictEqual(oHuRow.huMaterialDetails[1].Maktx, "MCO PALLET 1X1,20 M.PRIMA", "conserva el pallet");
		assert.strictEqual(oHuRow.huMaterialDetails[1].Menge, "1.000", "conserva la cantidad de pallets");
		assert.notStrictEqual(aOptions[0].providerKey, aOptions[1].providerKey, "SeqNo evita que las líneas se fusionen");
	});

	QUnit.test("prepara el flujo visual de pedido y material", function (assert) {
		var oController = new Controller();
		var oHuRow = {
			Message: "HU",
			HuSelected: true,
			selectedProviders: [{ providerKey: "OPCION_1" }],
			providerOptions: [{
				providerKey: "OPCION_1",
				Ebeln: "4700090573",
				MaterialExpanded: true,
				itemDetails: [{
					Matnr: "000000000014000231",
					Maktx: "HARINA DE TRIGO PARA PRODUCCIÓN",
					Menge: "394.000",
					Meins: "KG",
					Charg: "0000219167"
				}]
			}]
		};
		var aFlowOptions = oController._buildHuFlowOptions(
			oHuRow,
			"/preview/4"
		);

		assert.strictEqual(aFlowOptions.length, 1, "crea un pedido dentro de la HU");
		assert.ok(aFlowOptions[0].selected, "refleja el pedido seleccionado");
		assert.ok(aFlowOptions[0].MaterialExpanded, "conserva desplegada la tabla de materiales");
		assert.strictEqual(aFlowOptions[0].MaterialDetails[0].Matnr, "000000000014000231", "muestra el material");
		assert.strictEqual(aFlowOptions[0].MaterialDetails[0].DisplayMatnr, "0014000231", "muestra solo los últimos diez dígitos");
		assert.strictEqual(aFlowOptions[0].MaterialDetails[0].Maktx, "HARINA DE TRIGO PARA PRODUCCIÓN", "muestra el nombre del material");
		assert.strictEqual(aFlowOptions[0].MaterialDetails[0].Menge, "394.000", "muestra la cantidad");
	});

	QUnit.test("permite mantener varias HU seleccionadas", function (assert) {
		var oController = new Controller();
		var aRows = [{
			Message: "HU",
			HuVenum: "0001523136",
			HuSelected: false,
			providerOptions: [{
				providerKey: "PEDIDO_1",
				selected: false
			}, {
				providerKey: "PEDIDO_2",
				selected: false
			}],
			selectedProviders: []
		}, {
			Message: "HU",
			HuVenum: "0001523250",
			HuSelected: false,
			providerOptions: [{
				providerKey: "PEDIDO_3",
				selected: false
			}],
			selectedProviders: []
		}];

		oController._updateHuSelection(aRows, "/preview/0", true);
		oController._updateHuSelection(aRows, "/preview/1", true);

		assert.ok(aRows[0].HuSelected, "conserva seleccionada la primera HU");
		assert.ok(aRows[1].HuSelected, "permite seleccionar también la segunda HU");
		assert.strictEqual(aRows[0].selectedProviders.length, 2, "selecciona todos los pedidos de la primera HU");
		assert.ok(aRows[0].providerOptions.every(function (oOrder) {
			return oOrder.selected;
		}), "marca visualmente todos los pedidos de la primera HU");
		assert.strictEqual(aRows[1].selectedProviders.length, 1, "selecciona todos los pedidos de la segunda HU");

		oController._updateHuSelection(aRows, "/preview/0", false);

		assert.notOk(aRows[0].HuSelected, "permite desactivar la HU de forma independiente");
		assert.strictEqual(aRows[0].selectedProviders.length, 0, "limpia los pedidos al desactivar la HU");
		assert.ok(aRows[1].HuSelected, "conserva seleccionada la segunda HU");
		assert.strictEqual(aRows[1].selectedProviders.length, 1, "no altera los pedidos de otra HU");
	});

	QUnit.test("prepara una solicitud independiente por cada HU", function (assert) {
		var oController = new Controller();
		var aSelections = [{
			HuVenum: "0001523136",
			HuExidv: "00000000000606060600",
			Lifnr: "0050000713",
			Ebeln: "4700090573"
		}, {
			HuVenum: "0001523136",
			HuExidv: "00000000000606060600",
			Lifnr: "0050000713",
			Ebeln: "4700090575"
		}, {
			HuVenum: "0001523250",
			HuExidv: "00000000000606060700",
			Lifnr: "0050001293",
			Ebeln: "4700090601"
		}];
		var aGroups = oController._groupHuSelections(aSelections);
		var oFirstPayload = oController._buildAnulacionPayload(
			"5000560389",
			aGroups[0].selections
		);
		var oSecondPayload = oController._buildAnulacionPayload(
			"5000560389",
			aGroups[1].selections
		);

		assert.strictEqual(aGroups.length, 2, "crea dos grupos para dos HU");
		assert.strictEqual(aGroups[0].selections.length, 2, "conserva los dos pedidos de la primera HU");
		assert.strictEqual(aGroups[1].selections.length, 1, "conserva el pedido de la segunda HU");
		assert.deepEqual(oFirstPayload, {
			MatDoc: "5000560389",
			HuVenum: "0001523136",
			HuExidv: "00000000000606060600",
			ProveedoresSel: "0050000713;0050000713",
			EbelnSel: "4700090573;4700090575",
			EbelnsSel: "4700090573;4700090575"
		}, "arma el payload de la primera HU sin mezclar la segunda");
		assert.deepEqual(oSecondPayload, {
			MatDoc: "5000560389",
			HuVenum: "0001523250",
			HuExidv: "00000000000606060700",
			ProveedoresSel: "0050001293",
			EbelnSel: "4700090601",
			EbelnsSel: "4700090601"
		}, "arma el payload independiente de la segunda HU");
	});

	QUnit.test("omite completamente los identificadores HU en selección total", function (assert) {
		var oController = new Controller();
		var oPayload = oController._buildAnulacionPayload(
			"5000560953",
			[{
				HuVenum: "0001525714",
				HuExidv: "00000000000707100150",
				Lifnr: "0050000722",
				Ebeln: "4700090938"
			}, {
				HuVenum: "0001525715",
				HuExidv: "00000000000707100151",
				Lifnr: "0050000722",
				Ebeln: "4700090938"
			}],
			true
		);

		assert.notOk(Object.prototype.hasOwnProperty.call(oPayload, "HuVenum"), "no envía HuVenum");
		assert.notOk(Object.prototype.hasOwnProperty.call(oPayload, "HuExidv"), "no envía HuExidv");
		assert.deepEqual(oPayload, {
			MatDoc: "5000560953",
			ProveedoresSel: "0050000722",
			EbelnSel: "4700090938",
			EbelnsSel: "4700090938"
		}, "conserva solamente una vez cada proveedor/pedido en el POST global");
	});

	QUnit.test("localiza una HU viva aunque SAP cambie los ceros de sus identificadores", function (assert) {
		var oController = new Controller();
		var oLiveRow = oController._findLiveHuRow({
			HuVenum: "0001525714",
			HuExidv: "00000000000707100150"
		}, [{
			Message: "HU",
			HuVenum: "1525714",
			HuExidv: "707100150"
		}]);

		assert.ok(oLiveRow, "encuentra la HU por su valor normalizado");
		assert.strictEqual(oLiveRow.HuVenum, "1525714", "usa el registro actualizado");
	});

	QUnit.test("selecciona todas las HU y sus pedidos", function (assert) {
		var oController = new Controller();
		var aRows = [{
			Message: "HU",
			HuSelected: false,
			providerOptions: [{
				providerKey: "PEDIDO_1",
				selected: false
			}],
			selectedProviders: []
		}, {
			Message: "Pedido de compra"
		}, {
			Message: "HU",
			HuSelected: false,
			providerOptions: [{
				providerKey: "PEDIDO_2",
				selected: false
			}, {
				providerKey: "PEDIDO_3",
				selected: false
			}],
			selectedProviders: []
		}];

		var iSelectedHu = oController._selectAllHuRows(aRows);

		assert.strictEqual(iSelectedHu, 2, "selecciona solamente las filas HU");
		assert.ok(aRows[0].HuSelected, "selecciona la primera HU");
		assert.ok(aRows[2].HuSelected, "selecciona la segunda HU");
		assert.strictEqual(aRows[0].selectedProviders.length, 1, "incluye el pedido de la primera HU");
		assert.strictEqual(aRows[2].selectedProviders.length, 2, "incluye todos los pedidos de la segunda HU");
	});

	QUnit.test("procesa las HU en secuencia y detiene las pendientes al primer error", function (assert) {
		var fnDone = assert.async();
		var oController = new Controller();
		var aEvents = [];
		var aSelections = [{
			HuVenum: "HU-1",
			HuExidv: "EX-1"
		}, {
			HuVenum: "HU-2",
			HuExidv: "EX-2"
		}, {
			HuVenum: "HU-3",
			HuExidv: "EX-3"
		}];

		oController.getVM = function () {
			return {
				setProperty: function () {}
			};
		};
		oController._refreshPreviewAfterCancellation = function (sMatDoc, fnComplete) {
			aEvents.push("refresh");
			fnComplete(true, { preview: [{}] });
		};
		oController._findLiveHuRow = function () {
			return {};
		};
		oController._getLiveHuSelections = function (oGroup) {
			return oGroup.selections;
		};
		oController._waitForSapRelease = function (fnContinue) {
			aEvents.push("espera");
			fnContinue();
		};
		oController._postAnulacion = function (sMatDoc, aGroup, oOptions) {
			var sHu = aGroup[0].HuVenum;
			aEvents.push("post:" + sHu);
			oOptions.onComplete({
				success: sHu === "HU-1",
				data: {
					Status: sHu === "HU-1" ? "S" : "E"
				},
				error: sHu === "HU-1"
					? null
					: { message: "Entrega bloqueada" }
			});
		};
		oController._finalizeMultipleAnulaciones = function (sMatDoc, aResults) {
			aEvents.push("finaliza");
			assert.deepEqual(aEvents, [
				"refresh",
				"post:HU-1",
				"espera",
				"refresh",
				"post:HU-2",
				"finaliza"
			], "refresca antes de cada POST, espera entre éxitos y no dispara la tercera HU");
			assert.strictEqual(aResults.length, 3, "conserva el resultado de todas las HU");
			assert.ok(aResults[2].skipped, "marca la tercera HU como no enviada");
			fnDone();
		};

		oController._postMultipleAnulaciones(
			"5000560951",
			aSelections
		);
	});

	QUnit.test("continúa cuando una HU ya no existe en el preview actualizado", function (assert) {
		var fnDone = assert.async();
		var oController = new Controller();
		var aEvents = [];
		var iRefresh = 0;
		var aSelections = [{
			HuVenum: "HU-1",
			HuExidv: "EX-1"
		}, {
			HuVenum: "HU-2",
			HuExidv: "EX-2"
		}];

		oController.getVM = function () {
			return {
				setProperty: function () {}
			};
		};
		oController._refreshPreviewAfterCancellation = function (sMatDoc, fnComplete) {
			iRefresh++;
			aEvents.push("refresh:" + iRefresh);
			fnComplete(true, { preview: [{ refresh: iRefresh }] });
		};
		oController._findLiveHuRow = function (oGroup, aPreview) {
			return aPreview[0].refresh === 1 ? null : {};
		};
		oController._getLiveHuSelections = function (oGroup) {
			return oGroup.selections;
		};
		oController._postAnulacion = function (sMatDoc, aGroup, oOptions) {
			aEvents.push("post:" + aGroup[0].HuVenum);
			oOptions.onComplete({
				success: false,
				data: { Status: "E" },
				error: { message: "Error controlado" }
			});
		};
		oController._finalizeMultipleAnulaciones = function (sMatDoc, aResults) {
			aEvents.push("finaliza");
			assert.deepEqual(aEvents, [
				"refresh:1",
				"refresh:2",
				"post:HU-2",
				"finaliza"
			], "omite la HU ausente y reconstruye la siguiente antes de enviarla");
			assert.ok(aResults[0].alreadyRemoved, "registra la primera HU como ya anulada");
			assert.strictEqual(aResults.length, 2, "conserva un resultado por cada intención original");
			fnDone();
		};

		oController._postMultipleAnulaciones(
			"5000560951",
			aSelections
		);
	});

	QUnit.test("detalla cuales HU se anularon y cuales fallaron", function (assert) {
		var oController = new Controller();
		var oSuccessResult = {
			success: true,
			group: {
				HuVenum: "0001523136",
				HuExidv: "00000000000606060600",
				selections: [{ Ebeln: "4700090573" }]
			}
		};
		var oErrorResult = {
			success: false,
			error: { message: "La HU ya fue anulada." },
			group: {
				HuVenum: "0001523250",
				HuExidv: "00000000000606060700",
				selections: [{ Ebeln: "4700090601" }]
			}
		};
		var sMessage = oController._buildMultipleAnulacionResultMessage(
			"1 de 2 HU se anularon correctamente.",
			[oSuccessResult],
			[oErrorResult]
		);

		assert.ok(sMessage.includes("HU anulada:"), "separa las HU anuladas");
		assert.ok(sMessage.includes("00000000000606060600"), "muestra el identificador anulado");
		assert.ok(sMessage.includes("0001523136"), "muestra el número interno anulado");
		assert.ok(sMessage.includes("4700090573"), "muestra el pedido anulado");
		assert.ok(sMessage.includes("HU no anulada:"), "separa las HU que fallaron");
		assert.ok(sMessage.includes("La HU ya fue anulada."), "muestra el motivo devuelto por SAP");
	});

	QUnit.test("conserva todas las HU anuladas en el resumen", function (assert) {
		var oController = new Controller();
		var oSummary = oController._buildCancellationSummary(
			"5000560389",
			[{
				HuVenum: "0001523136",
				HuExidv: "00000000000606060600"
			}, {
				HuVenum: "0001523250",
				HuExidv: "00000000000606060700"
			}],
			"RUN-1 | RUN-2"
		);

		assert.strictEqual(oSummary.huVenum, "0001523136 | 0001523250", "muestra ambos números internos");
		assert.strictEqual(oSummary.huExidv, "00000000000606060600 | 00000000000606060700", "muestra ambos identificadores");
	});

	QUnit.test("muestra solo HU y prepara sus niveles desplegables", function (assert) {
		var oController = new Controller();
		var aRows = [{
			Message: "Documento del material",
			MatDoc: "5000560347",
			DisplayStatusText: "Encontrado",
			DisplayStatusState: "Success"
		}, {
			Message: "HU",
			HuVenum: "0001523136",
			HuExidv: "00000000000606060600",
			HuSelected: false,
			DisplayStatusText: "Disponible",
			DisplayStatusState: "Information",
			providerOptions: [{
				providerKey: "OPCION_1",
				Ebeln: "4700090573",
				itemDetails: [{
					Matnr: "000000000014000231",
					Maktx: "HARINA DE TRIGO PARA PRODUCCIÓN"
				}]
			}],
			selectedProviders: []
		}];
		var aDisplayRows = oController._buildPreviewDisplayRows(
			aRows,
			{ HU: true }
		);

		assert.strictEqual(aDisplayRows.length, 2, "crea el encabezado HU y su fila hija");
		assert.ok(aDisplayRows.every(function (oRow) {
			return oRow.IsHU || oRow.Message === "HU";
		}), "no muestra los otros objetos como filas principales");
		assert.ok(aDisplayRows[1].CanExpandHuFlow, "la HU permite desplegar pedidos");
		assert.strictEqual(aDisplayRows[1].FlowOptions[0].Ebeln, "4700090573", "el pedido queda en el segundo nivel");
		assert.strictEqual(aDisplayRows[1].FlowOptions[0].MaterialDetails[0].Maktx, "HARINA DE TRIGO PARA PRODUCCIÓN", "el material queda en el tercer nivel");
	});

	QUnit.test("expande de forma independiente el flujo de cada HU", function (assert) {
		var oController = new Controller();
		var aRows = [{
			Message: "HU",
			HuFlowExpanded: false
		}, {
			Message: "HU",
			HuFlowExpanded: false
		}];

		oController._updateHuFlowExpansion(aRows, "/preview/1", true);

		assert.notOk(aRows[0].HuFlowExpanded, "mantiene cerrada la primera HU");
		assert.ok(aRows[1].HuFlowExpanded, "abre solamente la HU indicada");
	});

	QUnit.test("permite consultar materiales sin seleccionar la HU", function (assert) {
		var oController = new Controller();
		var aRows = [{
			Message: "HU",
			HuSelected: false,
			providerOptions: [{
				providerKey: "PEDIDO_1",
				MaterialExpanded: false
			}, {
				providerKey: "PEDIDO_2",
				MaterialExpanded: false
			}]
		}];

		oController._updateOrderMaterialExpansion(
			aRows,
			"/preview/0",
			"PEDIDO_2",
			true
		);

		assert.notOk(aRows[0].HuSelected, "la HU continúa sin seleccionarse para anulación");
		assert.notOk(aRows[0].providerOptions[0].MaterialExpanded, "mantiene cerrado el primer pedido");
		assert.ok(aRows[0].providerOptions[1].MaterialExpanded, "muestra el material del pedido elegido");
	});

	QUnit.test("formatea identificadores con los últimos diez dígitos", function (assert) {
		var oController = new Controller();

		assert.strictEqual(
			oController._getLastTenDigits("000000000040307009"),
			"0040307009",
			"recorta un identificador HU largo"
		);
		assert.strictEqual(
			oController._getLastTenDigits("000000000014000054"),
			"0014000054",
			"recorta un material largo"
		);
		assert.strictEqual(
			oController._getLastTenDigits("1234567890"),
			"1234567890",
			"conserva un valor que ya tiene diez dígitos"
		);
	});

});
