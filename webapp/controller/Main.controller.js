sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, JSONModel, Filter, FilterOperator, MessageBox, MessageToast) {
    "use strict";

    return Controller.extend("z.anulacion.anulacion.controller.Main", {

        onInit: function () {
            var oVM = new JSONModel(this._getInitialState());
            this.getView().setModel(oVM, "viewModel");

            this._logInfo("onInit", "Controlador inicializado");
            this._logAmbiente();
        },

        _getInitialState: function () {
            return {
                matDoc: "",
                canCancel: false,
                busy: false,
                lastRunId: "",
                resultado: {
                    Status: "",
                    Message: ""
                },
                resultadoState: "None",
                preview: [],
                detalle: [],
                summary: {
                    total: 0,
                    hu: 0,
                    material: 0,
                    otros: 0
                }
            };
        },

        getModel: function () {
            return this.getOwnerComponent().getModel();
        },

        getVM: function () {
            return this.getView().getModel("viewModel");
        },

        _generateTraceId: function (sPrefix) {
            return (sPrefix || "TRACE") + "_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
        },

        _logInfo: function (sStep, sMessage, oData) {
            console.log("[INFO][" + sStep + "] " + sMessage, oData || "");
        },

        _logWarn: function (sStep, sMessage, oData) {
            console.warn("[WARN][" + sStep + "] " + sMessage, oData || "");
        },

        _logError: function (sStep, sMessage, oData) {
            console.error("[ERROR][" + sStep + "] " + sMessage, oData || "");
        },

        _serializeError: function (oError) {
            var oOut = {
                message: "",
                statusCode: "",
                statusText: "",
                responseText: "",
                responseJSON: null
            };

            try {
                oOut.message = oError && oError.message ? oError.message : "";
                oOut.statusCode = oError && oError.statusCode ? oError.statusCode : "";
                oOut.statusText = oError && oError.statusText ? oError.statusText : "";
                oOut.responseText = oError && oError.responseText ? oError.responseText : "";

                if (oOut.responseText) {
                    oOut.responseJSON = JSON.parse(oOut.responseText);
                }
            } catch (e) {
                oOut.responseJSON = null;
            }

            return oOut;
        },

        _logAmbiente: function () {
            var oModel = this.getModel();
            var sServiceUrl = "";

            try {
                sServiceUrl = oModel && oModel.sServiceUrl ? oModel.sServiceUrl : "";
            } catch (e) {
                sServiceUrl = "";
            }

            this._logInfo("_logAmbiente", "Información de servicio", {
                serviceUrl: sServiceUrl,
                currentUrl: window.location.href,
                host: window.location.host,
                origin: window.location.origin
            });
        },

        onMatDocLiveChange: function (oEvent) {
            var sOriginal = oEvent.getParameter("value") || "";
            var sSoloNumeros = sOriginal.replace(/\D/g, "");

            this.getVM().setProperty("/matDoc", sSoloNumeros);

            if (!sSoloNumeros) {
                this.getVM().setProperty("/canCancel", false);
            }

            this._logInfo("onMatDocLiveChange", "Cambio en input", {
                original: sOriginal,
                soloNumeros: sSoloNumeros
            });
        },

        onLimpiar: function () {
            this._logInfo("onLimpiar", "Se limpian datos");
            this.getVM().setData(this._getInitialState());
        },

        onBuscarDocumento: function () {
            var sMatDoc = this.getVM().getProperty("/matDoc");

            this._logInfo("onBuscarDocumento", "Click en buscar", {
                matDoc: sMatDoc
            });

            if (!sMatDoc) {
                MessageBox.warning("Ingresa un número de documento material.");
                return;
            }

            if (sMatDoc.length < 6) {
                MessageBox.warning("El documento material capturado parece incompleto.");
                return;
            }

            this._getPreview(sMatDoc);
        },

        _resetResultadoConsulta: function () {
            this.getVM().setProperty("/preview", []);
            this.getVM().setProperty("/detalle", []);
            this.getVM().setProperty("/canCancel", false);
            this.getVM().setProperty("/lastRunId", "");
            this.getVM().setProperty("/resultado", {
                Status: "",
                Message: ""
            });
            this.getVM().setProperty("/resultadoState", "None");
            this.getVM().setProperty("/summary", {
                total: 0,
                hu: 0,
                material: 0,
                otros: 0
            });
        },

      _getPreview: function (sMatDoc) {
    var oModel = this.getModel();
    var sTraceId = this._generateTraceId("PREVIEW");
    var sPath = "/AnulacionDetallePreviewSet";

    var aFilters = [
        new Filter("MatDoc", FilterOperator.EQ, sMatDoc)
    ];

    this._logInfo("_getPreview", "Inicia consulta de preview", {
        traceId: sTraceId,
        path: sPath,
        matDoc: sMatDoc,
        select: "MatDoc,ObjTipo,ObjKey1,ObjKey2,Message,SeqNo"
    });

    this.getVM().setProperty("/busy", true);
    this._resetResultadoConsulta();

    oModel.read(sPath, {
        filters: aFilters,
        urlParameters: {
            "$select": "MatDoc,ObjTipo,ObjKey1,ObjKey2,Message,SeqNo"
        },

        success: function (oData) {
            var aResults = oData && oData.results ? oData.results : [];
            var bTieneDatosValidos = this._hasValidPreviewData(aResults);

            this._logInfo("_getPreview.success", "Respuesta recibida", {
                traceId: sTraceId,
                totalResultados: aResults.length,
                results: aResults,
                tieneDatosValidos: bTieneDatosValidos
            });

            this.getVM().setProperty("/preview", aResults);
            this._updateSummary(aResults);

            if (!aResults.length || !bTieneDatosValidos) {
                this.getVM().setProperty("/resultado", {
                    Status: "E",
                    Message: "No se encontraron registros para el documento."
                });
                this.getVM().setProperty("/resultadoState", "Error");
                this.getVM().setProperty("/canCancel", false);
                this.getVM().setProperty("/busy", false);

                MessageBox.error("No se encontraron registros para el documento material capturado.");
                return;
            }

            this._evaluatePreviewBeforeCancel(aResults);

            this.getVM().setProperty("/busy", false);
            MessageToast.show("Vista previa cargada correctamente.");
        }.bind(this),

        error: function (oError) {
            this.getVM().setProperty("/busy", false);
            this.getVM().setProperty("/canCancel", false);

            this._logError("_getPreview.error", "Error al consultar preview", {
                traceId: sTraceId,
                path: sPath,
                matDoc: sMatDoc,
                error: this._serializeError(oError)
            });

            this._showODataError("Error al consultar la vista previa.", oError);
        }.bind(this)
    });
},

        _hasValidPreviewData: function (aResults) {
            return aResults.some(function (oItem) {
                return !!(
                    oItem &&
                    (
                        oItem.MatDoc ||
                        oItem.Message ||
                        oItem.Status ||
                        oItem.ObjTipo ||
                        oItem.ObjKey1 ||
                        oItem.ObjKey2 ||
                        oItem.ObjKey3
                    )
                );
            });
        },

        _updateSummary: function (aItems) {
            var iHU = 0;
            var iMaterial = 0;
            var iOtros = 0;

            (aItems || []).forEach(function (oItem) {
                var sText = [
                    oItem.ObjTipo,
                    oItem.Message,
                    oItem.ObjKey1,
                    oItem.ObjKey2,
                    oItem.ObjKey3
                ].join(" ").toUpperCase();

                if (sText.indexOf("HU") >= 0) {
                    iHU++;
                } else if (
                    sText.indexOf("MATERIAL") >= 0 ||
                    sText.indexOf("MATDOC") >= 0 ||
                    sText.indexOf("DOCUMENTO") >= 0
                ) {
                    iMaterial++;
                } else {
                    iOtros++;
                }
            });

            this.getVM().setProperty("/summary", {
                total: aItems ? aItems.length : 0,
                hu: iHU,
                material: iMaterial,
                otros: iOtros
            });
        },

        _evaluatePreviewBeforeCancel: function (aResults) {
            var oSummary = this.getVM().getProperty("/summary");
            var bSoloHU = oSummary.total > 0 && oSummary.hu === oSummary.total;
            var bTieneErrores = (aResults || []).some(function (oItem) {
                return oItem.Status === "E";
            });

            if (bTieneErrores) {
                this.getVM().setProperty("/resultado", {
                    Status: "E",
                    Message: "La vista previa contiene errores. Revisa el detalle antes de ejecutar la anulación."
                });
                this.getVM().setProperty("/resultadoState", "Error");
                this.getVM().setProperty("/canCancel", false);
                return;
            }

            if (bSoloHU) {
                this.getVM().setProperty("/resultado", {
                    Status: "W",
                    Message: "La vista previa solo contiene HU. Si esperas anular pedido, entrega, documento material o transporte, falta ajustar la lógica backend del servicio OData."
                });
                this.getVM().setProperty("/resultadoState", "Warning");
                this.getVM().setProperty("/canCancel", true);
                return;
            }

            this.getVM().setProperty("/resultado", {
                Status: "S",
                Message: "Vista previa obtenida correctamente. Revisa los objetos relacionados antes de anular."
            });
            this.getVM().setProperty("/resultadoState", "Success");
            this.getVM().setProperty("/canCancel", true);
        },

        onAnularDocumento: function () {
            var sMatDoc = this.getVM().getProperty("/matDoc");
            var bCanCancel = this.getVM().getProperty("/canCancel");
            var aPreview = this.getVM().getProperty("/preview") || [];
            var oSummary = this.getVM().getProperty("/summary") || {};

            this._logInfo("onAnularDocumento", "Click en anular", {
                matDoc: sMatDoc,
                canCancel: bCanCancel,
                summary: oSummary,
                preview: aPreview
            });

            if (!sMatDoc) {
                MessageBox.warning("Primero captura un documento material.");
                return;
            }

            if (!bCanCancel) {
                MessageBox.warning("Primero consulta la vista previa antes de anular.");
                return;
            }

            var sConfirmMessage =
                "¿Deseas anular el documento " + sMatDoc + "?\n\n" +
                "Objetos encontrados: " + (oSummary.total || 0) + "\n" +
                "HU: " + (oSummary.hu || 0) + "\n" +
                "Documento material: " + (oSummary.material || 0) + "\n" +
                "Otros objetos: " + (oSummary.otros || 0) + "\n\n" +
                "Importante: la anulación completa depende de la lógica del servicio SAP OData.";

            MessageBox.confirm(sConfirmMessage, {
                title: "Confirmar anulación",
                actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.OK,

                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        this._postAnulacion(sMatDoc);
                    }
                }.bind(this)
            });
        },

        _postAnulacion: function (sMatDoc) {
            var oModel = this.getModel();
            var sTraceId = this._generateTraceId("POST_ANULACION");
            var sPath = "/AnulacionSet";

            /*
             * IMPORTANTE:
             * Este payload solo manda MatDoc porque tu metadata actual parece trabajar así.
             * Si quieres anulación completa por cadena, el backend ABAP debe resolver:
             * - HU
             * - Entrega
             * - Pedido de venta
             * - Pedido de compra
             * - Documento material
             * - Transporte
             *
             * Si el backend acepta más campos, se puede ampliar el payload con:
             * RunId, Mode, PreviewItems, etc.
             */
            var oPayload = {
                MatDoc: sMatDoc
            };

            this._logInfo("_postAnulacion", "Inicia create", {
                traceId: sTraceId,
                path: sPath,
                payload: oPayload
            });

            this.getVM().setProperty("/busy", true);
            this.getVM().setProperty("/detalle", []);

            oModel.create(sPath, oPayload, {
                success: function (oData) {
                    var sStatus = oData && oData.Status ? oData.Status : "S";
                    var sMessage = oData && oData.Message ? oData.Message : "Proceso de anulación ejecutado.";
                    var sRunId = oData && oData.RunId ? oData.RunId : "";

                    this._logInfo("_postAnulacion.success", "Respuesta create", {
                        traceId: sTraceId,
                        oData: oData
                    });

                    this.getVM().setProperty("/resultado", {
                        Status: sStatus,
                        Message: sMessage
                    });
                    this.getVM().setProperty("/resultadoState", this._getState(sStatus));
                    this.getVM().setProperty("/canCancel", false);
                    this.getVM().setProperty("/lastRunId", sRunId);

                    MessageToast.show("Solicitud de anulación enviada correctamente.");

                    if (sRunId) {
                        this._getDetalleFinalByRunId(sRunId);
                    } else {
                        this._getDetalleFinalByMatDoc(sMatDoc);
                    }
                }.bind(this),

                error: function (oError) {
                    this.getVM().setProperty("/canCancel", false);

                    this._logError("_postAnulacion.error", "Error en create", {
                        traceId: sTraceId,
                        payload: oPayload,
                        error: this._serializeError(oError)
                    });

                    this._showODataError("Error al anular el documento.", oError);
                    this._getDetalleFinalByMatDoc(sMatDoc);
                }.bind(this)
            });
        },

        _getDetalleFinalByRunId: function (sRunId) {
            var oModel = this.getModel();
            var sTraceId = this._generateTraceId("DETALLE_RUNID");
            var sPath = "/AnulacionDetalleSet";

            var aFilters = [
                new Filter("RunId", FilterOperator.EQ, sRunId)
            ];

            this._logInfo("_getDetalleFinalByRunId", "Consulta detalle por RunId", {
                traceId: sTraceId,
                runId: sRunId
            });

            oModel.read(sPath, {
                filters: aFilters,

                success: function (oData) {
                    var aResults = oData && oData.results ? oData.results : [];

                    this._logInfo("_getDetalleFinalByRunId.success", "Detalle recibido", {
                        traceId: sTraceId,
                        total: aResults.length,
                        results: aResults
                    });

                    this.getVM().setProperty("/detalle", aResults);
                    this.getVM().setProperty("/busy", false);
                    this._updateSummary(aResults);
                    this._actualizarResultadoDesdeDetalle(aResults);
                }.bind(this),

                error: function (oError) {
                    this.getVM().setProperty("/detalle", []);
                    this.getVM().setProperty("/busy", false);

                    this._logError("_getDetalleFinalByRunId.error", "Error detalle por RunId", {
                        traceId: sTraceId,
                        runId: sRunId,
                        error: this._serializeError(oError)
                    });

                    this._showODataError("Error al consultar el detalle final por RunId.", oError);
                }.bind(this)
            });
        },

        _getDetalleFinalByMatDoc: function (sMatDoc) {
            var oModel = this.getModel();
            var sTraceId = this._generateTraceId("DETALLE_MATDOC");
            var sPath = "/AnulacionDetalleSet";

            var aFilters = [
                new Filter("MatDoc", FilterOperator.EQ, sMatDoc)
            ];

            this._logInfo("_getDetalleFinalByMatDoc", "Consulta detalle por MatDoc", {
                traceId: sTraceId,
                matDoc: sMatDoc
            });

            oModel.read(sPath, {
                filters: aFilters,

                success: function (oData) {
                    var aResults = oData && oData.results ? oData.results : [];

                    this._logInfo("_getDetalleFinalByMatDoc.success", "Detalle recibido", {
                        traceId: sTraceId,
                        total: aResults.length,
                        results: aResults
                    });

                    this.getVM().setProperty("/detalle", aResults);
                    this.getVM().setProperty("/busy", false);
                    this._updateSummary(aResults);
                    this._actualizarResultadoDesdeDetalle(aResults);
                }.bind(this),

                error: function (oError) {
                    this.getVM().setProperty("/detalle", []);
                    this.getVM().setProperty("/busy", false);

                    this._logError("_getDetalleFinalByMatDoc.error", "Error detalle por MatDoc", {
                        traceId: sTraceId,
                        matDoc: sMatDoc,
                        error: this._serializeError(oError)
                    });
                }.bind(this)
            });
        },

        _actualizarResultadoDesdeDetalle: function (aDetalle) {
            if (!aDetalle || !aDetalle.length) {
                this._logWarn("_actualizarResultadoDesdeDetalle", "No hay detalle para evaluar");
                return;
            }

            var oError = aDetalle.find(function (oItem) {
                return oItem.Status === "E";
            });

            var oWarning = aDetalle.find(function (oItem) {
                return oItem.Status === "W";
            });

            var oSuccess = aDetalle.find(function (oItem) {
                return oItem.Status === "S";
            });

            var oFinal = oError || oWarning || oSuccess || aDetalle[0];

            this._logInfo("_actualizarResultadoDesdeDetalle", "Registro final", oFinal);

            this.getVM().setProperty("/resultado", {
                Status: oFinal.Status || "",
                Message: oFinal.Message || "Proceso consultado correctamente."
            });

            this.getVM().setProperty("/resultadoState", this._getState(oFinal.Status || ""));
        },

        _getState: function (sStatus) {
            if (sStatus === "S") {
                return "Success";
            }

            if (sStatus === "E") {
                return "Error";
            }

            if (sStatus === "W") {
                return "Warning";
            }

            if (sStatus === "I") {
                return "Information";
            }

            return "None";
        },

        formatDetalleState: function (sStatus) {
            return this._getState(sStatus);
        },

        formatStatusText: function (sStatus) {
            if (sStatus === "S") {
                return "Éxito";
            }

            if (sStatus === "E") {
                return "Error";
            }

            if (sStatus === "W") {
                return "Advertencia";
            }

            if (sStatus === "I") {
                return "Información";
            }

            return sStatus || "Sin ejecutar";
        },

        _showODataError: function (sDefaultMessage, oError) {
            var sMessage = sDefaultMessage;

            this._logError("_showODataError", "Entró al manejador de error", {
                defaultMessage: sDefaultMessage,
                error: this._serializeError(oError)
            });

            try {
                if (oError && oError.responseText) {
                    var oResponse = JSON.parse(oError.responseText);

                    if (
                        oResponse &&
                        oResponse.error &&
                        oResponse.error.message &&
                        oResponse.error.message.value
                    ) {
                        sMessage = oResponse.error.message.value;
                    }
                } else if (oError && oError.message) {
                    sMessage = oError.message;
                }
            } catch (e) {
                this._logError("_showODataError", "No se pudo parsear responseText", e);

                if (oError && oError.message) {
                    sMessage = oError.message;
                }
            }

            this.getVM().setProperty("/resultado", {
                Status: "E",
                Message: sMessage
            });

            this.getVM().setProperty("/resultadoState", "Error");
            this.getVM().setProperty("/busy", false);

            MessageBox.error(sMessage);
        }
    });
});