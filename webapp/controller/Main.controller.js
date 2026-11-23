sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "sap/base/Log"
], function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    MessageBox,
    MessageToast,
    Fragment,
    Log
) {
    "use strict";

    return Controller.extend("z.anulacion.anulacion.controller.Main", {

        onInit: function () {
            var oVM = new JSONModel(this._getInitialState());
            oVM.setSizeLimit(1000);
            this.getView().setModel(oVM, "viewModel");

            this._logInfo("onInit", "Controlador inicializado correctamente");
            this._logAmbiente();
        },

        onExit: function () {
            if (this._oProviderDialog) {
                this._oProviderDialog.destroy();
                this._oProviderDialog = null;
            }

            if (this._oStatusMessageDialog) {
                this._oStatusMessageDialog.destroy();
                this._oStatusMessageDialog = null;
                this._pStatusMessageDialog = null;
            }

            if (this._oCancellationConfirmationDialog) {
                this._oCancellationConfirmationDialog.destroy();
                this._oCancellationConfirmationDialog = null;
                this._pCancellationConfirmationDialog = null;
            }

            this._oPendingCancellation = null;
        },

        getModel: function () {
            return this.getOwnerComponent().getModel();
        },

        getVM: function () {
            return this.getView().getModel("viewModel");
        },

        _generateTraceId: function (sPrefix) {
            return (sPrefix || "TRACE") +
                "_" +
                Date.now() +
                "_" +
                Math.floor(Math.random() * 100000);
        },

        _stringifyLogData: function (oData) {
            if (!oData) {
                return "";
            }

            try {
                var sDetails = JSON.stringify(oData);

                return sDetails.length > 12000
                    ? sDetails.slice(0, 12000) + "...[truncado]"
                    : sDetails;
            } catch (oSerializationError) {
                return "No fue posible serializar el detalle técnico: " +
                    String(oSerializationError.message || "");
            }
        },

        _logInfo: function (sStep, sMessage, oData) {
            Log.info(
                "[" + sStep + "] " + sMessage,
                this._stringifyLogData(oData),
                "z.anulacion.anulacion.controller.Main"
            );
        },

        _logWarn: function (sStep, sMessage, oData) {
            Log.warning(
                "[" + sStep + "] " + sMessage,
                this._stringifyLogData(oData),
                "z.anulacion.anulacion.controller.Main"
            );
        },

        _logError: function (sStep, sMessage, oData) {
            Log.error(
                "[" + sStep + "] " + sMessage,
                this._stringifyLogData(oData),
                "z.anulacion.anulacion.controller.Main"
            );
        },

        _debugEccTraffic: function (sTitle, oData, aRows) {
            var oVM = this.getVM && this.getVM();
            var bEnabled = !oVM ||
                oVM.getProperty("/debugEccTraffic") !== false;

            if (
                !bEnabled ||
                typeof window === "undefined" ||
                !window.console
            ) {
                return;
            }

            var oConsole = window.console;
            var sLabel = "[ECC DEBUG] " + String(sTitle || "TRÁFICO");

            if (typeof oConsole.group === "function") {
                oConsole.group(sLabel);
            } else {
                oConsole.log(sLabel);
            }

            oConsole.log("Objeto:", oData);

            try {
                oConsole.log(
                    "JSON copiable:\n" + JSON.stringify(oData, null, 2)
                );
            } catch (oStringifyError) {
                oConsole.warn(
                    "No fue posible convertir el objeto a JSON.",
                    oStringifyError
                );
            }

            if (
                Array.isArray(aRows) &&
                typeof oConsole.table === "function"
            ) {
                oConsole.table(aRows);
            }

            if (typeof oConsole.groupEnd === "function") {
                oConsole.groupEnd();
            }

            if (
                oVM &&
                oVM.getProperty("/debugBreakOnEccTraffic") === true
            ) {
                oConsole.warn(
                    "Activa un breakpoint manual en _debugEccTraffic para detener la ejecución."
                );
            }
        },

        _logPostPayload: function (
            sTraceId,
            sPostUri,
            oPayload,
            bCsrfRetried
        ) {
            var sPayload = JSON.stringify(oPayload, null, 2);
            var sMessage = [
                "[ANULACION POST]",
                "TraceId: " + sTraceId,
                "URL: " + sPostUri,
                "Reintento CSRF: " + (bCsrfRetried ? "sí" : "no"),
                "Payload:",
                sPayload
            ].join("\n");

            // LOG DE SOPORTE: se deja explícito para comprobar en DevTools
            // el JSON exacto inmediatamente antes de enviarlo a SAP.
            if (
                typeof window !== "undefined" &&
                window.console &&
                typeof window.console.log === "function"
            ) {
                window.console.log(sMessage);
            }

            this._debugEccTraffic(
                "POST - PAYLOAD ENVIADO",
                {
                    traceId: sTraceId,
                    method: "POST",
                    url: sPostUri,
                    csrfRetried: bCsrfRetried === true,
                    payload: oPayload
                }
            );

            this._logInfo(
                "_postAnulacion.payload",
                "Payload exacto preparado para SAP.",
                {
                    traceId: sTraceId,
                    method: "POST",
                    uri: sPostUri,
                    csrfRetried: bCsrfRetried === true,
                    payload: oPayload
                }
            );
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
                sServiceUrl = oModel && oModel.sServiceUrl
                    ? oModel.sServiceUrl
                    : "";
            } catch (e) {
                sServiceUrl = "";
            }

            this._logInfo("_logAmbiente", "Información del servicio", {
                serviceUrl: sServiceUrl,
                currentUrl: window.location.href,
                host: window.location.host,
                origin: window.location.origin
            });
        },

        _normalizeMatDocInput: function (vValue) {
            return String(
                vValue === null || vValue === undefined ? "" : vValue
            ).replace(/\D/g, "").slice(0, 10);
        },

        _isValidMatDoc: function (vValue) {
            return /^\d{10}$/.test(String(vValue || "").trim());
        },

        _normalizeMatYearInput: function (vValue) {
            return String(
                vValue === null || vValue === undefined ? "" : vValue
            ).replace(/\D/g, "").slice(0, 4);
        },

        _isValidMatYear: function (vValue) {
            return /^\d{4}$/.test(String(vValue || "").trim());
        },

        onMatDocLiveChange: function (oEvent) {
            var sOriginal = oEvent.getParameter("value") || "";
            var sMatDoc = this._normalizeMatDocInput(sOriginal);
            var oSource = oEvent.getSource && oEvent.getSource();
            var oVM = this.getVM();
            var oPreviewHeader = oVM.getProperty("/previewHeader") || {};
            var sPreviewMatDoc = String(
                oPreviewHeader.MatDoc || ""
            ).trim();

            if (
                oSource &&
                typeof oSource.setValue === "function" &&
                sOriginal !== sMatDoc
            ) {
                oSource.setValue(sMatDoc);
            }

            oVM.setProperty("/matDoc", sMatDoc);

            // Una vista previa sólo autoriza a anular exactamente el documento
            // que SAP confirmó. Cualquier edición obliga a consultarlo de nuevo.
            if (!sMatDoc || sMatDoc !== sPreviewMatDoc) {
                oVM.setProperty("/canCancel", false);
            }
        },

        onMatYearLiveChange: function (oEvent) {
            var sOriginal = oEvent.getParameter("value") || "";
            var sMatYear = this._normalizeMatYearInput(sOriginal);
            var oSource = oEvent.getSource && oEvent.getSource();
            var oVM = this.getVM();
            var oPreviewHeader = oVM.getProperty("/previewHeader") || {};
            var sPreviewYear = String(
                oPreviewHeader.MatYear || ""
            ).trim();

            if (
                oSource &&
                typeof oSource.setValue === "function" &&
                sOriginal !== sMatYear
            ) {
                oSource.setValue(sMatYear);
            }

            oVM.setProperty("/matYear", sMatYear);

            if (!sMatYear || sMatYear !== sPreviewYear) {
                oVM.setProperty("/canCancel", false);
            }
        },

        onLimpiar: function () {
            this.getVM().setData(this._getInitialState());
            MessageToast.show("La información fue limpiada.");
        },

        onBuscarDocumento: function () {
            var oVM = this.getVM();
            var sMatDoc = this._normalizeMatDocInput(
                oVM.getProperty("/matDoc")
            );
            var sMatYear = this._normalizeMatYearInput(
                oVM.getProperty("/matYear")
            );

            oVM.setProperty("/matDoc", sMatDoc);
            oVM.setProperty("/matYear", sMatYear);

            if (oVM.getProperty("/busy")) {
                MessageToast.show(
                    "Ya hay una consulta en proceso. Espera su respuesta."
                );
                return;
            }

            if (!sMatDoc) {
                MessageBox.warning("Ingresa un número de documento material.");
                return;
            }

            if (!this._isValidMatDoc(sMatDoc)) {
                MessageBox.warning(
                    "El documento material debe contener exactamente 10 dígitos."
                );
                return;
            }

            if (!this._isValidMatYear(sMatYear)) {
                MessageBox.warning(
                    "El ejercicio debe contener exactamente 4 dígitos."
                );
                return;
            }

            this._getPreview(sMatDoc, sMatYear);
        },

        _resetResultadoConsulta: function () {
            var oVM = this.getVM();

            oVM.setProperty("/preview", []);
            oVM.setProperty("/previewDisplay", []);
            oVM.setProperty("/previewHeader", {});
            oVM.setProperty("/previewItems", []);
            oVM.setProperty("/expandedPreviewGroups", {});
            oVM.setProperty("/detalle", []);
            oVM.setProperty("/canCancel", false);
            oVM.setProperty("/materialSelectionCount", 0);
            oVM.setProperty("/backendPlanValidated", false);
            oVM.setProperty("/eccPlan", {
                validated: false,
                matDoc: "",
                year: "",
                movementType: "",
                huFound: 0,
                huAffected: 0,
                cancelPositions: 0,
                preservePositions: 0,
                pendingPositions: 0,
                cancelQuantity: 0,
                unit: ""
            });
            oVM.setProperty("/lastRunId", "");

            oVM.setProperty("/resultado", {
                Status: "",
                Message: ""
            });

            oVM.setProperty("/resultadoState", "None");
            oVM.setProperty(
                "/cancellationSummary",
                this._getEmptyCancellationSummary()
            );

            oVM.setProperty("/summary", {
                total: 0,
                hu: 0,
                material: 0,
                otros: 0,
                huPendientes: 0,
                huSelectionPending: 0
            });
        },

        _getPreviewTimeoutMs: function () {
            return 180000;
        },

        _getAnulacionTimeoutMs: function () {
            return 540000;
        },

        _isMatDocOnlyMode: function () {
            var oView = typeof this.getView === "function"
                ? this.getView()
                : null;
            var oVM = oView && typeof oView.getModel === "function"
                ? oView.getModel("viewModel")
                : null;

            return !!(
                oVM && oVM.getProperty("/matDocOnlyMode") === true
            );
        },

        _getPreview: function (sMatDoc, sMatYear) {
            var oModel = this.getModel();
            var oVM = this.getVM();
            var sTraceId = this._generateTraceId("PREVIEW");
            var sPath = "/AnulacionSet";
            var bRequestFinished = false;
            var oRequestHandle;
            var iRequestTimeoutId;
            var fnFinishRequest = function () {
                if (bRequestFinished) {
                    return false;
                }

                bRequestFinished = true;
                clearTimeout(iRequestTimeoutId);
                return true;
            };

            oVM.setProperty("/busy", true);
            this._resetResultadoConsulta();

            this._logInfo("_getPreview", "Inicia consulta de vista previa", {
                traceId: sTraceId,
                matDoc: sMatDoc,
                matYear: sMatYear,
                path: sPath
            });

            iRequestTimeoutId = setTimeout(function () {
                if (!fnFinishRequest()) {
                    return;
                }

                var sTimeoutMessage =
                    "SAP no respondió en 180 segundos. Revisa la destination QS4_PP y la solicitud AnulacionSet en Network.";

                oVM.setProperty("/busy", false);
                oVM.setProperty("/canCancel", false);
                oVM.setProperty("/resultado", {
                    Status: "E",
                    Message: sTimeoutMessage
                });
                oVM.setProperty("/resultadoState", "Error");

                this._logError(
                    "_getPreview.timeout",
                    "Tiempo de espera agotado al consultar la vista previa",
                    {
                        traceId: sTraceId,
                        matDoc: sMatDoc,
                        matYear: sMatYear,
                        path: sPath,
                        timeoutMs: this._getPreviewTimeoutMs()
                    }
                );

                this._showStatusMessageDialog(
                    sTimeoutMessage,
                    "Sin respuesta de SAP"
                );

                try {
                    if (
                        oRequestHandle &&
                        typeof oRequestHandle.abort === "function"
                    ) {
                        oRequestHandle.abort();
                    }
                } catch (oAbortError) {
                    this._logWarn(
                        "_getPreview.abort",
                        "La solicitud vencida no pudo abortarse, pero la pantalla ya fue liberada",
                        this._serializeError(oAbortError)
                    );
                }
            }.bind(this), this._getPreviewTimeoutMs());

            try {
                oRequestHandle = oModel.read(sPath, {
                filters: [
                    new Filter(
                        "MatDoc",
                        FilterOperator.EQ,
                        sMatDoc
                    ),
                    new Filter(
                        "MatYear",
                        FilterOperator.EQ,
                        sMatYear
                    )
                ],

                urlParameters: {
                    "sap-client": "300",
                    "$format": "json"
                },

                success: function (oData) {
                    if (!fnFinishRequest()) {
                        return;
                    }

                    try {
                        var oHeader = this._getDeepPreviewHeader(oData);
                        var aItems = this._getDeepPreviewItems(oHeader);

                        this._debugEccTraffic(
                            "GET Preview - RESPUESTA RECIBIDA",
                            {
                                traceId: sTraceId,
                                rawResponse: oData,
                                header: oHeader,
                                items: aItems
                            },
                            aItems
                        );

                        this._logInfo(
                            "_getPreview.success",
                            "Respuesta recibida",
                            {
                                traceId: sTraceId,
                                header: oHeader,
                                totalItems: aItems.length,
                                items: aItems
                            }
                        );

                    if (!oHeader) {
                        oVM.setProperty("/resultado", {
                            Status: "E",
                            Message: "No se encontraron registros para el documento."
                        });

                        oVM.setProperty("/resultadoState", "Error");
                        oVM.setProperty("/busy", false);
                        oVM.setProperty("/canCancel", false);

                        this._showStatusMessageDialog(
                            "No se encontraron registros para el documento material capturado.",
                            "No se encontraron resultados"
                        );
                        return;
                    }

                    if (String(oHeader.Status || "").toUpperCase() === "E") {
                        var sSapMessage = oHeader.Message ||
                            "SAP rechazó la consulta de vista previa.";

                        oVM.setProperty("/resultado", {
                            Status: "E",
                            Message: sSapMessage
                        });
                        oVM.setProperty("/resultadoState", "Error");
                        oVM.setProperty("/busy", false);
                        oVM.setProperty("/canCancel", false);
                        this._showStatusMessageDialog(
                            sSapMessage,
                            "No es posible continuar"
                        );
                        return;
                    }

                    if (!aItems.length) {
                        var sEmptyMessage = oHeader.Message ||
                            "No se encontraron registros para el documento material capturado.";

                        oVM.setProperty("/resultado", {
                            Status: "E",
                            Message: sEmptyMessage
                        });
                        oVM.setProperty("/resultadoState", "Error");
                        oVM.setProperty("/busy", false);
                        oVM.setProperty("/canCancel", false);
                        this._showStatusMessageDialog(
                            sEmptyMessage,
                            "No se encontraron resultados"
                        );
                        return;
                    }

                    var sCanonicalMatDoc = String(
                        oHeader.MatDoc || ""
                    ).trim();

                    if (!this._isValidMatDoc(sCanonicalMatDoc)) {
                        throw new Error(
                            "SAP devolvió un documento material inválido. Se esperaban exactamente 10 dígitos."
                        );
                    }

                    var aPreviewItems = this._mapDeepPreviewItems(
                        oHeader,
                        aItems
                    );
                    var aGroupedRows = this._buildPreviewRows(aPreviewItems);

                    // CONTRATO AnulacionSet: la selección es individual.
                    // Sólo las filas de mercancía con GR/posición muestran
                    // checkbox; auxiliares de embalaje son informativos.
                    if (oVM.getProperty("/matDocOnlyMode") === true) {
                        var oEccScope = this._applyContractSelectionRules(
                            aGroupedRows
                        );

                        oVM.setProperty("/eccPlan", oEccScope);
                        oVM.setProperty(
                            "/backendPlanValidated",
                            oEccScope.selectablePositions > 0
                        );
                    }

                    // El valor confirmado por SAP pasa a ser la fuente oficial
                    // para la confirmación y el POST de anulación.
                    oVM.setProperty("/matDoc", sCanonicalMatDoc);
                    oVM.setProperty(
                        "/matYear",
                        String(oHeader.MatYear || sMatYear || "").trim()
                    );
                    oVM.setProperty("/previewHeader", oHeader);
                    oVM.setProperty("/previewItems", aItems);
                    oVM.setProperty("/preview", aGroupedRows);
                    this._refreshPreviewDisplay();
                    this._updateSummary(aGroupedRows);
                    this._evaluatePreviewBeforeCancel(aGroupedRows);
                    oVM.setProperty("/busy", false);

                        MessageToast.show(
                            "Vista previa cargada correctamente."
                        );
                    } catch (oProcessingError) {
                        oVM.setProperty("/busy", false);
                        oVM.setProperty("/canCancel", false);

                        this._logError(
                            "_getPreview.processingError",
                            "La respuesta se recibió, pero no pudo procesarse",
                            {
                                traceId: sTraceId,
                                error:
                                    this._serializeError(oProcessingError)
                            }
                        );

                        this._showODataError(
                            "La respuesta de SAP no pudo procesarse.",
                            oProcessingError
                        );
                    }
                }.bind(this),

                error: function (oError) {
                    if (!fnFinishRequest()) {
                        return;
                    }

                    oVM.setProperty("/busy", false);
                    oVM.setProperty("/canCancel", false);

                    this._logError(
                        "_getPreview.error",
                        "Error al consultar la vista previa",
                        {
                            traceId: sTraceId,
                            error: this._serializeError(oError)
                        }
                    );

                    this._showODataError(
                        "Error al consultar la vista previa.",
                        oError
                    );
                }.bind(this)
                });
            } catch (oReadError) {
                if (!fnFinishRequest()) {
                    return;
                }

                oVM.setProperty("/busy", false);
                oVM.setProperty("/canCancel", false);
                this._logError(
                    "_getPreview.readError",
                    "No fue posible iniciar la solicitud OData",
                    {
                        traceId: sTraceId,
                        error: this._serializeError(oReadError)
                    }
                );
                this._showODataError(
                    "No fue posible iniciar la consulta a SAP.",
                    oReadError
                );
            }
        },

        _showStatusMessageDialog: function (sMessage, sTitle) {
            this.getVM().setProperty("/statusMessageDialog", {
                title: sTitle || "Mensaje de SAP",
                message: sMessage || "SAP no devolvió un mensaje.",
                sourceText: "Respuesta de SAP"
            });

            if (!this._pStatusMessageDialog) {
                this._pStatusMessageDialog = Fragment.load({
                    id: this.getView().getId(),
                    name:
                        "z.anulacion.anulacion.fragment.StatusMessage",
                    controller: this
                }).then(function (oDialog) {
                    this._oStatusMessageDialog = oDialog;
                    this.getView().addDependent(oDialog);
                    return oDialog;
                }.bind(this));
            }

            this._pStatusMessageDialog.then(function (oDialog) {
                oDialog.open();
            });
        },

        onCloseStatusMessageDialog: function () {
            if (this._oStatusMessageDialog) {
                this._oStatusMessageDialog.close();
            }
        },

        _getDeepPreviewHeader: function (oData) {
            var oPayload = oData && oData.d
                ? oData.d
                : oData;
            var aHeaders = oPayload && Array.isArray(oPayload.results)
                ? oPayload.results
                : [];

            if (aHeaders.length) {
                // Compatibilidad con la respuesta plana de
                // AnulacionPreviewSet: la envolvemos como Header/ToItems
                // para procesarla igual que el $expand del HeaderSet.
                if (
                    !aHeaders[0].ToItems &&
                    (
                        aHeaders[0].SeqNo !== undefined ||
                        aHeaders[0].GrMatDoc !== undefined
                    )
                ) {
                    return {
                        MatDoc: String(
                            aHeaders[0].MatDoc ||
                            aHeaders[0].GrMatDoc ||
                            ""
                        ).trim(),
                        MatYear: String(
                            aHeaders[0].MatYear ||
                            aHeaders[0].GrYear ||
                            ""
                        ).trim(),
                        Status: String(
                            aHeaders[0].Status || "S"
                        ).trim(),
                        Message: String(
                            aHeaders[0].Message ||
                            "Vista previa de anulación"
                        ).trim(),
                        HuCount: 0,
                        ItemCount: aHeaders.length,
                        ToItems: {
                            results: aHeaders
                        }
                    };
                }

                return aHeaders[0];
            }

            return oPayload && oPayload.MatDoc
                ? oPayload
                : null;
        },

        _getDeepPreviewItems: function (oHeader) {
            var oNavigation = oHeader && oHeader.ToItems;

            if (Array.isArray(oNavigation)) {
                return oNavigation;
            }

            return oNavigation && Array.isArray(oNavigation.results)
                ? oNavigation.results
                : [];
        },

        _mapDeepPreviewItems: function (oHeader, aItems) {
            var mHuProviders = {};
            var aPreviewItems = [];

            (aItems || []).forEach(function (oItem) {
                var sHuKey = this._getHuKey(oItem);
                var sProviderKey = String(
                    oItem.Lifnr || oItem.Name1 || ""
                ).trim();

                mHuProviders[sHuKey] = mHuProviders[sHuKey] || {};

                if (sProviderKey) {
                    mHuProviders[sHuKey][sProviderKey] = true;
                }
            }.bind(this));

            (aItems || []).forEach(function (oItem) {
                var sHuKey = this._getHuKey(oItem);
                var iProviderCount = Object.keys(
                    mHuProviders[sHuKey] || {}
                ).length;

                [
                    {
                        Message: "Documento del material",
                        MatDoc: oItem.GrMatDoc,
                        ObjKey1: oItem.GrYear
                    },
                    {
                        Message: "Pedido de compra",
                        MatDoc: oItem.Ebeln,
                        ObjKey1: oItem.GrMatDoc
                    },
                    {
                        Message: "Pedido de ventas",
                        MatDoc: oItem.SoVbeln,
                        ObjKey1: oItem.Ebeln
                    },
                    {
                        Message: "Entrega de salida",
                        MatDoc: oItem.DelivVbeln,
                        ObjKey1: oItem.SoVbeln
                    }
                ].forEach(function (oDocument) {
                    if (!String(oDocument.MatDoc || "").trim()) {
                        return;
                    }

                    aPreviewItems.push({
                        HeaderMatDoc: oHeader.MatDoc || "",
                        MatDoc: oDocument.MatDoc,
                        ObjTipo: "",
                        ObjKey1: oDocument.ObjKey1 || "",
                        ObjKey2: "",
                        ObjKey3: "",
                        Status: oHeader.Status || "",
                        Message: oDocument.Message
                    });
                });

                aPreviewItems.push(Object.assign({}, oItem, {
                    HeaderMatDoc: oHeader.MatDoc || "",
                    Status: oHeader.Status || "",
                    Message: "HU",
                    ObjTipo: oItem.GrYear || "",
                    ObjKey1: oItem.HuVenum || "",
                    ObjKey2: oItem.GrMatDoc || "",
                    ObjKey3: oItem.SoVbeln || "",
                    ProveedorCount: iProviderCount,
                    MultiProveedor: iProviderCount > 1 ? "X" : ""
                }));
            }.bind(this));

            return aPreviewItems;
        },

        _hasValidPreviewData: function (aResults) {
            return (aResults || []).some(function (oItem) {
                return !!(
                    oItem &&
                    (
                        oItem.MatDoc ||
                        oItem.Message ||
                        oItem.ObjTipo ||
                        oItem.ObjKey1 ||
                        oItem.ObjKey2 ||
                        oItem.HuVenum ||
                        oItem.HuExidv
                    )
                );
            });
        },

        _isHU: function (oItem) {
            return String(
                oItem && oItem.Message || ""
            ).trim().toUpperCase() === "HU";
        },

        _getHuKey: function (oItem) {
            return [
                "HU",
                oItem.HuVenum || oItem.ObjKey1 || "",
                oItem.HuExidv || oItem.MatDoc || ""
            ].join("|");
        },

        _getObjectGroupKey: function (oItem) {
            var sMessage = String(
                oItem && oItem.Message || ""
            ).trim().toUpperCase();

            if (this._isHU(oItem)) {
                return "HU";
            }

            if (
                sMessage.indexOf("DOCUMENTO") >= 0 &&
                sMessage.indexOf("MATERIAL") >= 0
            ) {
                return "DOCUMENTO_MATERIAL";
            }

            if (sMessage.indexOf("PEDIDO DE COMPRA") >= 0) {
                return "PEDIDO_COMPRA";
            }

            if (
                sMessage.indexOf("PEDIDO DE VENTA") >= 0 ||
                sMessage.indexOf("PEDIDO DE VENTAS") >= 0
            ) {
                return "PEDIDO_VENTA";
            }

            if (sMessage.indexOf("TRANSPORTE") >= 0) {
                return "TRANSPORTE";
            }

            if (sMessage.indexOf("ENTREGA") >= 0) {
                return "ENTREGA_SALIDA";
            }

            return String(
                oItem && oItem.ObjTipo || sMessage || "OTRO"
            ).trim().toUpperCase();
        },

        _getPreviewObjectKey: function (oItem) {
            var sMatDoc = String(
                oItem && oItem.MatDoc || ""
            ).trim();

            if (sMatDoc) {
                return [
                    this._getObjectGroupKey(oItem),
                    sMatDoc
                ].join("|");
            }

            return [
                this._getObjectGroupKey(oItem),
                oItem.ObjKey1 || "",
                oItem.ObjKey2 || "",
                oItem.ObjKey3 || "",
                oItem.MatDoc || "",
                oItem.HuVenum || "",
                oItem.HuExidv || ""
            ].join("|");
        },

        _buildPreviewRows: function (aResults) {
            var aRows = [];
            var mHuRows = {};
            var mObjectRows = {};

            (aResults || []).forEach(function (oRawItem) {
                var oItem = Object.assign({}, oRawItem);

                if (!this._isHU(oItem)) {
                    var sObjectKey = this._getPreviewObjectKey(oItem);

                    if (mObjectRows[sObjectKey]) {
                        return;
                    }

                    mObjectRows[sObjectKey] = true;
                    oItem.providerOptions = [];
                    oItem.ProviderSummaries = [];
                    oItem.PurchaseOrderSummaries = [];
                    oItem.selectedProviders = [];
                    oItem.selectedProvider = null;
                    oItem.providerSelectionRequired = false;

                    this._decoratePreviewRow(oItem);
                    aRows.push(oItem);
                    return;
                }

                var sHuKey = this._getHuKey(oItem);

                if (!mHuRows[sHuKey]) {
                    mHuRows[sHuKey] = Object.assign({}, oItem, {
                        providerOptions: [],
                        huMaterialDetails: [],
                        selectedProviders: [],
                        selectedProvider: null,
                        providerSelectionRequired:
                            oItem.MultiProveedor === "X" ||
                            Number(oItem.ProveedorCount || 0) > 1
                    });

                    aRows.push(mHuRows[sHuKey]);
                }

                if (oItem.Lifnr || oItem.Name1 || oItem.Ebeln) {
                    var sProviderKey = [
                        oItem.SeqNo === null ||
                        oItem.SeqNo === undefined
                            ? ""
                            : String(oItem.SeqNo),
                        oItem.Lifnr || "",
                        oItem.Ebeln || "",
                        oItem.HuVenum || "",
                        oItem.HuExidv || "",
                        oItem.GrMatDoc || "",
                        oItem.Charg || "",
                        oItem.Matnr || ""
                    ].join("|");

                    var oProviderOption =
                        mHuRows[sHuKey].providerOptions.find(
                            function (oProvider) {
                                return oProvider.providerKey === sProviderKey;
                            }
                        );

                    if (!oProviderOption) {
                        oProviderOption = {
                            providerKey: sProviderKey,
                            Lifnr: oItem.Lifnr || "",
                            Name1: oItem.Name1 || "",
                            Ebeln: oItem.Ebeln || "",
                            HuVenum: oItem.HuVenum || "",
                            HuExidv: oItem.HuExidv || "",
                            SeqNo: oItem.SeqNo,
                            GrMatDoc: oItem.GrMatDoc || "",
                            GrYear: oItem.GrYear || "",
                            SoVbeln: oItem.SoVbeln || "",
                            DelivVbeln: oItem.DelivVbeln || "",
                            itemDetails: [],
                            Charg: "",
                            Menge: "",
                            Meins: "",
                            Matnr: "",
                            Maktx: "",
                            MaterialExpanded: false,
                            selected: false
                        };

                        mHuRows[sHuKey].providerOptions.push(
                            oProviderOption
                        );
                    }

                    this._appendProviderItemDetail(
                        oProviderOption,
                        oItem
                    );
                } else {
                    this._appendProviderItemDetail(
                        {
                            itemDetails:
                                mHuRows[sHuKey].huMaterialDetails
                        },
                        oItem
                    );
                }
            }.bind(this));

            aRows.forEach(function (oRow) {
                if (this._isHU(oRow)) {
                    this._buildHuOptionSummaries(oRow);
                    oRow.providerSelectionRequired =
                        oRow.MultiProveedor === "X" ||
                        oRow.SelectionOptionCount > 1;

                    if (oRow.providerOptions.length === 1) {
                        this._applySelectedProvidersToRow(
                            oRow,
                            [oRow.providerOptions[0]]
                        );
                    }
                }

                this._decoratePreviewRow(oRow);
            }.bind(this));

            var aHuRows = aRows.filter(function (oRow) {
                return this._isHU(oRow);
            }.bind(this));
            var bRequiresHuChoice = aHuRows.length > 1;

            aHuRows.forEach(function (oRow) {
                oRow.HuSelectionRequired = bRequiresHuChoice;
                oRow.HuSelected = !bRequiresHuChoice;
                this._decoratePreviewRow(oRow);
            }.bind(this));

            return aRows;
        },

        _appendProviderItemDetail: function (oProvider, oItem) {
            var oDetail = {
                SeqNo: oItem.SeqNo,
                GrMatDoc: String(oItem.GrMatDoc || "").trim(),
                GrYear: String(oItem.GrYear || "").trim(),
                // ZEILE debe venir de ECC. SeqNo no se usa como sustituto.
                Zeile: String(
                    oItem.ZEILE ||
                    oItem.Zeile ||
                    oItem.GrItem ||
                    oItem.MatDocItem ||
                    ""
                ).trim(),
                Vepos: String(
                    oItem.VEPOS ||
                    oItem.Vepos ||
                    oItem.HuItem ||
                    ""
                ).trim(),
                Bwart: String(
                    oItem.BWART ||
                    oItem.Bwart ||
                    oItem.MovementType ||
                    ""
                ).trim(),
                PlanValidated:
                    oItem.PlanValidated === true ||
                    String(oItem.PlanValidated || "")
                        .trim()
                        .toUpperCase() === "X" ||
                    String(oItem.PlanValidated || "")
                        .trim()
                        .toUpperCase() === "TRUE",
                SelectionStatus: String(
                    oItem.SelectionStatus ||
                    oItem.ScopeStatus ||
                    oItem.PositionStatus ||
                    ""
                ).trim(),
                Ebeln: String(oItem.Ebeln || "").trim(),
                Ebelp: String(oItem.Ebelp || "").trim(),
                Lifnr: String(oItem.Lifnr || "").trim(),
                SoVbeln: String(oItem.SoVbeln || "").trim(),
                SoPosnr: String(oItem.SoPosnr || "").trim(),
                DelivVbeln: String(oItem.DelivVbeln || "").trim(),
                DelivPosnr: String(oItem.DelivPosnr || "").trim(),
                InbDelivVbeln: String(
                    oItem.InbDelivVbeln || ""
                ).trim(),
                InbDelivPosnr: String(
                    oItem.InbDelivPosnr || ""
                ).trim(),
                Tknum: String(oItem.Tknum || "").trim(),
                Charg: String(oItem.Charg || "").trim(),
                Menge: oItem.Menge === null ||
                    oItem.Menge === undefined
                    ? ""
                    : String(oItem.Menge).trim(),
                Meins: String(oItem.Meins || "").trim(),
                Matnr: String(oItem.Matnr || "").trim(),
                Maktx: String(
                    oItem.Maktx ||
                    oItem.MaterialDescription ||
                    oItem.MatDesc ||
                    ""
                ).trim()
            };

            if (
                !oDetail.GrMatDoc &&
                !oDetail.GrYear &&
                !oDetail.SoVbeln &&
                !oDetail.DelivVbeln &&
                !oDetail.Charg &&
                !oDetail.Menge &&
                !oDetail.Meins &&
                !oDetail.Matnr &&
                !oDetail.Maktx
            ) {
                return;
            }

            var aDetails = oProvider.itemDetails || [];
            var sDetailKey = [
                oDetail.SeqNo === null ||
                oDetail.SeqNo === undefined
                    ? ""
                    : String(oDetail.SeqNo),
                oDetail.GrMatDoc,
                oDetail.GrYear,
                oDetail.Zeile,
                oDetail.Vepos,
                oDetail.Bwart,
                oDetail.SelectionStatus,
                oDetail.PlanValidated ? "X" : "",
                oDetail.Ebeln,
                oDetail.Ebelp,
                oDetail.Lifnr,
                oDetail.SoVbeln,
                oDetail.SoPosnr,
                oDetail.DelivVbeln,
                oDetail.DelivPosnr,
                oDetail.Tknum,
                oDetail.Charg,
                oDetail.Menge,
                oDetail.Meins,
                oDetail.Matnr,
                oDetail.Maktx
            ].join("|");
            var bExists = aDetails.some(function (oExistingDetail) {
                return [
                    oExistingDetail.SeqNo === null ||
                    oExistingDetail.SeqNo === undefined
                        ? ""
                        : String(oExistingDetail.SeqNo),
                    oExistingDetail.GrMatDoc || "",
                    oExistingDetail.GrYear || "",
                    oExistingDetail.Zeile || "",
                    oExistingDetail.Vepos || "",
                    oExistingDetail.Bwart || "",
                    oExistingDetail.SelectionStatus || "",
                    oExistingDetail.PlanValidated ? "X" : "",
                    oExistingDetail.SoVbeln || "",
                    oExistingDetail.DelivVbeln || "",
                    oExistingDetail.Charg || "",
                    oExistingDetail.Menge || "",
                    oExistingDetail.Meins || "",
                    oExistingDetail.Matnr || "",
                    oExistingDetail.Maktx || ""
                ].join("|") === sDetailKey;
            });

            if (!bExists) {
                aDetails.push(oDetail);
            }

            oProvider.itemDetails = aDetails;
            [
                "GrMatDoc",
                "GrYear",
                "Zeile",
                "Vepos",
                "Bwart",
                "SelectionStatus",
                "SoVbeln",
                "DelivVbeln",
                "InbDelivVbeln",
                "Charg",
                "Menge",
                "Meins",
                "Matnr",
                "Maktx"
            ].forEach(
                function (sProperty) {
                    oProvider[sProperty] = aDetails
                        .map(function (oEntry) {
                            var sValue = String(
                                oEntry[sProperty] || ""
                            ).trim();

                            return sValue || "-";
                        })
                        .join(" / ");
                }
            );

            oProvider.DisplayMatnr = aDetails
                .map(function (oEntry) {
                    return this._getLastTenDigits(
                        oEntry.Matnr
                    ) || "-";
                }.bind(this))
                .join(" / ");
        },

        _buildHuOptionSummaries: function (oRow) {
            var mProviders = {};
            var mPurchaseOrders = {};
            var aProviders = [];
            var aPurchaseOrders = [];

            (oRow.providerOptions || []).forEach(function (oOption) {
                var sProviderKey = String(
                    oOption.Lifnr || oOption.Name1 || ""
                ).trim();
                var sPurchaseOrder = String(
                    oOption.Ebeln || ""
                ).trim();

                if (sProviderKey && !mProviders[sProviderKey]) {
                    mProviders[sProviderKey] = true;
                    aProviders.push({
                        Lifnr: oOption.Lifnr || "",
                        Name1: oOption.Name1 || ""
                    });
                }

                if (
                    sPurchaseOrder &&
                    !mPurchaseOrders[sPurchaseOrder]
                ) {
                    mPurchaseOrders[sPurchaseOrder] = true;
                    aPurchaseOrders.push({
                        Ebeln: sPurchaseOrder
                    });
                }
            });

            oRow.ProviderSummaries = aProviders;
            oRow.PurchaseOrderSummaries = aPurchaseOrders;
            oRow.ProveedorCount = aProviders.length;
            oRow.PurchaseOrderCount = aPurchaseOrders.length;
            oRow.SelectionOptionCount =
                (oRow.providerOptions || []).length;
            oRow.ProviderCountText = aProviders.length === 1
                ? "1 proveedor"
                : aProviders.length + " proveedores";
            oRow.PurchaseOrderCountText =
                aPurchaseOrders.length === 1
                    ? "1 pedido"
                    : aPurchaseOrders.length + " pedidos";
        },

        _getLastTenDigits: function (sValue) {
            var sText = String(
                sValue === null || sValue === undefined
                    ? ""
                    : sValue
            ).trim();

            return sText.length > 10
                ? sText.slice(-10)
                : sText;
        },

        _getRowDocumentNumber: function (oRow) {
            if (this._isHU(oRow)) {
                return String(
                    oRow.HuExidv || oRow.HuVenum || ""
                ).trim();
            }

            return String(
                oRow.MatDoc ||
                oRow.ObjKey1 ||
                oRow.ObjKey2 ||
                ""
            ).trim();
        },

        _buildMaterialDetails: function (aRawDetails, oMaterialContext) {
            var sSourceBasePath = String(
                oMaterialContext &&
                oMaterialContext.sourceBasePath || ""
            ).trim();

            return (aRawDetails || []).map(
                function (oDetail, iMaterialIndex) {
                    var sDescription = String(
                        oDetail.Maktx ||
                        oDetail.MaterialDescription ||
                        oDetail.MatDesc ||
                        ""
                    ).trim();

                    var sMatnr = String(
                        oDetail.Matnr || ""
                    ).trim();

                    return {
                        MaterialPosition: iMaterialIndex + 1,
                        MaterialSelected:
                            oDetail.MaterialSelected === true,
                        MaterialSelectable:
                            oDetail.MaterialSelectable !== false,
                        MaterialSourcePath: sSourceBasePath
                            ? sSourceBasePath + "/" + iMaterialIndex
                            : "",
                        Matnr: sMatnr,
                        SeqNo: oDetail.SeqNo,
                        GrMatDoc: String(
                            oDetail.GrMatDoc || ""
                        ).trim(),
                        GrYear: String(
                            oDetail.GrYear || ""
                        ).trim(),
                        Zeile: String(
                            oDetail.Zeile || ""
                        ).trim(),
                        Vepos: String(
                            oDetail.Vepos || ""
                        ).trim(),
                        Bwart: String(
                            oDetail.Bwart || ""
                        ).trim(),
                        SelectionStatus: String(
                            oDetail.SelectionStatus || ""
                        ).trim(),
                        PlanValidated:
                            oDetail.PlanValidated === true,
                        Ebelp: String(
                            oDetail.Ebelp || ""
                        ).trim(),
                        Ebeln: String(
                            oDetail.Ebeln ||
                            oMaterialContext && oMaterialContext.Ebeln ||
                            ""
                        ).trim(),
                        SoPosnr: String(
                            oDetail.SoPosnr || ""
                        ).trim(),
                        DelivPosnr: String(
                            oDetail.DelivPosnr || ""
                        ).trim(),
                        InbDelivVbeln: String(
                            oDetail.InbDelivVbeln || ""
                        ).trim(),
                        InbDelivPosnr: String(
                            oDetail.InbDelivPosnr || ""
                        ).trim(),
                        Tknum: String(
                            oDetail.Tknum || ""
                        ).trim(),
                        PositionActionText: String(
                            oDetail.PositionActionText ||
                            "Pendiente de validar"
                        ).trim(),
                        PositionActionState: String(
                            oDetail.PositionActionState || "Warning"
                        ).trim(),
                        DisplayMatnr:
                            this._getLastTenDigits(sMatnr),
                        Maktx: sDescription ||
                            "Sin nombre disponible",
                        Menge: oDetail.Menge === null ||
                            oDetail.Menge === undefined
                            ? ""
                            : String(oDetail.Menge).trim(),
                        Meins: String(
                            oDetail.Meins || ""
                        ).trim(),
                        Charg: String(
                            oDetail.Charg || ""
                        ).trim()
                    };
                }.bind(this)
            );
        },

        _getSelectedMaterials: function (aPreview) {
            var aSelectedMaterials = [];

            (aPreview || []).forEach(function (oRow) {
                if (!this._isHU(oRow)) {
                    return;
                }

                var fnAppendSelected = function (aDetails, oContext) {
                    (aDetails || []).forEach(function (oDetail) {
                        if (oDetail.MaterialSelected !== true) {
                            return;
                        }

                        var sMatnr = String(
                            oDetail.Matnr || ""
                        ).trim();

                        aSelectedMaterials.push({
                            HuVenum: String(
                                oRow.HuVenum || ""
                            ).trim(),
                            HuExidv: String(
                                oRow.HuExidv || ""
                            ).trim(),
                            Ebeln: String(
                                oContext && oContext.Ebeln || ""
                            ).trim(),
                            Ebelp: String(
                                oDetail.Ebelp || ""
                            ).trim(),
                            Lifnr: String(
                                oDetail.Lifnr ||
                                oContext && oContext.Lifnr ||
                                ""
                            ).trim(),
                            GrMatDoc: String(
                                oDetail.GrMatDoc || ""
                            ).trim(),
                            GrYear: String(
                                oDetail.GrYear || ""
                            ).trim(),
                            Zeile: String(
                                oDetail.Zeile || ""
                            ).trim(),
                            Vepos: String(
                                oDetail.Vepos || ""
                            ).trim(),
                            Bwart: String(
                                oDetail.Bwart || ""
                            ).trim(),
                            SelectionStatus: String(
                                oDetail.SelectionStatus || ""
                            ).trim(),
                            PlanValidated:
                                oDetail.PlanValidated === true,
                            SoVbeln: String(
                                oDetail.SoVbeln ||
                                oContext && oContext.SoVbeln ||
                                ""
                            ).trim(),
                            SoPosnr: String(
                                oDetail.SoPosnr || ""
                            ).trim(),
                            DelivVbeln: String(
                                oDetail.DelivVbeln ||
                                oContext && oContext.DelivVbeln ||
                                ""
                            ).trim(),
                            DelivPosnr: String(
                                oDetail.DelivPosnr || ""
                            ).trim(),
                            Tknum: String(
                                oDetail.Tknum || ""
                            ).trim(),
                            SeqNo: oDetail.SeqNo,
                            Matnr: sMatnr,
                            DisplayMatnr:
                                this._getLastTenDigits(sMatnr),
                            Maktx: String(
                                oDetail.Maktx ||
                                "Sin nombre disponible"
                            ).trim(),
                            Charg: String(
                                oDetail.Charg || ""
                            ).trim(),
                            Menge: String(
                                oDetail.Menge || ""
                            ).trim(),
                            Meins: String(
                                oDetail.Meins || ""
                            ).trim()
                        });
                    }.bind(this));
                }.bind(this);

                fnAppendSelected(oRow.huMaterialDetails || [], null);

                (oRow.providerOptions || []).forEach(
                    function (oProvider) {
                        fnAppendSelected(
                            oProvider.itemDetails || [],
                            oProvider
                        );
                    }
                );
            }.bind(this));

            return aSelectedMaterials;
        },

        _getHuMaterialEntries: function (oRow) {
            var aMaterialEntries = [];

            Array.prototype.push.apply(
                aMaterialEntries,
                oRow && oRow.huMaterialDetails || []
            );

            (oRow && oRow.providerOptions || []).forEach(
                function (oProvider) {
                    Array.prototype.push.apply(
                        aMaterialEntries,
                        oProvider.itemDetails || []
                    );
                }
            );

            return aMaterialEntries;
        },

        _getMaterialSelectionKey: function (sMatnr) {
            var sValue = String(sMatnr || "").trim();
            var sWithoutLeadingZeros = sValue.replace(/^0+/, "");

            return sWithoutLeadingZeros || sValue;
        },

        _getEccMatDocSelectionKey: function (oDetail) {
            var sMatDoc = String(
                oDetail && oDetail.GrMatDoc || ""
            ).trim();
            var sYear = String(
                oDetail && oDetail.GrYear || ""
            ).trim();

            if (!sMatDoc || !sYear || sYear === "0000") {
                return "";
            }

            return sMatDoc + "|" + sYear;
        },

        _setMaterialSelectionByMatDoc: function (
            aPreview,
            sGrMatDoc,
            sGrYear,
            bSelected
        ) {
            var sScopeKey = this._getEccMatDocSelectionKey({
                GrMatDoc: sGrMatDoc,
                GrYear: sGrYear
            });
            var iMatches = 0;
            var mHuMatches = {};

            if (!sScopeKey) {
                return { matches: 0, huCount: 0 };
            }

            (aPreview || []).forEach(function (oRow) {
                if (!this._isHU(oRow)) {
                    return;
                }

                this._getHuMaterialEntries(oRow).forEach(
                    function (oDetail) {
                        if (
                            this._getEccMatDocSelectionKey(oDetail) !==
                            sScopeKey ||
                            oDetail.MaterialSelectable !== true
                        ) {
                            return;
                        }

                        oDetail.MaterialSelected = bSelected;
                        iMatches++;
                        mHuMatches[this._getHuKey(oRow)] = true;
                    }.bind(this)
                );
            }.bind(this));

            return {
                matches: iMatches,
                huCount: Object.keys(mHuMatches).length
            };
        },

        _normalizeEccSelectionStatus: function (sStatus) {
            var sValue = String(sStatus || "").trim().toUpperCase();

            if (
                sValue === "ANULAR" ||
                sValue === "CANCEL" ||
                sValue === "A"
            ) {
                return "ANULAR";
            }

            if (
                sValue === "CONSERVAR" ||
                sValue === "KEEP" ||
                sValue === "C"
            ) {
                return "CONSERVAR";
            }

            return "PENDIENTE";
        },

        _applyContractSelectionRules: function (aPreview) {
            var mFoundHu = {};
            var mAffectedHu = {};
            var iSelectablePositions = 0;
            var iSelectedPositions = 0;
            var iPreservePositions = 0;
            var iAuxiliaryPositions = 0;
            var fSelectedQuantity = 0;
            var sUnit = "";

            (aPreview || []).forEach(function (oRow) {
                if (!this._isHU(oRow)) {
                    return;
                }

                var sHuKey = this._getHuKey(oRow);
                mFoundHu[sHuKey] = true;

                this._getHuMaterialEntries(oRow).forEach(
                    function (oDetail) {
                        var bMerchandise = !!(
                            String(oDetail.GrMatDoc || "").trim() &&
                            String(oDetail.GrYear || "").trim() &&
                            String(oDetail.Zeile || "").trim() &&
                            String(oDetail.Vepos || "").trim()
                        );
                        var sIncomingStatus =
                            this._normalizeEccSelectionStatus(
                                oDetail.SelectionStatus
                            );
                        var bSelected = bMerchandise && (
                            typeof oDetail.MaterialSelected === "boolean"
                                ? oDetail.MaterialSelected
                                : sIncomingStatus === "ANULAR"
                        );

                        oDetail.MaterialSelectable = bMerchandise;
                        oDetail.MaterialSelected = bSelected;

                        if (!bMerchandise) {
                            oDetail.PositionAction = "AUXILIAR";
                            oDetail.PositionActionText = "Auxiliar";
                            oDetail.PositionActionState = "Information";
                            iAuxiliaryPositions++;
                            return;
                        }

                        iSelectablePositions++;

                        if (bSelected) {
                            oDetail.PositionAction = "ANULAR";
                            oDetail.PositionActionText = "Anular";
                            oDetail.PositionActionState = "Error";
                            iSelectedPositions++;
                            mAffectedHu[sHuKey] = true;
                            sUnit = sUnit || String(
                                oDetail.Meins || ""
                            ).trim();
                            fSelectedQuantity += Number(
                                String(oDetail.Menge || "0")
                                    .replace(",", ".")
                            ) || 0;
                        } else {
                            oDetail.PositionAction = "CONSERVAR";
                            oDetail.PositionActionText = "Conservar";
                            oDetail.PositionActionState = "Success";
                            iPreservePositions++;
                        }
                    }.bind(this)
                );
            }.bind(this));

            return {
                error: "",
                validated: iSelectablePositions > 0,
                huFound: Object.keys(mFoundHu).length,
                huAffected: Object.keys(mAffectedHu).length,
                selectablePositions: iSelectablePositions,
                cancelPositions: iSelectedPositions,
                preservePositions: iPreservePositions,
                pendingPositions: 0,
                auxiliaryPositions: iAuxiliaryPositions,
                cancelQuantity: fSelectedQuantity,
                unit: sUnit,
                matches: iSelectedPositions,
                huCount: Object.keys(mAffectedHu).length
            };
        },

        _isEccPlanValidated: function (oHeader) {
            var vValidated = oHeader && (
                oHeader.PlanValidated ||
                oHeader.PlanValidado
            );
            var sValidated = String(vValidated || "")
                .trim()
                .toUpperCase();

            return vValidated === true ||
                sValidated === "X" ||
                sValidated === "S" ||
                sValidated === "TRUE";
        },

        _applyEccMatDocSelection: function (
            aPreview,
            sRequestedMatDoc,
            oHeader
        ) {
            var sRequested = String(sRequestedMatDoc || "").trim();
            var bHeaderValidated = this._isEccPlanValidated(oHeader);
            var mFoundHu = {};
            var mAffectedHu = {};
            var mYears = {};
            var iCancelPositions = 0;
            var iPreservePositions = 0;
            var iPendingPositions = 0;
            var iTotalPositions = 0;
            var iValidatedPositions = 0;
            var fCancelQuantity = 0;
            var sUnit = "";
            var sMovementType = "";

            (aPreview || []).forEach(function (oRow) {
                if (!this._isHU(oRow)) {
                    return;
                }

                var sHuKey = this._getHuKey(oRow);
                mFoundHu[sHuKey] = true;

                this._getHuMaterialEntries(oRow).forEach(
                    function (oDetail) {
                        var sBackendStatus =
                            this._normalizeEccSelectionStatus(
                                oDetail.SelectionStatus
                            );
                        var sDetailMatDoc = String(
                            oDetail.GrMatDoc || ""
                        ).trim();
                        var sDetailYear = String(
                            oDetail.GrYear || ""
                        ).trim();
                        var sMovement = String(
                            oDetail.Bwart || ""
                        ).trim();
                        var sZeile = String(
                            oDetail.Zeile || ""
                        ).trim();
                        var sVepos = String(
                            oDetail.Vepos || ""
                        ).trim();

                        var bExactPositionIdentified =
                            sDetailMatDoc === sRequested &&
                            !!sDetailYear &&
                            sDetailYear !== "0000" &&
                            sMovement === "101" &&
                            !!sZeile &&
                            !!sVepos;
                        var bBelongsToRequestedMatDoc =
                            sDetailMatDoc === sRequested;
                        var sPositionStatus =
                            bExactPositionIdentified &&
                            sBackendStatus !== "CONSERVAR"
                                ? "ANULAR"
                                : bBelongsToRequestedMatDoc
                                    ? "PENDIENTE"
                                    : "CONSERVAR";

                        iTotalPositions++;

                        if (bExactPositionIdentified) {
                            iValidatedPositions++;
                        }

                        oDetail.PositionAction = sPositionStatus;
                        // ECC define qué posición es anulable; el usuario
                        // realiza la selección explícita desde la tabla.
                        oDetail.MaterialSelected = false;
                        oDetail.MaterialSelectable =
                            sPositionStatus === "ANULAR";

                        if (sPositionStatus === "ANULAR") {
                            oDetail.PositionActionText = "Anular";
                            oDetail.PositionActionState = "Error";
                            iCancelPositions++;
                            mAffectedHu[sHuKey] = true;
                            mYears[sDetailYear] = true;
                            sMovementType = sMovementType || sMovement;
                            sUnit = sUnit || String(
                                oDetail.Meins || ""
                            ).trim();
                            fCancelQuantity += Number(
                                String(oDetail.Menge || "0")
                                    .replace(",", ".")
                            ) || 0;
                        } else if (sPositionStatus === "CONSERVAR") {
                            oDetail.PositionActionText = "Conservar";
                            oDetail.PositionActionState = "Success";
                            iPreservePositions++;
                        } else {
                            oDetail.PositionActionText =
                                "Pendiente de validar";
                            oDetail.PositionActionState = "Warning";
                            iPendingPositions++;
                        }
                    }.bind(this)
                );
            }.bind(this));

            var aYears = Object.keys(mYears).filter(Boolean);
            var bAllPositionsValidated =
                iTotalPositions > 0 &&
                iValidatedPositions === iTotalPositions;
            var bValidated =
                (bHeaderValidated || bAllPositionsValidated) &&
                iCancelPositions > 0 &&
                iPendingPositions === 0 &&
                aYears.length === 1 &&
                sMovementType === "101";

            if (!bValidated) {
                (aPreview || []).forEach(function (oRow) {
                    if (!this._isHU(oRow)) {
                        return;
                    }

                    this._getHuMaterialEntries(oRow).forEach(
                        function (oDetail) {
                            oDetail.MaterialSelected = false;
                        }
                    );
                }.bind(this));
            }

            return {
                error: bValidated
                    ? ""
                    : "ECC todavía no confirmó el plan físico completo (MBLNR/MJAHR/ZEILE/VENUM/VEPOS).",
                validated: bValidated,
                matDoc: sRequested,
                year: aYears.length === 1 ? aYears[0] : "",
                movementType: sMovementType,
                huFound: Object.keys(mFoundHu).length,
                huAffected: Object.keys(mAffectedHu).length,
                cancelPositions: iCancelPositions,
                preservePositions: iPreservePositions,
                pendingPositions: iPendingPositions,
                cancelQuantity: fCancelQuantity,
                unit: sUnit,
                matches: iCancelPositions,
                huCount: Object.keys(mAffectedHu).length
            };
        },

        // LEGACY: se conserva para poder regresar al comportamiento anterior,
        // pero el flujo actual ya no propaga selecciones por MATNR.
        _setMaterialSelectionByNumber: function (
            aPreview,
            sMatnr,
            bSelected
        ) {
            var sMaterialKey =
                this._getMaterialSelectionKey(sMatnr);
            var iMatches = 0;
            var mHuMatches = {};

            if (!sMaterialKey) {
                return { matches: 0, huCount: 0 };
            }

            (aPreview || []).forEach(function (oRow) {
                if (!this._isHU(oRow)) {
                    return;
                }

                this._getHuMaterialEntries(oRow).forEach(
                    function (oDetail) {
                        if (
                            this._getMaterialSelectionKey(
                                oDetail.Matnr
                            ) !== sMaterialKey
                        ) {
                            return;
                        }

                        oDetail.MaterialSelected = bSelected;
                        iMatches++;
                        mHuMatches[this._getHuKey(oRow)] = true;
                    }.bind(this)
                );
            }.bind(this));

            return {
                matches: iMatches,
                huCount: Object.keys(mHuMatches).length
            };
        },

        _setHuMaterialSelection: function (
            aPreview,
            sPreviewPath,
            bSelected
        ) {
            var oTargetRow = null;
            var mMatDocScopes = {};
            var iMatches = 0;
            var mHuMatches = {};

            (aPreview || []).some(function (oRow, iIndex) {
                if (
                    this._isHU(oRow) &&
                    "/preview/" + iIndex === sPreviewPath
                ) {
                    oTargetRow = oRow;
                    return true;
                }

                return false;
            }.bind(this));

            if (!oTargetRow) {
                return { materialCount: 0, matches: 0, huCount: 0 };
            }

            this._getHuMaterialEntries(oTargetRow).forEach(
                function (oDetail) {
                    var sScopeKey =
                        this._getEccMatDocSelectionKey(oDetail);

                    if (
                        sScopeKey &&
                        oDetail.MaterialSelectable !== false
                    ) {
                        mMatDocScopes[sScopeKey] = {
                            GrMatDoc: oDetail.GrMatDoc,
                            GrYear: oDetail.GrYear
                        };
                    }
                }.bind(this)
            );

            Object.keys(mMatDocScopes).forEach(
                function (sScopeKey) {
                    var oScope = mMatDocScopes[sScopeKey];
                    var oResult = this._setMaterialSelectionByMatDoc(
                        aPreview,
                        oScope.GrMatDoc,
                        oScope.GrYear,
                        bSelected
                    );

                    iMatches += oResult.matches;

                    if (oResult.huCount) {
                        (aPreview || []).forEach(function (oRow) {
                            if (!this._isHU(oRow)) {
                                return;
                            }

                            var bHasScope =
                                this._getHuMaterialEntries(oRow).some(
                                    function (oDetail) {
                                        return this._getEccMatDocSelectionKey(
                                            oDetail
                                        ) === sScopeKey;
                                    }.bind(this)
                                );

                            if (bHasScope) {
                                mHuMatches[this._getHuKey(oRow)] = true;
                            }
                        }.bind(this));
                    }
                }.bind(this)
            );

            return {
                materialCount: Object.keys(mMatDocScopes).length,
                matches: iMatches,
                huCount: Object.keys(mHuMatches).length
            };
        },

        _buildHuFlowOptions: function (oRow, sPreviewPath) {
            var mSelectedKeys = {};

            (oRow.selectedProviders || []).forEach(function (oProvider) {
                if (oProvider && oProvider.providerKey) {
                    mSelectedKeys[oProvider.providerKey] = true;
                }
            });

            return (oRow.providerOptions || []).map(
                function (oOption, iOptionIndex) {
                    var aRawDetails = Array.isArray(oOption.itemDetails) &&
                        oOption.itemDetails.length
                        ? oOption.itemDetails
                        : [oOption];
                    var aMaterialDetails =
                        this._buildMaterialDetails(
                            aRawDetails,
                            {
                                sourceBasePath: sPreviewPath +
                                    "/providerOptions/" +
                                    iOptionIndex +
                                    "/itemDetails",
                                Ebeln: oOption.Ebeln || ""
                            }
                        );

                    return Object.assign({}, oOption, {
                        HuPreviewPath: sPreviewPath,
                        HuSelected: oRow.HuSelected === true,
                        FlowPosition: iOptionIndex + 1,
                        MaterialExpanded:
                            oOption.MaterialExpanded === true,
                        selected: oRow.HuSelected === true &&
                            !!mSelectedKeys[oOption.providerKey],
                        MaterialDetails: aMaterialDetails,
                        MaterialCountText:
                            aMaterialDetails.length === 1
                                ? "1 material"
                                : aMaterialDetails.length + " materiales"
                    });
                }.bind(this)
            );
        },

        _buildPreviewDisplayRows: function (aPreview, mExpandedGroups) {
            var aGroupOrder = [];
            var mGroups = {};
            var aDisplayRows = [];

            (aPreview || []).forEach(function (oRow, iPreviewIndex) {
                // La vista operativa parte exclusivamente de las HU.
                // Los demas objetos siguen disponibles en /preview y en
                // el resumen, pero no compiten con el flujo seleccionable.
                if (!this._isHU(oRow)) {
                    return;
                }

                var sGroupKey = this._getObjectGroupKey(oRow);

                if (!mGroups[sGroupKey]) {
                    mGroups[sGroupKey] = [];
                    aGroupOrder.push(sGroupKey);
                }

                mGroups[sGroupKey].push({
                    row: oRow,
                    previewIndex: iPreviewIndex
                });
            }.bind(this));

            aGroupOrder.forEach(function (sGroupKey) {
                var aGroupRows = mGroups[sGroupKey];
                var mDocumentNumbers = {};
                var aDocumentNumbers = [];
                var aDocumentRows = [];
                var bExpanded = !!(
                    mExpandedGroups &&
                    mExpandedGroups[sGroupKey]
                );

                aGroupRows.forEach(function (oEntry) {
                    var sDocumentNumber =
                        this._getRowDocumentNumber(oEntry.row);
                    var sDocumentKey = sDocumentNumber ||
                        "ROW_" + oEntry.previewIndex;

                    if (
                        !mDocumentNumbers[sDocumentKey]
                    ) {
                        mDocumentNumbers[sDocumentKey] = true;
                        aDocumentRows.push(oEntry);

                        if (sDocumentNumber) {
                            aDocumentNumbers.push(sDocumentNumber);
                        }
                    }
                }.bind(this));

                var bCanExpand = aDocumentNumbers.length > 0;
                var oGroupEntry = aDocumentRows[0];
                var iDocumentCount = aDocumentRows.length;
                var sGroupCountText = "";
                var sGroupToggleTooltip = "Ocultar HU";

                if (!bCanExpand) {
                    aDisplayRows.push(Object.assign(
                        {},
                        oGroupEntry.row,
                        {
                            PreviewPath:
                                "/preview/" +
                                oGroupEntry.previewIndex,
                            GroupKey: sGroupKey,
                            GroupItemCount: 0,
                            CanExpand: false,
                            Expanded: false,
                            IsGroupHeader: false,
                            IsChildRow: false
                        }
                    ));
                    return;
                }

                if (this._isHU(oGroupEntry.row)) {
                    sGroupCountText = iDocumentCount === 1
                        ? "1 HU"
                        : iDocumentCount + " HU";
                } else {
                    sGroupCountText = iDocumentCount === 1
                        ? "1 documento"
                        : iDocumentCount + " documentos";
                }

                if (!bExpanded) {
                    sGroupToggleTooltip = iDocumentCount === 1
                        ? "Mostrar 1 HU"
                        : "Mostrar " + iDocumentCount + " HU";
                }

                aDisplayRows.push(Object.assign({}, oGroupEntry.row, {
                    PreviewPath:
                        "/preview/" + oGroupEntry.previewIndex,
                    GroupKey: sGroupKey,
                    GroupItemCount: iDocumentCount,
                    CanExpand: true,
                    Expanded: bExpanded,
                    IsGroupHeader: true,
                    IsChildRow: false,
                    GroupPosition: 0,
                    GroupCountText: sGroupCountText,
                    GroupDocumentsText: bExpanded
                        ? "Ocultar HU"
                        : "Ver HU disponibles",
                    GroupToggleTooltip: sGroupToggleTooltip,
                    DisplayReference1: "",
                    DisplayReference2: "",
                    FlowOptions: [],
                    ProviderSummaries: [],
                    PurchaseOrderSummaries: [],
                    DisplayStatusText:
                        this._getGroupStatusText(
                            aDocumentRows,
                            oGroupEntry.row
                        ),
                    DisplayStatusState:
                        this._getGroupStatusState(
                            aDocumentRows,
                            oGroupEntry.row
                        )
                }));

                if (!bExpanded) {
                    return;
                }

                aDocumentRows.forEach(function (oEntry, iGroupIndex) {
                    var sPreviewPath =
                        "/preview/" + oEntry.previewIndex;
                    var aHuMaterialDetails =
                        this._buildMaterialDetails(
                            oEntry.row.huMaterialDetails || [],
                            {
                                sourceBasePath: sPreviewPath +
                                    "/huMaterialDetails"
                            }
                        );
                    var aAllHuMaterials =
                        this._getHuMaterialEntries(oEntry.row);
                    var iSelectedHuMaterials =
                        aAllHuMaterials.filter(function (oDetail) {
                            return oDetail.MaterialSelected === true;
                        }).length;
                    var bCanExpandHuFlow =
                        this._isHU(oEntry.row) &&
                        (
                            (oEntry.row.providerOptions || []).length > 0 ||
                            aHuMaterialDetails.length > 0
                        );
                    var bHuFlowExpanded =
                        oEntry.row.HuFlowExpanded === true;

                    aDisplayRows.push(Object.assign({}, oEntry.row, {
                        PreviewPath: sPreviewPath,
                        GroupKey: sGroupKey,
                        GroupItemCount: aDocumentRows.length,
                        CanExpand: false,
                        Expanded: false,
                        IsGroupHeader: false,
                        IsChildRow: true,
                        GroupPosition: iGroupIndex + 1,
                        CanExpandHuFlow: bCanExpandHuFlow,
                        HuFlowExpanded: bHuFlowExpanded,
                        HuFlowToggleTooltip: bHuFlowExpanded
                            ? "Ocultar detalle de esta HU"
                            : "Mostrar detalle de esta HU",
                        HuMaterialSelected:
                            aAllHuMaterials.length > 0 &&
                            iSelectedHuMaterials ===
                                aAllHuMaterials.length,
                        HuMaterialPartiallySelected:
                            iSelectedHuMaterials > 0 &&
                            iSelectedHuMaterials <
                                aAllHuMaterials.length,
                        HasHuMaterialDetails:
                            aHuMaterialDetails.length > 0,
                        HuMaterialDetails: aHuMaterialDetails,
                        HuMaterialCountText:
                            aHuMaterialDetails.length === 1
                                ? "1 material sin pedido"
                                : aHuMaterialDetails.length +
                                    " materiales sin pedido",
                        GroupCountText: "",
                        GroupDocumentsText: "",
                        FlowOptions: this._isHU(oEntry.row)
                            ? this._buildHuFlowOptions(
                                oEntry.row,
                                sPreviewPath
                            )
                            : []
                    }));
                }.bind(this));
            }.bind(this));

            return aDisplayRows;
        },

        _getGroupStatusText: function (aDocumentRows, oFallbackRow) {
            if (!this._isHU(oFallbackRow)) {
                return oFallbackRow.DisplayStatusText;
            }

            if (this._isMatDocOnlyMode()) {
                return oFallbackRow.DisplayStatusText || "Encontrado";
            }

            var aHuRows = (aDocumentRows || []).map(function (oEntry) {
                return oEntry.row;
            });

            var aSelectedHu = aHuRows.filter(function (oRow) {
                return oRow.HuSelected === true;
            });

            if (aHuRows.length > 1 && !aSelectedHu.length) {
                return "Selecciona una o varias HU";
            }

            if (aHuRows.length > 1) {
                var bHasPendingOrders = aSelectedHu.some(
                    function (oRow) {
                        return oRow.providerSelectionRequired &&
                            !(oRow.selectedProviders || []).length;
                    }
                );
                var sSelectedText = aSelectedHu.length === 1
                    ? "1 HU seleccionada"
                    : aSelectedHu.length + " HU seleccionadas";

                return bHasPendingOrders
                    ? sSelectedText + " · pedidos pendientes"
                    : sSelectedText;
            }

            return (aSelectedHu[0] || oFallbackRow).DisplayStatusText;
        },

        _getGroupStatusState: function (aDocumentRows, oFallbackRow) {
            if (!this._isHU(oFallbackRow)) {
                return oFallbackRow.DisplayStatusState;
            }

            if (this._isMatDocOnlyMode()) {
                return oFallbackRow.DisplayStatusState || "Success";
            }

            var aHuRows = (aDocumentRows || []).map(function (oEntry) {
                return oEntry.row;
            });

            var aSelectedHu = aHuRows.filter(function (oRow) {
                return oRow.HuSelected === true;
            });

            if (aHuRows.length > 1 && !aSelectedHu.length) {
                return "Warning";
            }

            if (aSelectedHu.some(function (oRow) {
                return oRow.providerSelectionRequired &&
                    !(oRow.selectedProviders || []).length;
            })) {
                return "Warning";
            }

            return aHuRows.length > 1
                ? "Success"
                : (aSelectedHu[0] || oFallbackRow).DisplayStatusState;
        },

        _refreshPreviewDisplay: function () {
            var oVM = this.getVM();
            var aPreview = oVM.getProperty("/preview") || [];
            var mExpandedGroups =
                oVM.getProperty("/expandedPreviewGroups") || {};

            oVM.setProperty(
                "/previewDisplay",
                this._buildPreviewDisplayRows(
                    aPreview,
                    mExpandedGroups
                )
            );
        },

        onTogglePreviewGroup: function (oEvent) {
            var oContext = oEvent
                .getSource()
                .getBindingContext("viewModel");
            var oDisplayRow = oContext && oContext.getObject();

            if (!oDisplayRow || !oDisplayRow.GroupKey) {
                return;
            }

            var oVM = this.getVM();
            var mExpandedGroups = Object.assign(
                {},
                oVM.getProperty("/expandedPreviewGroups") || {}
            );

            mExpandedGroups[oDisplayRow.GroupKey] =
                !mExpandedGroups[oDisplayRow.GroupKey];

            oVM.setProperty(
                "/expandedPreviewGroups",
                mExpandedGroups
            );
            this._refreshPreviewDisplay();
        },

        onToggleHuFlow: function (oEvent) {
            var oContext = oEvent
                .getSource()
                .getBindingContext("viewModel");
            var oDisplayRow = oContext && oContext.getObject();
            var sPreviewPath = oDisplayRow && oDisplayRow.PreviewPath;

            if (!sPreviewPath) {
                return;
            }

            var oVM = this.getVM();
            var aPreview = oVM.getProperty("/preview") || [];

            if (this._updateHuFlowExpansion(
                aPreview,
                sPreviewPath,
                !oDisplayRow.HuFlowExpanded
            )) {
                oVM.setProperty("/preview", aPreview);
                this._refreshPreviewDisplay();
            }
        },

        _updateHuFlowExpansion: function (
            aPreview,
            sPreviewPath,
            bExpanded
        ) {
            var bUpdated = false;

            (aPreview || []).forEach(function (oRow, iIndex) {
                if (
                    !this._isHU(oRow) ||
                    "/preview/" + iIndex !== sPreviewPath
                ) {
                    return;
                }

                oRow.HuFlowExpanded = bExpanded;
                bUpdated = true;
            }.bind(this));

            return bUpdated;
        },

        onSelectHu: function (oEvent) {
            var oContext = oEvent
                .getSource()
                .getBindingContext("viewModel");
            var oDisplayRow = oContext && oContext.getObject();
            var sSelectedPath =
                oDisplayRow && oDisplayRow.PreviewPath;
            var bSelected = oEvent.getParameter("selected") !== false;

            if (!sSelectedPath) {
                return;
            }

            var oVM = this.getVM();
            var aPreview = oVM.getProperty("/preview") || [];

            if (oVM.getProperty("/matDocOnlyMode") === true) {
                var oMaterialResult = this._setHuMaterialSelection(
                    aPreview,
                    sSelectedPath,
                    bSelected
                );

                if (!oMaterialResult.materialCount) {
                    MessageToast.show(
                        "Esta HU no contiene números de material para seleccionar."
                    );
                    return;
                }

                var iSelectedMaterials =
                    this._getSelectedMaterials(aPreview).length;

                oVM.setProperty("/preview", aPreview);
                oVM.setProperty(
                    "/materialSelectionCount",
                    iSelectedMaterials
                );
                this._refreshPreviewDisplay();
                this._evaluatePreviewBeforeCancel(aPreview);

                MessageToast.show(
                    bSelected
                        ? oMaterialResult.materialCount +
                            " MatDoc seleccionado; se marcaron todas sus posiciones en " +
                            oMaterialResult.huCount + " HU."
                        : "Se eliminó la selección completa del MatDoc de esta HU."
                );
                return;
            }

            // FLUJO ANTERIOR CONSERVADO: selección de HU y pedidos.
            var bUpdated = this._updateHuSelection(
                aPreview,
                sSelectedPath,
                bSelected
            );

            if (!bUpdated) {
                return;
            }

            oVM.setProperty("/preview", aPreview);
            this._refreshPreviewDisplay();
            this._updateSummary(aPreview);
            this._evaluatePreviewBeforeCancel(aPreview);

            var iSelectedHu = aPreview.filter(function (oRow) {
                return this._isHU(oRow) && oRow.HuSelected === true;
            }.bind(this)).length;

            MessageToast.show(bSelected
                ? iSelectedHu === 1
                    ? "1 HU seleccionada."
                    : iSelectedHu + " HU seleccionadas."
                    : "Selección de HU eliminada."
            );
        },

        onSelectAllHu: function () {
            var oVM = this.getVM();

            if (oVM.getProperty("/busy")) {
                return;
            }

            var aPreview = oVM.getProperty("/preview") || [];
            var iSelectedHu = this._selectAllHuRows(aPreview);

            if (!iSelectedHu) {
                MessageToast.show("No hay HU disponibles para seleccionar.");
                return;
            }

            oVM.setProperty("/preview", aPreview);
            this._refreshPreviewDisplay();
            this._updateSummary(aPreview);
            this._evaluatePreviewBeforeCancel(aPreview);

            MessageToast.show(
                iSelectedHu === 1
                    ? "1 HU seleccionada con todos sus pedidos."
                    : iSelectedHu +
                        " HU seleccionadas con todos sus pedidos."
            );
        },

        _selectAllHuRows: function (aPreview) {
            var iSelectedHu = 0;

            (aPreview || []).forEach(function (oRow, iIndex) {
                if (!this._isHU(oRow)) {
                    return;
                }

                if (this._updateHuSelection(
                    aPreview,
                    "/preview/" + iIndex,
                    true
                )) {
                    iSelectedHu++;
                }
            }.bind(this));

            return iSelectedHu;
        },

        _updateHuSelection: function (
            aPreview,
            sSelectedPath,
            bSelected
        ) {
            var bUpdated = false;

            (aPreview || []).forEach(function (oRow, iIndex) {
                if (
                    !this._isHU(oRow) ||
                    "/preview/" + iIndex !== sSelectedPath
                ) {
                    return;
                }

                oRow.HuSelected = bSelected;
                if (bSelected) {
                    oRow.HuFlowExpanded = true;
                }

                // La HU funciona como selector maestro: al activarla se
                // incluyen todos sus pedidos; al desactivarla se limpian.
                // Después, cada pedido puede ajustarse individualmente.
                this._applySelectedProvidersToRow(
                    oRow,
                    bSelected ? (oRow.providerOptions || []) : []
                );
                bUpdated = true;
            }.bind(this));

            return bUpdated;
        },

        onInlineOrderSelection: function (oEvent) {
            var oContext = oEvent
                .getSource()
                .getBindingContext("viewModel");
            var oFlowOption = oContext && oContext.getObject();
            var sRowPath = oFlowOption &&
                oFlowOption.HuPreviewPath;
            var bSelected = oEvent.getParameter("selected") !== false;

            if (!sRowPath || !oFlowOption.providerKey) {
                return;
            }

            var oVM = this.getVM();
            var oRow = oVM.getProperty(sRowPath);

            if (!oRow) {
                return;
            }

            // Permite elegir directamente un pedido. La HU se activa de
            // forma automática, pero las demás opciones permanecen libres
            // para que el usuario decida si selecciona una o varias.
            if (bSelected && !oRow.HuSelected) {
                oRow.HuSelected = true;
                oRow.HuFlowExpanded = true;
            }

            var mSelectedKeys = {};

            (oRow.selectedProviders || []).forEach(function (oProvider) {
                if (oProvider && oProvider.providerKey) {
                    mSelectedKeys[oProvider.providerKey] = true;
                }
            });

            if (bSelected) {
                mSelectedKeys[oFlowOption.providerKey] = true;
            } else {
                delete mSelectedKeys[oFlowOption.providerKey];
            }

            var aSelectedProviders = (oRow.providerOptions || [])
                .filter(function (oProvider) {
                    return !!mSelectedKeys[oProvider.providerKey];
                });

            oRow.providerOptions.forEach(function (oProvider) {
                oProvider.selected =
                    !!mSelectedKeys[oProvider.providerKey];

                if (
                    bSelected &&
                    oProvider.providerKey ===
                        oFlowOption.providerKey
                ) {
                    oProvider.MaterialExpanded = true;
                }
            });

            this._applySelectedProvidersToRow(
                oRow,
                aSelectedProviders
            );

            oVM.setProperty(sRowPath, oRow);

            var aPreview = oVM.getProperty("/preview") || [];

            this._refreshPreviewDisplay();
            this._updateSummary(aPreview);
            this._evaluatePreviewBeforeCancel(aPreview);

            MessageToast.show(
                aSelectedProviders.length === 1
                    ? "1 pedido seleccionado para esta HU."
                    : aSelectedProviders.length +
                        " pedidos seleccionados para esta HU."
            );
        },

        onSelectMaterial: function (oEvent) {
            var oContext = oEvent
                .getSource()
                .getBindingContext("viewModel");
            var oMaterial = oContext && oContext.getObject();
            var sSourcePath = oMaterial &&
                oMaterial.MaterialSourcePath;
            var bSelected =
                oEvent.getParameter("selected") !== false;

            if (!sSourcePath) {
                return;
            }

            var oVM = this.getVM();
            var aPreview = oVM.getProperty("/preview") || [];

            var oSourceMaterial = oVM.getProperty(sSourcePath);

            if (
                !oSourceMaterial ||
                oSourceMaterial.MaterialSelectable !== true
            ) {
                MessageToast.show(
                    "Esta fila es auxiliar y no puede seleccionarse manualmente."
                );
                this._refreshPreviewDisplay();
                return;
            }

            // CONTRATO UI: cada mercancía se selecciona de forma
            // individual. No se propaga por MatDoc, material, lote, HU o pedido.
            oVM.setProperty(
                sSourcePath + "/MaterialSelected",
                bSelected
            );
            oVM.setProperty(
                sSourcePath + "/PositionAction",
                bSelected ? "ANULAR" : "CONSERVAR"
            );
            oVM.setProperty(
                sSourcePath + "/PositionActionText",
                bSelected ? "Anular" : "Conservar"
            );
            oVM.setProperty(
                sSourcePath + "/PositionActionState",
                bSelected ? "Error" : "Success"
            );

            oVM.setProperty(
                "/preview",
                aPreview
            );

            var oSelectionSummary =
                this._applyContractSelectionRules(aPreview);
            oVM.setProperty("/eccPlan", oSelectionSummary);

            var aSelectedMaterials =
                this._getSelectedMaterials(aPreview);
            var iSelectedMaterials = aSelectedMaterials.length;

            if (aSelectedMaterials.length) {
                try {
                    this._debugEccTraffic(
                        "POST PROFUNDO - VISTA PREVIA (NO ENVIADO)",
                        {
                            endpoint: "/AnulacionPreviewHeaderSet",
                            payload: this._buildDeepAnulacionPayload(
                                oVM.getProperty("/matDoc"),
                                aSelectedMaterials,
                                oVM.getProperty("/previewItems") || [],
                                oVM.getProperty("/previewHeader") || {},
                                oVM.getProperty("/matYear")
                            )
                        },
                        aSelectedMaterials
                    );
                } catch (oPreviewPayloadError) {
                    this._logWarn(
                        "onSelectMaterial.payloadPreview",
                        "La selección todavía no forma un payload profundo válido.",
                        {
                            error: oPreviewPayloadError.message,
                            selections: aSelectedMaterials
                        }
                    );
                }
            }

            oVM.setProperty(
                "/materialSelectionCount",
                iSelectedMaterials
            );
            this._refreshPreviewDisplay();
            this._evaluatePreviewBeforeCancel(aPreview);

            MessageToast.show(
                bSelected
                    ? "Posición " +
                        (oMaterial.Zeile || "-") +
                        " marcada para ANULAR."
                    : "Posición " +
                        (oMaterial.Zeile || "-") +
                        " marcada para CONSERVAR."
            );
        },

        onToggleOrderMaterials: function (oEvent) {
            var oContext = oEvent
                .getSource()
                .getBindingContext("viewModel");
            var oFlowOption = oContext && oContext.getObject();
            var sPreviewPath = oFlowOption &&
                oFlowOption.HuPreviewPath;

            if (
                !sPreviewPath ||
                !oFlowOption.providerKey
            ) {
                return;
            }

            var oVM = this.getVM();
            var aPreview = oVM.getProperty("/preview") || [];

            if (this._updateOrderMaterialExpansion(
                aPreview,
                sPreviewPath,
                oFlowOption.providerKey,
                !oFlowOption.MaterialExpanded
            )) {
                oVM.setProperty("/preview", aPreview);
                this._refreshPreviewDisplay();
            }
        },

        _updateOrderMaterialExpansion: function (
            aPreview,
            sPreviewPath,
            sProviderKey,
            bExpanded
        ) {
            var bUpdated = false;

            (aPreview || []).forEach(function (oRow, iIndex) {
                if (
                    !this._isHU(oRow) ||
                    "/preview/" + iIndex !== sPreviewPath
                ) {
                    return;
                }

                (oRow.providerOptions || []).forEach(
                    function (oProvider) {
                        if (
                            oProvider.providerKey !==
                                sProviderKey
                        ) {
                            return;
                        }

                        oProvider.MaterialExpanded = bExpanded;
                        bUpdated = true;
                    }
                );
            }.bind(this));

            return bUpdated;
        },

        _decoratePreviewRow: function (oRow) {
            var aRelatedReferences = [];

            oRow.IsHU = this._isHU(oRow);
            oRow.DisplayIcon = this._getObjectIcon(oRow.Message);
            oRow.DisplayStatusText = this._getPreviewStatusText(oRow);
            oRow.DisplayStatusState = this._getPreviewStatusState(oRow);
            oRow.DisplayReference1 = this._isHU(oRow)
                ? (oRow.HuExidv || "")
                : (oRow.MatDoc || oRow.ObjKey1 || "");
            oRow.DisplayReference1Short =
                this._getLastTenDigits(
                    oRow.DisplayReference1
                );

            [oRow.ObjKey1, oRow.ObjKey2, oRow.ObjKey3]
                .forEach(function (sReference) {
                    var sCleanReference =
                        String(sReference || "").trim();

                    if (
                        sCleanReference &&
                        sCleanReference !== oRow.DisplayReference1 &&
                        aRelatedReferences.indexOf(sCleanReference) < 0
                    ) {
                        aRelatedReferences.push(sCleanReference);
                    }
                });

            oRow.DisplayReference2 = this._isHU(oRow)
                ? (oRow.HuVenum || "")
                : aRelatedReferences.join(" · ");
        },

        _getObjectIcon: function (sMessage) {
            var sValue = String(sMessage || "")
                .trim()
                .toUpperCase();

            if (sValue === "HU") {
                return "sap-icon://product";
            }

            if (
                sValue.indexOf("DOCUMENTO") >= 0 &&
                sValue.indexOf("MATERIAL") >= 0
            ) {
                return "sap-icon://document-text";
            }

            if (sValue.indexOf("PEDIDO DE COMPRA") >= 0) {
                return "sap-icon://cart";
            }

            if (
                sValue.indexOf("PEDIDO DE VENTA") >= 0 ||
                sValue.indexOf("PEDIDO DE VENTAS") >= 0
            ) {
                return "sap-icon://sales-order";
            }

            if (
                sValue.indexOf("ENTREGA") >= 0 ||
                sValue.indexOf("TRANSPORTE") >= 0
            ) {
                return "sap-icon://shipping-status";
            }

            if (
                sValue.indexOf("NO ENCONTRADO") >= 0 ||
                sValue.indexOf("NO ENCONTRADA") >= 0 ||
                sValue.indexOf("SIN TRANSPORTE") >= 0
            ) {
                return "sap-icon://message-warning";
            }

            return "sap-icon://document";
        },

        _getPreviewStatusText: function (oRow) {
            var sMessage = String(oRow.Message || "")
                .trim()
                .toUpperCase();

            if (oRow.Status === "E") {
                return "Error";
            }

            if (oRow.Status === "W") {
                return "Advertencia";
            }

            if (this._isMatDocOnlyMode() && this._isHU(oRow)) {
                return "Encontrado";
            }

            if (
                this._isHU(oRow) &&
                oRow.HuSelectionRequired &&
                !oRow.HuSelected
            ) {
                return "Disponible";
            }

            if (
                this._isHU(oRow) &&
                oRow.HuSelectionRequired &&
                oRow.HuSelected &&
                !oRow.providerSelectionRequired
            ) {
                return "HU seleccionada";
            }

            if (
                this._isHU(oRow) &&
                oRow.providerSelectionRequired &&
                !(oRow.selectedProviders && oRow.selectedProviders.length)
            ) {
                return "Selección requerida";
            }

            if (
                sMessage.indexOf("NO ENCONTRADO") >= 0 ||
                sMessage.indexOf("NO ENCONTRADA") >= 0
            ) {
                return "No encontrado";
            }

            if (sMessage.indexOf("SIN TRANSPORTE") >= 0) {
                return "No aplica";
            }

            return "Encontrado";
        },

        _getPreviewStatusState: function (oRow) {
            var sMessage = String(oRow.Message || "")
                .trim()
                .toUpperCase();

            if (oRow.Status === "E") {
                return "Error";
            }

            if (oRow.Status === "W") {
                return "Warning";
            }

            if (this._isMatDocOnlyMode() && this._isHU(oRow)) {
                return "Success";
            }

            if (
                this._isHU(oRow) &&
                oRow.HuSelectionRequired &&
                !oRow.HuSelected
            ) {
                return "Information";
            }

            if (
                this._isHU(oRow) &&
                oRow.HuSelectionRequired &&
                oRow.HuSelected &&
                !oRow.providerSelectionRequired
            ) {
                return "Success";
            }

            if (
                this._isHU(oRow) &&
                oRow.providerSelectionRequired &&
                !(oRow.selectedProviders && oRow.selectedProviders.length)
            ) {
                return "Warning";
            }

            if (
                sMessage.indexOf("NO ENCONTRADO") >= 0 ||
                sMessage.indexOf("NO ENCONTRADA") >= 0
            ) {
                return "Warning";
            }

            if (sMessage.indexOf("SIN TRANSPORTE") >= 0) {
                return "None";
            }

            return "Success";
        },

        _applySelectedProvidersToRow: function (oRow, aProviders) {
            var aSelectedProviders = (aProviders || []).map(function (oProvider) {
                return Object.assign({}, oProvider, {
                    selected: true
                });
            });
            var mSelectedProviderKeys = {};

            aSelectedProviders.forEach(function (oProvider) {
                if (oProvider.providerKey) {
                    mSelectedProviderKeys[oProvider.providerKey] = true;
                }
            });

            (oRow.providerOptions || []).forEach(function (oProvider) {
                oProvider.selected =
                    !!mSelectedProviderKeys[oProvider.providerKey];
            });

            var oFirstProvider = aSelectedProviders.length
                ? aSelectedProviders[0]
                : null;

            oRow.selectedProviders = aSelectedProviders;

            // Compatibilidad con la lógica/vista anterior:
            // selectedProvider conserva el primer proveedor seleccionado.
            oRow.selectedProvider = oFirstProvider
                ? Object.assign({}, oFirstProvider)
                : null;

            oRow.Lifnr = oFirstProvider
                ? (oFirstProvider.Lifnr || "")
                : "";

            oRow.Name1 = oFirstProvider
                ? (oFirstProvider.Name1 || "")
                : "";

            oRow.Ebeln = oFirstProvider
                ? (oFirstProvider.Ebeln || "")
                : "";

            oRow.SelectedProviderCount = aSelectedProviders.length;

            oRow.SelectedProviderText = aSelectedProviders.length
                ? aSelectedProviders.map(function (oProvider) {
                    return [
                        oProvider.Lifnr || "",
                        oProvider.Name1 || "",
                        oProvider.Ebeln || ""
                    ].filter(Boolean).join(" - ");
                }).join(" | ")
                : "";

            var bRequiresProvider =
                oRow.MultiProveedor === "X" ||
                Number(oRow.SelectionOptionCount || 0) > 1 ||
                (oRow.providerOptions || []).length > 1;

            oRow.providerSelectionRequired =
                bRequiresProvider &&
                aSelectedProviders.length === 0;

            this._decoratePreviewRow(oRow);
        },

        _updateSummary: function (aItems) {
            var iHU = 0;
            var iMaterial = 0;
            var iOtros = 0;
            var iTotal = 0;
            var iHuPendientes = 0;
            var aHuItems = (aItems || []).filter(function (oItem) {
                return this._isHU(oItem);
            }.bind(this));
            var iSelectedHu = aHuItems.filter(function (oItem) {
                return oItem.HuSelected === true;
            }).length;
            var bHuSelectionPending =
                aHuItems.length > 0 && iSelectedHu === 0;

            (aItems || []).forEach(function (oItem) {
                var sMessage = String(oItem.Message || "")
                    .trim()
                    .toUpperCase();

                var bInformative =
                    sMessage.indexOf("NO ENCONTRADO") >= 0 ||
                    sMessage.indexOf("NO ENCONTRADA") >= 0 ||
                    sMessage.indexOf("SIN TRANSPORTE") >= 0;

                var bHasObject =
                    !!oItem.MatDoc ||
                    !!oItem.ObjTipo ||
                    !!oItem.ObjKey1 ||
                    !!oItem.ObjKey2 ||
                    !!oItem.HuVenum ||
                    !!oItem.HuExidv;

                if (!bHasObject || bInformative) {
                    return;
                }

                iTotal++;

                if (this._isHU(oItem)) {
                    iHU++;

                    if (
                        (
                            !oItem.HuSelectionRequired ||
                            oItem.HuSelected
                        ) &&
                        oItem.providerSelectionRequired &&
                        !(oItem.selectedProviders && oItem.selectedProviders.length)
                    ) {
                        iHuPendientes++;
                    }
                } else if (
                    sMessage.indexOf("DOCUMENTO DEL MATERIAL") >= 0 ||
                    sMessage.indexOf("DOCUMENTO MATERIAL") >= 0
                ) {
                    iMaterial++;
                } else {
                    iOtros++;
                }
            }.bind(this));

            // RETORNO AL FLUJO ANTERIOR:
            // al cambiar /matDocOnlyMode a false se vuelven a calcular
            // las selecciones y pendientes de HU/pedido como antes.
            if (this._isMatDocOnlyMode()) {
                iSelectedHu = iHU;
                iHuPendientes = 0;
                bHuSelectionPending = false;
            }

            this.getVM().setProperty("/summary", {
                total: iTotal,
                hu: iHU,
                material: iMaterial,
                otros: iOtros,
                huSeleccionadas: iSelectedHu,
                huPendientes:
                    iHuPendientes +
                    (bHuSelectionPending ? 1 : 0),
                huSelectionPending:
                    bHuSelectionPending ? 1 : 0
            });

            var oPreviewHeader = this.getVM().getProperty(
                "/previewHeader"
            );
            var aPreviewItems = this.getVM().getProperty(
                "/previewItems"
            );

            if (
                oPreviewHeader &&
                oPreviewHeader.MatDoc &&
                Array.isArray(aPreviewItems)
            ) {
                this._updateDeepPreviewSummary(
                    oPreviewHeader,
                    aPreviewItems
                );
            }
        },

        _updateDeepPreviewSummary: function (oHeader, aItems) {
            var oSummary = Object.assign(
                {},
                this.getVM().getProperty("/summary") || {}
            );
            var mMaterialDocuments = {};
            var mRelatedDocuments = {};

            (aItems || []).forEach(function (oItem) {
                var sMaterialDocument = String(
                    oItem.GrMatDoc || ""
                ).trim();

                if (sMaterialDocument) {
                    mMaterialDocuments[sMaterialDocument] = true;
                }

                [
                    oItem.Ebeln,
                    oItem.SoVbeln,
                    oItem.DelivVbeln
                ].forEach(function (vDocument) {
                    var sDocument = String(vDocument || "").trim();

                    if (sDocument) {
                        mRelatedDocuments[sDocument] = true;
                    }
                });
            });

            oSummary.hu = Number(oHeader.HuCount) || oSummary.hu || 0;
            oSummary.material = Object.keys(mMaterialDocuments).length;
            oSummary.otros = Object.keys(mRelatedDocuments).length;
            oSummary.total =
                oSummary.hu +
                oSummary.material +
                oSummary.otros;

            this.getVM().setProperty("/summary", oSummary);
        },

        _evaluatePreviewBeforeCancel: function (aResults) {
            var oVM = this.getVM();
            var bMatDocOnlyMode =
                oVM.getProperty("/matDocOnlyMode") === true;
            var bPrevalidationOnly =
                oVM.getProperty("/backendPrevalidationOnly") === true;
            var bHasErrors = (aResults || []).some(function (oItem) {
                return oItem.Status === "E";
            });
            var aHuRows = (aResults || []).filter(function (oItem) {
                return this._isHU(oItem);
            }.bind(this));
            var aSelectedHu = aHuRows.filter(function (oItem) {
                return !oItem.HuSelectionRequired ||
                    oItem.HuSelected === true;
            });
            var bHuSelectionPending = aHuRows.length > 0 &&
                !aSelectedHu.length;
            var bProviderSelectionPending = aSelectedHu.some(
                function (oItem) {
                    return oItem.providerSelectionRequired &&
                        !(oItem.selectedProviders || []).length;
                }
            );

            if (bHasErrors) {
                oVM.setProperty("/resultado", {
                    Status: "E",
                    Message:
                        "La vista previa contiene errores. Revisa el detalle antes de anular."
                });

                oVM.setProperty("/resultadoState", "Error");
                oVM.setProperty("/canCancel", false);
                return;
            }

            if (bPrevalidationOnly) {
                oVM.setProperty("/canCancel", false);
                oVM.setProperty("/resultado", {
                    Status: "W",
                    Message:
                        "ECC está en fase de prevalidación. La consulta puede revisarse, pero la anulación real permanece bloqueada."
                });
                oVM.setProperty("/resultadoState", "Warning");
                return;
            }

            if (
                bMatDocOnlyMode &&
                oVM.getProperty("/backendPlanValidated") !== true
            ) {
                oVM.setProperty("/canCancel", false);
                oVM.setProperty("/resultado", {
                    Status: "W",
                    Message:
                        "ECC no confirmó el plan completo del documento material."
                });
                oVM.setProperty("/resultadoState", "Warning");
                return;
            }

            if (bMatDocOnlyMode) {
                var aSelectedMaterials =
                    this._getSelectedMaterials(aResults);
                var iSelectedMaterials = aSelectedMaterials.length;

                oVM.setProperty(
                    "/materialSelectionCount",
                    iSelectedMaterials
                );

                if (!iSelectedMaterials) {
                    oVM.setProperty("/resultado", {
                        Status: "W",
                        Message:
                            "ECC no confirmó posiciones del MatDoc para continuar."
                    });
                    oVM.setProperty("/resultadoState", "Warning");
                    oVM.setProperty("/canCancel", false);
                    return;
                }

                oVM.setProperty("/resultado", {
                    Status: "S",
                    Message: iSelectedMaterials === 1
                        ? "1 mercancía seleccionada. El payload está listo para revisión."
                        : iSelectedMaterials +
                            " mercancías seleccionadas. El payload está listo para revisión."
                });
                oVM.setProperty("/resultadoState", "Success");
                oVM.setProperty("/canCancel", true);
                return;
            }

            // FLUJO ANTERIOR CONSERVADO:
            // con /matDocOnlyMode = false vuelve a exigir la selección
            // de HU, proveedor y pedido sin recuperar código eliminado.

            if (!aHuRows.length) {
                oVM.setProperty("/resultado", {
                    Status: "W",
                    Message:
                        "No se encontraron HUs disponibles para anular."
                });
                oVM.setProperty("/resultadoState", "Warning");
                oVM.setProperty("/canCancel", false);
                return;
            }

            if (bHuSelectionPending) {
                oVM.setProperty("/resultado", {
                    Status: "W",
                    Message:
                        "Selecciona al menos una HU para continuar."
                });
                oVM.setProperty("/resultadoState", "Warning");
                oVM.setProperty("/canCancel", false);
                return;
            }

            if (bProviderSelectionPending) {
                oVM.setProperty("/resultado", {
                    Status: "W",
                    Message:
                        "Selecciona al menos un pedido para cada HU elegida."
                });
                oVM.setProperty("/resultadoState", "Warning");
                oVM.setProperty("/canCancel", false);
                return;
            }

            oVM.setProperty("/resultado", {
                Status: "S",
                Message:
                    "Vista previa cargada. Revisa la selección antes de anular."
            });

            oVM.setProperty("/resultadoState", "Success");
            oVM.setProperty("/canCancel", true);
        },

        _getProviderDialogInfoText: function (oRow, iOptionCount) {
            if (iOptionCount === 1) {
                return [
                    "Esta HU tiene un proveedor y un pedido de compra.",
                    "La opción fue seleccionada automáticamente;",
                    "revisa aquí el lote, cantidad, unidad y material."
                ].join(" ");
            }

            return [
                "Esta HU tiene",
                Number(oRow.ProveedorCount || 0),
                Number(oRow.ProveedorCount || 0) === 1
                    ? "proveedor y"
                    : "proveedores y",
                Number(oRow.PurchaseOrderCount || 0),
                Number(oRow.PurchaseOrderCount || 0) === 1
                    ? "pedido de compra asociado."
                    : "pedidos de compra asociados.",
                "Selecciona una o varias combinaciones para la anulación."
            ].join(" ");
        },

        onOpenProviderDialog: function (oEvent) {
            var oContext = oEvent
                .getSource()
                .getBindingContext("viewModel");

            var oDisplayRow = oContext.getObject();
            var sRowPath = oDisplayRow.PreviewPath || oContext.getPath();
            var oRow = this.getVM().getProperty(sRowPath);

            var aExistingSelections = Array.isArray(oRow.selectedProviders)
                ? oRow.selectedProviders
                : [];

            // Compatibilidad con registros que todavía tengan
            // selectedProvider de la versión anterior.
            if (
                !aExistingSelections.length &&
                oRow.selectedProvider
            ) {
                aExistingSelections = [
                    oRow.selectedProvider
                ];
            }

            var mSelectedKeys = {};

            aExistingSelections.forEach(function (oProvider) {
                if (oProvider && oProvider.providerKey) {
                    mSelectedKeys[oProvider.providerKey] = true;
                }
            });

            var aProviders = (oRow.providerOptions || []).map(
                function (oProvider) {
                    return Object.assign({}, oProvider, {
                        selected:
                            !!mSelectedKeys[oProvider.providerKey]
                    });
                }
            );

            var aSelectedProviderKeys = aProviders
                .filter(function (oProvider) {
                    return oProvider.selected === true;
                })
                .map(function (oProvider) {
                    return oProvider.providerKey;
                });
            var sProviderDialogInfoText =
                this._getProviderDialogInfoText(
                    oRow,
                    aProviders.length
                );

            this.getVM().setProperty("/providerDialog", {
                rowPath: sRowPath,
                huVenum: oRow.HuVenum || oRow.ObjKey1 || "",
                huExidv: oRow.HuExidv || oRow.MatDoc || "",
                providerCount: Number(oRow.ProveedorCount || 0),
                purchaseOrderCount:
                    Number(oRow.PurchaseOrderCount || 0),
                optionCount: aProviders.length,
                infoText: sProviderDialogInfoText,
                providers: aProviders,

                // Nuevo estado para selección múltiple.
                selectedProviderKeys: aSelectedProviderKeys,
                selectedCount: aSelectedProviderKeys.length,
                canConfirm: aSelectedProviderKeys.length > 0,

                // Se conserva por compatibilidad con el fragment anterior.
                selectedProviderKey:
                    aSelectedProviderKeys.length
                        ? aSelectedProviderKeys[0]
                        : ""
            });

            this._logInfo(
                "onOpenProviderDialog",
                "Diálogo de proveedores preparado",
                {
                    rowPath: sRowPath,
                    huVenum: oRow.HuVenum || "",
                    totalProviders: aProviders.length,
                    selectedProviderKeys: aSelectedProviderKeys
                }
            );

            this._openProviderDialog();
        },

        _openProviderDialog: function () {
            if (!this._oProviderDialog) {
                Fragment.load({
                    id: this.getView().getId(),
                    name:
                        "z.anulacion.anulacion.fragment.ProviderSelection",
                    controller: this
                }).then(function (oDialog) {
                    this._oProviderDialog = oDialog;
                    this.getView().addDependent(oDialog);
                    oDialog.open();
                }.bind(this));

                return;
            }

            this._oProviderDialog.open();
        },

        onProviderSelectionChange: function (oEvent) {
            var oVM = this.getVM();
            var oTable = this.byId("providerTable");
            var aProviders =
                oVM.getProperty(
                    "/providerDialog/providers"
                ) || [];

            var aSelectedItems = oTable
                ? oTable.getSelectedItems()
                : [];

            var mSelectedKeys = {};

            aSelectedItems.forEach(function (oItem) {
                var oContext =
                    oItem.getBindingContext("viewModel");

                var oProvider =
                    oContext &&
                    oContext.getObject();

                if (oProvider && oProvider.providerKey) {
                    mSelectedKeys[oProvider.providerKey] = true;
                }
            });

            aProviders.forEach(function (oProvider) {
                oProvider.selected =
                    !!mSelectedKeys[oProvider.providerKey];
            });

            var aSelectedProviderKeys = aProviders
                .filter(function (oProvider) {
                    return oProvider.selected === true;
                })
                .map(function (oProvider) {
                    return oProvider.providerKey;
                });

            oVM.setProperty(
                "/providerDialog/providers",
                aProviders
            );

            oVM.setProperty(
                "/providerDialog/selectedProviderKeys",
                aSelectedProviderKeys
            );

            oVM.setProperty(
                "/providerDialog/selectedProviderKey",
                aSelectedProviderKeys.length
                    ? aSelectedProviderKeys[0]
                    : ""
            );

            oVM.setProperty(
                "/providerDialog/selectedCount",
                aSelectedProviderKeys.length
            );

            oVM.setProperty(
                "/providerDialog/canConfirm",
                aSelectedProviderKeys.length > 0
            );

            this._logInfo(
                "onProviderSelectionChange",
                "Selección de proveedores actualizada",
                {
                    selectedCount:
                        aSelectedProviderKeys.length,
                    selectedProviderKeys:
                        aSelectedProviderKeys,
                    selectAll:
                        !!oEvent.getParameter("selectAll")
                }
            );
        },

        onConfirmProviderSelection: function () {
            var oVM = this.getVM();

            var sRowPath =
                oVM.getProperty(
                    "/providerDialog/rowPath"
                );

            var aProviders =
                oVM.getProperty(
                    "/providerDialog/providers"
                ) || [];

            var aSelectedProviders =
                aProviders.filter(
                    function (oProvider) {
                        return oProvider.selected === true;
                    }
                );

            if (!sRowPath) {
                MessageBox.warning(
                    "No se pudo identificar la HU seleccionada."
                );
                return;
            }

            if (!aSelectedProviders.length) {
                MessageBox.warning(
                    "Seleccione al menos una combinaciÃ³n de proveedor y pedido antes de confirmar."
                );
                return;
            }

            var oRow = oVM.getProperty(sRowPath);

            this._applySelectedProvidersToRow(
                oRow,
                aSelectedProviders
            );

            oVM.setProperty(
                sRowPath,
                oRow
            );

            this._refreshPreviewDisplay();

            var aPreview =
                oVM.getProperty("/preview") || [];

            this._updateSummary(aPreview);
            this._evaluatePreviewBeforeCancel(aPreview);

            this._logInfo(
                "onConfirmProviderSelection",
                "Proveedores confirmados para la HU",
                {
                    rowPath: sRowPath,
                    huVenum: oRow.HuVenum || "",
                    huExidv: oRow.HuExidv || "",
                    selectedCount:
                        aSelectedProviders.length,
                    selectedProviders:
                        aSelectedProviders
                }
            );

            this.onCloseProviderDialog();

            MessageToast.show(
                aSelectedProviders.length === 1
                    ? "Pedido seleccionado correctamente."
                    : aSelectedProviders.length +
                        " pedidos seleccionados correctamente."
            );
        },

        onCloseProviderDialog: function () {
            if (this._oProviderDialog) {
                this._oProviderDialog.close();
            }
        },

        onAnularDocumento: function () {
            var oVM = this.getVM();
            var sCapturedMatDoc = String(
                oVM.getProperty("/matDoc") || ""
            ).trim();
            var sCapturedMatYear = String(
                oVM.getProperty("/matYear") || ""
            ).trim();
            var oPreviewHeader = oVM.getProperty("/previewHeader") || {};
            var sMatDoc = String(oPreviewHeader.MatDoc || "").trim();
            var sMatYear = String(
                oPreviewHeader.MatYear || ""
            ).trim();
            var bCanCancel = oVM.getProperty("/canCancel");
            var oSummary = oVM.getProperty("/summary") || {};
            var aPreview = oVM.getProperty("/preview") || [];
            var bMatDocOnlyMode =
                oVM.getProperty("/matDocOnlyMode") === true;

            if (oVM.getProperty("/busy")) {
                return;
            }

            if (!this._isValidMatDoc(sCapturedMatDoc)) {
                MessageBox.warning(
                    "El documento material debe contener exactamente 10 dígitos."
                );
                return;
            }

            if (!this._isValidMatYear(sCapturedMatYear)) {
                MessageBox.warning(
                    "El ejercicio debe contener exactamente 4 dígitos."
                );
                return;
            }

            if (
                !this._isValidMatDoc(sMatDoc) ||
                sCapturedMatDoc !== sMatDoc ||
                sCapturedMatYear !== sMatYear
            ) {
                oVM.setProperty("/canCancel", false);
                MessageBox.warning(
                    "El documento o el ejercicio cambió después de la consulta. Vuelve a buscarlo antes de anular."
                );
                return;
            }

            if (!bCanCancel) {
                MessageBox.warning(
                    bMatDocOnlyMode
                        ? "ECC debe confirmar al menos una posición del MatDoc antes de anular."
                        : "Revisa la selección de HUs y pedidos antes de anular."
                );
                return;
            }

            if (bMatDocOnlyMode) {
                var aSelectedMaterials =
                    this._getSelectedMaterials(aPreview);

                if (!aSelectedMaterials.length) {
                    oVM.setProperty("/canCancel", false);
                    MessageBox.warning(
                        "ECC no confirmó posiciones del MatDoc para anular."
                    );
                    return;
                }

                var aConfirmationMaterials =
                    aSelectedMaterials.map(
                        function (oMaterial, iIndex) {
                            return Object.assign({}, oMaterial, {
                                Sequence: iIndex + 1
                            });
                        }
                    );

                // MODO ACTUAL QAS: el usuario selecciona materiales como
                // referencia, pero el backend recibe únicamente el MatDoc.
                // El flujo anterior de HU/pedidos permanece debajo y vuelve
                // a utilizarse cambiando /matDocOnlyMode a false.
                this._oPendingCancellation = {
                    matDoc: sMatDoc,
                    matDocOnly: true,
                    huSelections: [],
                    selectedMaterials: aConfirmationMaterials
                };

                oVM.setProperty("/confirmationDialog", {
                    matDoc: sMatDoc,
                    matDocOnly: true,
                    total: oSummary.total || 0,
                    hu: oSummary.hu || 0,
                    huSeleccionadas: 0,
                    material: oSummary.material || 0,
                    otros: oSummary.otros || 0,
                    selectionCount: aConfirmationMaterials.length,
                    selections: [],
                    materialSelections: aConfirmationMaterials
                });

                this._openCancellationConfirmation();
                return;
            }

            // FLUJO ANTERIOR CONSERVADO: selección manual de HU y pedidos.

            var aHuSelections = this._annotateHuSelectionScope(
                aPreview,
                this._getHuSelections(aPreview)
            );
            var aHuGroups = this._groupHuSelections(aHuSelections);

            if (!aHuSelections.length) {
                MessageBox.warning(
                    "Selecciona al menos una HU y un pedido para continuar."
                );
                return;
            }

            var bFullHuSelection = this._isFullHuSelection(
                aPreview,
                aHuSelections
            );
            var aConfirmationSelections = aHuSelections.map(
                function (oSelection, iIndex) {
                    return Object.assign({}, oSelection, {
                        Sequence: iIndex + 1,
                        DisplayMatnr: oSelection.DisplayMatnr ||
                            this._getLastTenDigits(oSelection.Matnr)
                    });
                }.bind(this)
            );

            this._oPendingCancellation = {
                matDoc: sMatDoc,
                huSelections: aHuSelections,
                fullHuSelection: bFullHuSelection
            };

            this.getVM().setProperty("/confirmationDialog", {
                matDoc: sMatDoc,
                matDocOnly: false,
                total: oSummary.total || 0,
                hu: oSummary.hu || 0,
                huSeleccionadas: aHuGroups.length,
                material: oSummary.material || 0,
                otros: oSummary.otros || 0,
                selectionCount: aConfirmationSelections.length,
                selections: aConfirmationSelections
            });

            this._openCancellationConfirmation();
        },

        _openCancellationConfirmation: function () {
            if (!this._pCancellationConfirmationDialog) {
                this._pCancellationConfirmationDialog = Fragment.load({
                    id: this.getView().getId(),
                    name:
                        "z.anulacion.anulacion.fragment.CancellationConfirmation",
                    controller: this
                }).then(function (oDialog) {
                    this._oCancellationConfirmationDialog = oDialog;
                    this.getView().addDependent(oDialog);
                    return oDialog;
                }.bind(this));
            }

            this._pCancellationConfirmationDialog.then(function (oDialog) {
                oDialog.open();
            });
        },

        onCloseCancellationConfirmation: function () {
            if (this._oCancellationConfirmationDialog) {
                this._oCancellationConfirmationDialog.close();
            }

            this._oPendingCancellation = null;
        },

        onAfterCancellationConfirmationClose: function () {
            this._oPendingCancellation = null;
        },

        onConfirmCancellation: function () {
            var oPending = this._oPendingCancellation;
            var oVM = this.getVM();

            if (oVM.getProperty("/busy")) {
                return;
            }

            if (!oPending || !oPending.matDoc) {
                this.onCloseCancellationConfirmation();
                return;
            }

            if (this._oCancellationConfirmationDialog) {
                this._oCancellationConfirmationDialog.close();
            }

            // Bloqueo inmediato para impedir doble clic antes de iniciar
            // la primera llamada OData.
            oVM.setProperty("/busy", true);
            this._oPendingCancellation = null;

            if (oPending.matDocOnly) {
                this._postAnulacion(
                    oPending.matDoc,
                    oPending.selectedMaterials || [],
                    {
                        matDocOnly: true,
                        deepSelection: true,
                        omitHuIdentifiers: true
                    }
                );
                return;
            }

            // FLUJO ANTERIOR CONSERVADO: si se desactiva el modo sólo
            // MatDoc, vuelve a procesar la selección HU/pedido existente.

            if (oPending.fullHuSelection) {
                this._postAllHuAnulacion(
                    oPending.matDoc,
                    oPending.huSelections
                );
                return;
            }

            this._postAnulacion(
                oPending.matDoc,
                oPending.huSelections
            );
        },

        _getHuSelections: function (aPreview) {
            var aSelections = [];
            var mSeen = {};

            (aPreview || []).forEach(function (oRow) {
                if (!this._isHU(oRow)) {
                    return;
                }

                if (
                    oRow.HuSelectionRequired &&
                    !oRow.HuSelected
                ) {
                    return;
                }

                var aSelectedProviders =
                    Array.isArray(oRow.selectedProviders)
                        ? oRow.selectedProviders
                        : [];

                // Compatibilidad con la versión anterior.
                if (
                    !aSelectedProviders.length &&
                    oRow.selectedProvider
                ) {
                    aSelectedProviders = [
                        oRow.selectedProvider
                    ];
                }

                aSelectedProviders.forEach(function (oProvider) {
                    var oSelection = {
                        HuVenum:
                            oRow.HuVenum ||
                            oProvider.HuVenum ||
                            "",
                        HuExidv:
                            oRow.HuExidv ||
                            oProvider.HuExidv ||
                            "",
                        Lifnr:
                            oProvider.Lifnr || "",
                        Name1:
                            oProvider.Name1 || "",
                        Ebeln:
                            oProvider.Ebeln || "",
                        SeqNo: oProvider.SeqNo,
                        GrMatDoc: oProvider.GrMatDoc || "",
                        GrYear: oProvider.GrYear || "",
                        SoVbeln: oProvider.SoVbeln || "",
                        DelivVbeln: oProvider.DelivVbeln || "",
                        Charg: oProvider.Charg || "",
                        Menge: oProvider.Menge || "",
                        Meins: oProvider.Meins || "",
                        Matnr: oProvider.Matnr || "",
                        DisplayMatnr:
                            oProvider.DisplayMatnr ||
                            String(
                                oProvider.Matnr || ""
                            ).trim().slice(-10),
                        Maktx: oProvider.Maktx || ""
                    };

                    var sSelectionKey = [
                        oSelection.SeqNo === null ||
                        oSelection.SeqNo === undefined
                            ? ""
                            : String(oSelection.SeqNo),
                        oSelection.HuVenum,
                        oSelection.HuExidv,
                        oSelection.Lifnr,
                        oSelection.Ebeln
                    ].join("|");

                    if (!mSeen[sSelectionKey]) {
                        mSeen[sSelectionKey] = true;
                        aSelections.push(oSelection);
                    }
                });
            }.bind(this));

            this._logInfo(
                "_getHuSelections",
                "Selecciones HU/proveedor preparadas",
                {
                    total: aSelections.length,
                    selections: aSelections
                }
            );

            return aSelections;
        },

        _getEmptyCancellationSummary: function () {
            return {
                visible: false,
                document: "",
                huVenum: "",
                huExidv: "",
                providerText: "",
                purchaseOrderText: "",
                runId: ""
            };
        },

        _buildCancellationSummary: function (
            sMatDoc,
            aSelections,
            sRunId
        ) {
            var aItems = Array.isArray(aSelections)
                ? aSelections
                : [];
            var mProviders = {};
            var mPurchaseOrders = {};
            var mHuVenum = {};
            var mHuExidv = {};
            var aProviders = [];
            var aPurchaseOrders = [];
            var aHuVenum = [];
            var aHuExidv = [];

            aItems.forEach(function (oItem) {
                var sHuVenum = String(
                    oItem.HuVenum || ""
                ).trim();
                var sHuExidv = String(
                    oItem.HuExidv || ""
                ).trim();
                var sProviderNumber = String(
                    oItem.Lifnr || ""
                ).trim();
                var sProviderName = String(
                    oItem.Name1 || ""
                ).trim();
                var sProviderKey = sProviderNumber || sProviderName;
                var sPurchaseOrder = String(
                    oItem.Ebeln || ""
                ).trim();

                if (sHuVenum && !mHuVenum[sHuVenum]) {
                    mHuVenum[sHuVenum] = true;
                    aHuVenum.push(sHuVenum);
                }

                if (sHuExidv && !mHuExidv[sHuExidv]) {
                    mHuExidv[sHuExidv] = true;
                    aHuExidv.push(sHuExidv);
                }

                if (sProviderKey && !mProviders[sProviderKey]) {
                    mProviders[sProviderKey] = true;
                    aProviders.push(
                        [sProviderNumber, sProviderName]
                            .filter(Boolean)
                            .join(" - ")
                    );
                }

                if (
                    sPurchaseOrder &&
                    !mPurchaseOrders[sPurchaseOrder]
                ) {
                    mPurchaseOrders[sPurchaseOrder] = true;
                    aPurchaseOrders.push(sPurchaseOrder);
                }
            });

            return {
                visible: true,
                document: String(sMatDoc || "").trim(),
                huVenum: aHuVenum.join(" | "),
                huExidv: aHuExidv.join(" | "),
                providerText: aProviders.join(" | "),
                purchaseOrderText: aPurchaseOrders.join(" | "),
                runId: String(sRunId || "").trim()
            };
        },

        _groupHuSelections: function (aSelections) {
            var mGroups = {};
            var aGroups = [];

            (aSelections || []).forEach(function (oSelection) {
                var sHuVenum = String(
                    oSelection.HuVenum || ""
                ).trim();
                var sHuExidv = String(
                    oSelection.HuExidv || ""
                ).trim();
                var sGroupKey = [sHuVenum, sHuExidv].join("|");

                if (!mGroups[sGroupKey]) {
                    mGroups[sGroupKey] = {
                        HuVenum: sHuVenum,
                        HuExidv: sHuExidv,
                        selections: []
                    };
                    aGroups.push(mGroups[sGroupKey]);
                }

                mGroups[sGroupKey].selections.push(oSelection);
            });

            return aGroups;
        },

        _annotateHuSelectionScope: function (aPreview, aSelections) {
            return (aSelections || []).map(function (oSelection) {
                var sSelectionExidv = String(
                    oSelection.HuExidv || ""
                ).trim();
                var sSelectionVenum = String(
                    oSelection.HuVenum || ""
                ).trim();
                var oRow = (aPreview || []).find(function (oPreviewRow) {
                    if (!this._isHU(oPreviewRow)) {
                        return false;
                    }

                    var sRowExidv = String(
                        oPreviewRow.HuExidv || ""
                    ).trim();
                    var sRowVenum = String(
                        oPreviewRow.HuVenum || ""
                    ).trim();

                    return sSelectionExidv
                        ? sRowExidv === sSelectionExidv
                        : sRowVenum === sSelectionVenum;
                }.bind(this));
                var iAvailableOrders = oRow && Array.isArray(
                    oRow.providerOptions
                )
                    ? oRow.providerOptions.length
                    : 0;
                var iSelectedOrders = oRow && Array.isArray(
                    oRow.selectedProviders
                )
                    ? oRow.selectedProviders.length
                    : 0;

                return Object.assign({}, oSelection, {
                    AllHuOrdersSelected:
                        iAvailableOrders > 0 &&
                        iSelectedOrders === iAvailableOrders
                });
            }.bind(this));
        },

        _isFullHuSelection: function (aPreview, aSelections) {
            var aAvailableHu = (aPreview || []).filter(function (oRow) {
                return this._isHU(oRow);
            }.bind(this));
            var aSelectedGroups = this._groupHuSelections(
                aSelections || []
            );
            var mSelectedHu = {};

            aSelectedGroups.forEach(function (oGroup) {
                mSelectedHu[
                    [oGroup.HuVenum, oGroup.HuExidv].join("|")
                ] = true;
            });

            // Una sola HU siempre usa el POST individual con sus
            // identificadores. El modo global aplica únicamente cuando
            // existen varias HU, todas fueron seleccionadas y no se quitó
            // ningún pedido de una HU.
            return aAvailableHu.length > 1 &&
                aSelectedGroups.length === aAvailableHu.length &&
                aAvailableHu.every(function (oRow) {
                    var sKey = [
                        String(oRow.HuVenum || "").trim(),
                        String(oRow.HuExidv || "").trim()
                    ].join("|");
                    var iAvailableOrders = (
                        oRow.providerOptions || []
                    ).length;
                    var iSelectedOrders = (
                        oRow.selectedProviders || []
                    ).length;

                    return !!mSelectedHu[sKey] &&
                        iAvailableOrders > 0 &&
                        iSelectedOrders === iAvailableOrders;
                });
        },

        _normalizeHuIdentifier: function (sValue) {
            var sNormalized = String(sValue || "").trim();

            return sNormalized
                ? (sNormalized.replace(/^0+/, "") || "0")
                : "";
        },

        _findLiveHuRow: function (oTargetGroup, aPreview) {
            var sTargetExidv = String(
                oTargetGroup && oTargetGroup.HuExidv || ""
            ).trim();
            var sTargetVenum = String(
                oTargetGroup && oTargetGroup.HuVenum || ""
            ).trim();
            var sNormalizedExidv = this._normalizeHuIdentifier(
                sTargetExidv
            );
            var sNormalizedVenum = this._normalizeHuIdentifier(
                sTargetVenum
            );
            var aHuRows = (aPreview || []).filter(function (oRow) {
                return this._isHU(oRow);
            }.bind(this));
            var oLiveRow = aHuRows.find(function (oRow) {
                return sNormalizedExidv &&
                    this._normalizeHuIdentifier(oRow.HuExidv) ===
                        sNormalizedExidv;
            }.bind(this));

            if (oLiveRow) {
                return oLiveRow;
            }

            return aHuRows.find(function (oRow) {
                return sNormalizedVenum &&
                    this._normalizeHuIdentifier(oRow.HuVenum) ===
                        sNormalizedVenum;
            }.bind(this));
        },

        _getLiveHuSelections: function (oTargetGroup, aPreview) {
            var oLiveRow = this._findLiveHuRow(
                oTargetGroup,
                aPreview
            );

            if (!oLiveRow) {
                return [];
            }

            var mRequestedPairs = {};
            var bAllOrdersOriginallySelected =
                (oTargetGroup.selections || []).length > 0 &&
                (oTargetGroup.selections || []).every(
                    function (oSelection) {
                        return oSelection.AllHuOrdersSelected === true;
                    }
                );

            (oTargetGroup.selections || []).forEach(function (oSelection) {
                var sOrder = String(oSelection.Ebeln || "").trim();
                var sProvider = String(oSelection.Lifnr || "").trim();

                if (sOrder || sProvider) {
                    mRequestedPairs[
                        [sProvider, sOrder].join("|")
                    ] = true;
                }
            });

            var aLiveProviders = (oLiveRow.providerOptions || []);

            if (!bAllOrdersOriginallySelected) {
                aLiveProviders = aLiveProviders.filter(
                    function (oProvider) {
                        var sPairKey = [
                            String(oProvider.Lifnr || "").trim(),
                            String(oProvider.Ebeln || "").trim()
                        ].join("|");

                        return !!mRequestedPairs[sPairKey];
                    }
                );
            }

            if (!aLiveProviders.length) {
                return [];
            }

            if (
                !bAllOrdersOriginallySelected &&
                Object.keys(mRequestedPairs).some(function (sPairKey) {
                    return !aLiveProviders.some(function (oProvider) {
                        return [
                            String(oProvider.Lifnr || "").trim(),
                            String(oProvider.Ebeln || "").trim()
                        ].join("|") === sPairKey;
                    });
                })
            ) {
                return [];
            }

            var oSelectableRow = Object.assign({}, oLiveRow, {
                HuSelected: true,
                HuSelectionRequired: false,
                selectedProviders: aLiveProviders,
                selectedProvider: aLiveProviders[0]
            });

            return this._getHuSelections([oSelectableRow]);
        },

        _getAllLiveHuSelections: function (aPreview) {
            return (aPreview || []).reduce(function (
                aSelections,
                oRow
            ) {
                if (!this._isHU(oRow)) {
                    return aSelections;
                }

                var aLiveProviders = oRow.providerOptions || [];
                var oSelectableRow = Object.assign({}, oRow, {
                    HuSelected: true,
                    HuSelectionRequired: false,
                    selectedProviders: aLiveProviders,
                    selectedProvider: aLiveProviders[0]
                });

                return aSelections.concat(
                    this._getHuSelections([oSelectableRow])
                );
            }.bind(this), []);
        },

        _buildMatDocOnlyPayload: function (sMatDoc) {
            var sValidatedMatDoc = String(sMatDoc || "").trim();

            if (!this._isValidMatDoc(sValidatedMatDoc)) {
                throw new Error(
                    "No se puede enviar la anulación: MatDoc debe contener exactamente 10 dígitos."
                );
            }

            return {
                MatDoc: sValidatedMatDoc,
                HuVenum: "",
                HuExidv: "",
                ProveedoresSel: "",
                EbelnSel: "",
                EbelnsSel: ""
            };
        },

        _buildDeepAnulacionPayload: function (
            sMatDoc,
            aSelections,
            aAllItems,
            oHeader,
            sRequestedYear
        ) {
            var sValidatedMatDoc = String(sMatDoc || "").trim();
            var aSelectedItems = Array.isArray(aSelections)
                ? aSelections
                : [];
            var aPhysicalItems = Array.isArray(aAllItems)
                ? aAllItems
                : [];
            var oPreviewHeader = oHeader || {};

            if (!this._isValidMatDoc(sValidatedMatDoc)) {
                throw new Error(
                    "No se puede enviar la anulación: MatDoc debe contener exactamente 10 dígitos."
                );
            }

            if (!aSelectedItems.length) {
                throw new Error(
                    "Selecciona al menos una mercancía para anular."
                );
            }

            if (!aPhysicalItems.length) {
                throw new Error(
                    "El GET no contiene posiciones físicas para preparar ToItems."
                );
            }

            var fnItemKey = function (oItem) {
                return [
                    oItem.SeqNo === null ||
                    oItem.SeqNo === undefined
                        ? ""
                        : String(oItem.SeqNo),
                    String(oItem.HuVenum || "").trim(),
                    String(oItem.HuExidv || "").trim(),
                    String(oItem.Vepos || "").trim(),
                    String(oItem.GrMatDoc || "").trim(),
                    String(oItem.GrYear || "").trim(),
                    String(oItem.Zeile || "").trim()
                ].join("|");
            };
            var mSelectedKeys = {};

            aSelectedItems.forEach(function (oItem) {
                mSelectedKeys[fnItemKey(oItem)] = true;
            });

            var aToItems = aPhysicalItems.map(function (oRawItem) {
                var oPostItem = {};

                Object.keys(oRawItem || {}).forEach(function (sProperty) {
                    if (
                        sProperty === "__metadata" ||
                        sProperty === "ToItems"
                    ) {
                        return;
                    }

                    oPostItem[sProperty] = oRawItem[sProperty];
                });

                var bMerchandise = !!(
                    String(oRawItem.GrMatDoc || "").trim() &&
                    String(oRawItem.GrYear || "").trim() &&
                    String(oRawItem.Zeile || "").trim() &&
                    String(oRawItem.Vepos || "").trim()
                );

                oPostItem.SelectionStatus = bMerchandise
                    ? (mSelectedKeys[fnItemKey(oRawItem)]
                        ? "ANULAR"
                        : "CONSERVAR")
                    : "";

                // CONTRATO POST: las posiciones enviadas ya fueron revisadas
                // por el usuario en BTP, por lo que siempre se confirman a ECC.
                // El valor original recibido en el GET se conserva únicamente
                // en el modelo de la pantalla y no se replica en el POST.
                oPostItem.PlanValidated = true;

                return oPostItem;
            });
            var sMatYear = String(
                sRequestedYear ||
                oPreviewHeader.MatYear ||
                aPhysicalItems[0].MatYear ||
                aPhysicalItems[0].GrYear ||
                ""
            ).trim();

            if (!this._isValidMatYear(sMatYear)) {
                throw new Error(
                    "No se puede preparar el POST: MatYear debe contener 4 dígitos."
                );
            }

            var mHu = {};
            aPhysicalItems.forEach(function (oItem) {
                var sHuKey = [
                    String(oItem.HuVenum || "").trim(),
                    String(oItem.HuExidv || "").trim()
                ].join("|");

                if (sHuKey !== "|") {
                    mHu[sHuKey] = true;
                }
            });
            var fnFirstValue = function (sProperty) {
                var oMatch = aPhysicalItems.find(function (oItem) {
                    return String(oItem[sProperty] || "").trim();
                });

                return String(
                    oPreviewHeader[sProperty] ||
                    oMatch && oMatch[sProperty] ||
                    ""
                ).trim();
            };

            return {
                MatDoc: sValidatedMatDoc,
                MatYear: sMatYear,
                Plant: fnFirstValue("Plant"),
                StgeLoc: fnFirstValue("StgeLoc"),
                HuCount: Object.keys(mHu).length,
                ItemCount: aToItems.length,
                Tknum: fnFirstValue("Tknum"),
                Status: "",
                BapiMessage: "",
                ToItems: aToItems
            };
        },

        // FLUJO ANTERIOR CONSERVADO:
        // este constructor sigue disponible para volver a enviar una HU o
        // una selección de pedidos cuando /matDocOnlyMode sea false.
        _buildAnulacionPayload: function (
            sMatDoc,
            aSelections,
            bOmitHuIdentifiers
        ) {
            var sValidatedMatDoc = String(sMatDoc || "").trim();

            if (!this._isValidMatDoc(sValidatedMatDoc)) {
                throw new Error(
                    "No se puede enviar la anulación: MatDoc debe contener exactamente 10 dígitos."
                );
            }

            var aItems = Array.isArray(aSelections)
                ? aSelections
                : [];
            var mSeenPairs = {};
            var aPayloadItems = bOmitHuIdentifiers
                ? aItems.filter(function (oItem) {
                    var sPairKey = [
                        String(oItem.Lifnr || "").trim(),
                        String(oItem.Ebeln || "").trim()
                    ].join("|");

                    if (mSeenPairs[sPairKey]) {
                        return false;
                    }

                    mSeenPairs[sPairKey] = true;
                    return true;
                })
                : aItems;
            var oFirstItem = aPayloadItems[0] || {};
            var sEbelnsSel = aPayloadItems
                .map(function (oItem) {
                    return String(oItem.Ebeln || "").trim();
                })
                .filter(Boolean)
                .join(";");
            var oPayload = {
                MatDoc: sValidatedMatDoc,
                ProveedoresSel: aPayloadItems
                    .map(function (oItem) {
                        return String(oItem.Lifnr || "").trim();
                    })
                    .filter(Boolean)
                    .join(";"),
                EbelnSel: sEbelnsSel,
                EbelnsSel: sEbelnsSel
            };

            if (!bOmitHuIdentifiers) {
                oPayload.HuVenum = String(
                    oFirstItem.HuVenum || ""
                ).trim();
                oPayload.HuExidv = String(
                    oFirstItem.HuExidv || ""
                ).trim();
            }

            return oPayload;
        },

        _formatHuAnulacionResult: function (oResult) {
            var oGroup = oResult && oResult.group
                ? oResult.group
                : {};
            var aSelections = Array.isArray(oGroup.selections)
                ? oGroup.selections
                : [];
            var mPurchaseOrders = {};
            var aPurchaseOrders = [];

            aSelections.forEach(function (oSelection) {
                var sPurchaseOrder = String(
                    oSelection.Ebeln || ""
                ).trim();

                if (
                    sPurchaseOrder &&
                    !mPurchaseOrders[sPurchaseOrder]
                ) {
                    mPurchaseOrders[sPurchaseOrder] = true;
                    aPurchaseOrders.push(sPurchaseOrder);
                }
            });

            return "• Identificador: " +
                (String(oGroup.HuExidv || "").trim() || "-") +
                " · Número interno: " +
                (String(oGroup.HuVenum || "").trim() || "-") +
                " · Pedido(s): " +
                (aPurchaseOrders.join(", ") || "Sin pedido");
        },

        _getAnulacionResultErrorMessage: function (oResult) {
            var oError = oResult && oResult.error
                ? oResult.error
                : {};
            var sMessage = String(
                oError.message || ""
            ).trim();
            var sHttpStatus = [
                oError.statusCode,
                oError.statusText
            ].filter(Boolean).join(" ");

            try {
                if (oError.responseText) {
                    var oResponse = JSON.parse(oError.responseText);
                    var oResponseError = oResponse && oResponse.error;
                    var oResponseMessage = oResponseError &&
                        oResponseError.message;
                    var aErrorDetails = oResponseError &&
                        oResponseError.innererror &&
                        oResponseError.innererror.errordetails;
                    var sSapMessage = oResponseMessage &&
                        (oResponseMessage.value || oResponseMessage);

                    if (!sSapMessage && Array.isArray(aErrorDetails)) {
                        var oDetail = aErrorDetails.find(function (
                            oErrorDetail
                        ) {
                            return oErrorDetail &&
                                oErrorDetail.message;
                        });
                        sSapMessage = oDetail && oDetail.message;
                    }

                    if (sSapMessage) {
                        sMessage = String(sSapMessage).trim();
                    }
                }
            } catch (oParseError) {
                // Se conserva el mensaje disponible en el error original.
                if (!(oParseError instanceof SyntaxError)) {
                    throw oParseError;
                }
            }

            if (sHttpStatus && sMessage.indexOf(sHttpStatus) === -1) {
                sMessage = (sMessage || "Falló la solicitud OData") +
                    " (HTTP " + sHttpStatus + ")";
            }

            return sMessage || "SAP no devolvió el motivo.";
        },

        _getHttpStatusCode: function (oError) {
            var iStatusCode = Number(
                oError && (
                    oError.statusCode ||
                    oError.status ||
                    oError.response && (
                        oError.response.statusCode ||
                        oError.response.status
                    )
                )
            );

            return Number.isFinite(iStatusCode) ? iStatusCode : 0;
        },

        _isCsrfError: function (oError) {
            return this._getHttpStatusCode(oError) === 403;
        },

        _isMessageTypeXError: function (oError) {
            return this._getHttpStatusCode(oError) === 500 &&
                String(
                    oError && oError.responseText || ""
                ).toUpperCase().indexOf("MESSAGE_TYPE_X") !== -1;
        },

        _getMessageTypeXFunctionalMessage: function () {
            return "No se pudo completar la anulación de la HU porque SAP no logró generar el movimiento 102. " +
                "El proceso se detuvo para evitar inconsistencias. Favor de volver a consultar el documento y " +
                "reintentar las HUs pendientes. Si el problema persiste, reportar el caso con el documento material y la HU.";
        },

        _buildMultipleAnulacionResultMessage: function (
            sSummary,
            aSuccessResults,
            aErrorResults
        ) {
            var aSections = [sSummary];

            if (aSuccessResults.length) {
                aSections.push(
                    (aSuccessResults.length === 1
                        ? "HU anulada:\n"
                        : "HU anuladas:\n") +
                    aSuccessResults.map(function (oResult) {
                        var sResult =
                            this._formatHuAnulacionResult(oResult);
                        var sStatus = String(
                            oResult.data && oResult.data.Status || ""
                        ).toUpperCase();
                        var sWarning = String(
                            oResult.data && oResult.data.Message || ""
                        ).trim();

                        if (
                            oResult.technicalWarning === true ||
                            sStatus === "W"
                        ) {
                            sResult += "\n  Advertencia: " +
                                (sWarning ||
                                    "La HU fue procesada con advertencia.");
                        }

                        return sResult;
                    }.bind(this)).join("\n")
                );
            }

            if (aErrorResults.length) {
                aSections.push(
                    (aErrorResults.length === 1
                        ? "HU no anulada:\n"
                        : "HU no anuladas:\n") +
                    aErrorResults.map(function (oResult) {
                        return this._formatHuAnulacionResult(oResult) +
                            "\n  Motivo: " +
                            this._getAnulacionResultErrorMessage(oResult);
                    }.bind(this)).join("\n")
                );
            }

            return aSections.join("\n\n");
        },

        _postAllHuAnulacion: function (sMatDoc, aSelections) {
            var aGroups = this._groupHuSelections(aSelections);
            var oOriginalGroup = {
                HuVenum: aGroups.map(function (oGroup) {
                    return oGroup.HuVenum;
                }).filter(Boolean).join(" | "),
                HuExidv: aGroups.map(function (oGroup) {
                    return oGroup.HuExidv;
                }).filter(Boolean).join(" | "),
                selections: aSelections
            };

            this.getVM().setProperty("/busy", true);
            this.getVM().setProperty("/detalle", []);
            this.getVM().setProperty(
                "/cancellationSummary",
                this._getEmptyCancellationSummary()
            );

            this._logInfo(
                "ANULACION_TOTAL.REFRESH",
                "Refrescando el MatDoc antes del POST global",
                {
                    MatDoc: sMatDoc,
                    totalHuOriginal: aGroups.length
                }
            );

            this._refreshPreviewAfterCancellation(
                sMatDoc,
                function (bPreviewUpdated, oRefreshResult) {
                    if (!bPreviewUpdated) {
                        this._finalizeMultipleAnulaciones(
                            sMatDoc,
                            [{
                                success: false,
                                error: {
                                    message:
                                        "No fue posible refrescar el MatDoc antes de la anulación total."
                                },
                                group: oOriginalGroup,
                                huCount: aGroups.length
                            }]
                        );
                        return;
                    }

                    var aLiveSelections =
                        this._getAllLiveHuSelections(
                            oRefreshResult.preview || []
                        );
                    var aLiveGroups = this._groupHuSelections(
                        aLiveSelections
                    );
                    var oLiveGroup = {
                        HuVenum: aLiveGroups.map(function (oGroup) {
                            return oGroup.HuVenum;
                        }).filter(Boolean).join(" | "),
                        HuExidv: aLiveGroups.map(function (oGroup) {
                            return oGroup.HuExidv;
                        }).filter(Boolean).join(" | "),
                        selections: aLiveSelections
                    };

                    if (!aLiveSelections.length) {
                        this._finalizeMultipleAnulaciones(
                            sMatDoc,
                            [{
                                success: false,
                                error: {
                                    message:
                                        "El preview actualizado no contiene HU disponibles para anular."
                                },
                                group: oOriginalGroup,
                                huCount: aGroups.length
                            }]
                        );
                        return;
                    }

                    this._logInfo(
                        "ANULACION_TOTAL.ENVIO",
                        "Todas las HU están seleccionadas; se enviará un solo POST sin identificadores HU",
                        {
                            MatDoc: sMatDoc,
                            totalHu: aLiveGroups.length,
                            payload: this._buildAnulacionPayload(
                                sMatDoc,
                                aLiveSelections,
                                true
                            )
                        }
                    );

                    this._postAnulacion(
                        sMatDoc,
                        aLiveSelections,
                        {
                            isBatchItem: true,
                            omitHuIdentifiers: true,
                            onComplete: function (oResult) {
                                var oFinalResult = Object.assign(
                                    {},
                                    oResult,
                                    {
                                        group: oLiveGroup,
                                        huCount: aLiveGroups.length
                                    }
                                );

                                this._logInfo(
                                    "ANULACION_TOTAL.RESPUESTA",
                                    "Respuesta final del POST global",
                                    {
                                        MatDoc: sMatDoc,
                                        totalHu: aLiveGroups.length,
                                        response:
                                            oResult.data || oResult.error
                                    }
                                );

                                if (oResult.success !== true) {
                                    this._finalizeMultipleAnulaciones(
                                        sMatDoc,
                                        [oFinalResult]
                                    );
                                    return;
                                }

                                this._waitForSapRelease(function () {
                                    this._finalizeMultipleAnulaciones(
                                        sMatDoc,
                                        [oFinalResult]
                                    );
                                }.bind(this));
                            }.bind(this)
                        }
                    );
                }.bind(this)
            );
        },

        _postMultipleAnulaciones: function (sMatDoc, aSelections) {
            var aGroups = this._groupHuSelections(aSelections);
            var aResults = [];
            var iCurrentGroup = 0;
            var sSequentialTraceId = this._generateTraceId(
                "ANULACION_SECUENCIAL"
            );

            this._logInfo(
                "ANULACION_SECUENCIAL.INICIO",
                "Inicia la cola: " + aGroups.length +
                    " HU se enviarán una por una",
                {
                    traceId: sSequentialTraceId,
                    matDoc: sMatDoc,
                    totalHu: aGroups.length,
                    huQueue: aGroups.map(function (oGroup) {
                        return {
                            HuVenum: oGroup.HuVenum,
                            HuExidv: oGroup.HuExidv
                        };
                    })
                }
            );

            this.getVM().setProperty("/busy", true);
            this.getVM().setProperty("/detalle", []);
            this.getVM().setProperty(
                "/cancellationSummary",
                this._getEmptyCancellationSummary()
            );
            this._startCancellationProgress(aGroups.length);

            var fnUpdateProgressFromResults = function (oChanges) {
                var aProcessedResults = aResults.filter(function (
                    oResult
                ) {
                    return oResult.skipped !== true;
                });
                var iSuccessfulHu = aProcessedResults.filter(function (
                    oResult
                ) {
                    return oResult.success === true;
                }).length;

                this._updateCancellationProgress(Object.assign(
                    {
                        active: true,
                        total: aGroups.length,
                        completed: aProcessedResults.length,
                        success: iSuccessfulHu,
                        failed:
                            aProcessedResults.length - iSuccessfulHu
                    },
                    oChanges || {}
                ));
            }.bind(this);

            var fnAddPendingResults = function (
                iStartIndex,
                sMessage
            ) {
                aGroups.slice(iStartIndex).forEach(function (
                    oPendingGroup
                ) {
                    aResults.push({
                        success: false,
                        skipped: true,
                        error: { message: sMessage },
                        group: oPendingGroup
                    });
                });
            };

            var fnPostNextGroup = function (oPreparedRefreshResult) {
                if (iCurrentGroup >= aGroups.length) {
                    this._logInfo(
                        "ANULACION_SECUENCIAL.FIN",
                        "Finalizó la cola; no quedan HU por enviar",
                        {
                            traceId: sSequentialTraceId,
                            matDoc: sMatDoc,
                            totalHu: aGroups.length,
                            results: aResults
                        }
                    );
                    this._finalizeMultipleAnulaciones(
                        sMatDoc,
                        aResults
                    );
                    return;
                }

                var oTargetGroup = aGroups[iCurrentGroup];
                var iPosition = iCurrentGroup + 1;

                fnUpdateProgressFromResults({
                    current: iPosition,
                    currentHu:
                        oTargetGroup.HuExidv || oTargetGroup.HuVenum,
                    title: "Preparando HU " + iPosition + " de " +
                        aGroups.length,
                    message:
                        "Consultando el preview actualizado antes de enviar la HU.",
                    state: "Information"
                });

                this._logInfo(
                    "ANULACION_SECUENCIAL.REFRESH",
                    "Consultando el MatDoc antes de reconstruir la HU viva",
                    {
                        traceId: sSequentialTraceId,
                        MatDoc: sMatDoc,
                        position: iPosition,
                        totalHu: aGroups.length,
                        HuVenumOriginal: oTargetGroup.HuVenum,
                        HuExidvOriginal: oTargetGroup.HuExidv
                    }
                );

                var fnProcessRefreshedPreview = function (
                    bPreviewUpdated,
                    oRefreshResult
                ) {
                        if (!bPreviewUpdated) {
                            aResults.push({
                                success: false,
                                technicalError: true,
                                error: {
                                    message:
                                        "No fue posible refrescar el MatDoc antes de procesar la HU."
                                },
                                group: oTargetGroup
                            });
                            fnUpdateProgressFromResults({
                                title: "No se pudo preparar la HU " +
                                    iPosition + " de " + aGroups.length,
                                message:
                                    "No fue posible actualizar el documento. Se continuará con la siguiente HU seleccionada.",
                                state: "Warning"
                            });
                            iCurrentGroup++;
                            fnPostNextGroup();
                            return;
                        }

                        var aLivePreview =
                            oRefreshResult.preview || [];
                        var oLiveRow = this._findLiveHuRow(
                            oTargetGroup,
                            aLivePreview
                        );

                        if (!oLiveRow) {
                            this._logInfo(
                                "ANULACION_SECUENCIAL.HU_YA_ANULADA",
                                "La HU ya no existe en el preview actualizado; se continúa con la siguiente",
                                {
                                    traceId: sSequentialTraceId,
                                    position: iPosition,
                                    HuVenum: oTargetGroup.HuVenum,
                                    HuExidv: oTargetGroup.HuExidv
                                }
                            );
                            aResults.push({
                                success: true,
                                alreadyRemoved: true,
                                data: {
                                    Status: "W",
                                    Message:
                                        "La HU ya no aparece en el preview actualizado."
                                },
                                group: oTargetGroup
                            });
                            fnUpdateProgressFromResults({
                                title: "HU " + iPosition + " de " +
                                    aGroups.length + " ya procesada",
                                message:
                                    "La HU ya no aparece en el preview actualizado. Preparando la siguiente.",
                                state: "Warning"
                            });
                            iCurrentGroup++;
                            fnPostNextGroup();
                            return;
                        }

                        var aLiveSelections =
                            this._getLiveHuSelections(
                                oTargetGroup,
                                aLivePreview
                            );

                        if (!aLiveSelections.length) {
                            aResults.push({
                                success: false,
                                technicalError: true,
                                error: {
                                    message:
                                        "La HU existe, pero sus pedidos o proveedor seleccionados ya no pudieron reconstruirse con datos actuales."
                                },
                                group: oTargetGroup
                            });
                            fnUpdateProgressFromResults({
                                title: "No se pudo reconstruir la HU " +
                                    iPosition + " de " + aGroups.length,
                                message:
                                    "Los datos actuales de la HU no permiten enviarla. Se continuará con la siguiente.",
                                state: "Warning"
                            });
                            iCurrentGroup++;
                            fnPostNextGroup();
                            return;
                        }

                        var oGroup = Object.assign(
                            {},
                            oTargetGroup,
                            {
                                HuVenum:
                                    aLiveSelections[0].HuVenum || "",
                                HuExidv:
                                    aLiveSelections[0].HuExidv || "",
                                selections: aLiveSelections
                            }
                        );

                        this._logInfo(
                            "ANULACION_SECUENCIAL.ENVIO",
                            "Enviando HU " + iPosition +
                                " de " + aGroups.length,
                            {
                                traceId: sSequentialTraceId,
                                position: iPosition,
                                totalHu: aGroups.length,
                                MatDoc: sMatDoc,
                                HuVenum: oGroup.HuVenum,
                                HuExidv: oGroup.HuExidv,
                                payload: this._buildAnulacionPayload(
                                    sMatDoc,
                                    oGroup.selections
                                )
                            }
                        );

                        fnUpdateProgressFromResults({
                            current: iPosition,
                            currentHu:
                                oGroup.HuExidv || oGroup.HuVenum,
                            title: "Anulando HU " + iPosition + " de " +
                                aGroups.length,
                            message:
                                "Solicitud enviada a SAP. Esperando la confirmación del movimiento 102.",
                            state: "Information"
                        });

                        this._postAnulacion(
                            sMatDoc,
                            oGroup.selections,
                            {
                                isBatchItem: true,
                                onComplete: function (oResult) {
                                    var sResponseStatus = String(
                                        oResult.data &&
                                        oResult.data.Status
                                            ? oResult.data.Status
                                            : (oResult.success === true
                                                ? "S"
                                                : "TECHNICAL")
                                    ).toUpperCase();
                                    var bFunctionalError =
                                        sResponseStatus === "E" &&
                                        oResult.technicalError !== true;
                                    var bMessageTypeX =
                                        oResult.messageTypeX === true ||
                                        this._isMessageTypeXError(
                                            oResult.error
                                        );
                                    var fnContinueQueue = function (
                                        oNextRefreshResult
                                    ) {
                                        var oLastResult =
                                            aResults[aResults.length - 1] || {};
                                        var iSuccessfulHu =
                                            aResults.filter(function (
                                                oStoredResult
                                            ) {
                                                return oStoredResult.success ===
                                                    true;
                                            }).length;

                                        fnUpdateProgressFromResults({
                                            title: oLastResult.success === true
                                                ? iSuccessfulHu + " de " +
                                                    aGroups.length +
                                                    " HU anuladas"
                                                : "Resultado validado para la HU " +
                                                    iPosition + " de " +
                                                    aGroups.length,
                                            message:
                                                "Esperando 30 segundos para que SAP libere el documento antes de continuar.",
                                            state: oLastResult.success === true
                                                ? "Success"
                                                : "Warning"
                                        });
                                        iCurrentGroup++;
                                        this._waitForSapRelease(
                                            function () {
                                                fnPostNextGroup(
                                                    oNextRefreshResult
                                                );
                                            }
                                        );
                                    }.bind(this);
                                    var fnStoreResult = function (
                                        oStoredResult
                                    ) {
                                        aResults.push(Object.assign(
                                            {},
                                            oStoredResult,
                                            { group: oGroup }
                                        ));
                                    };

                                    this._logInfo(
                                        "ANULACION_SECUENCIAL.RESPUESTA",
                                        "Respuesta final de HU " +
                                            iPosition + " de " +
                                            aGroups.length + ": " +
                                            sResponseStatus,
                                        {
                                            traceId:
                                                sSequentialTraceId,
                                            position: iPosition,
                                            HuVenum: oGroup.HuVenum,
                                            HuExidv: oGroup.HuExidv,
                                            Status: sResponseStatus,
                                            Message: oResult.data &&
                                                oResult.data.Message ||
                                                this._getAnulacionResultErrorMessage(
                                                    oResult
                                                )
                                        }
                                    );

                                    if (bFunctionalError) {
                                        fnStoreResult(Object.assign(
                                            {},
                                            oResult,
                                            { functionalError: true }
                                        ));
                                        fnUpdateProgressFromResults({
                                            title: "La HU " + iPosition +
                                                " de " + aGroups.length +
                                                " no pudo anularse",
                                            message:
                                                "SAP devolvió un error funcional. El proceso se detuvo para proteger las HUs pendientes.",
                                            state: "Error"
                                        });
                                        iCurrentGroup++;
                                        this._logError(
                                            "ANULACION_SECUENCIAL.DETENIDA",
                                            "SAP devolvió Status E; no se enviarán las HU restantes",
                                            {
                                                traceId:
                                                    sSequentialTraceId,
                                                HuVenum: oGroup.HuVenum,
                                                HuExidv: oGroup.HuExidv,
                                                Status: sResponseStatus,
                                                pendingHu:
                                                    aGroups.length -
                                                    iCurrentGroup
                                            }
                                        );
                                        fnAddPendingResults(
                                            iCurrentGroup,
                                            "No se envió porque una HU anterior regresó error."
                                        );
                                        this._finalizeMultipleAnulaciones(
                                            sMatDoc,
                                            aResults
                                        );
                                        return;
                                    }

                                    if (oResult.success !== true) {
                                        fnUpdateProgressFromResults({
                                            title: "Verificando la HU " +
                                                iPosition + " de " +
                                                aGroups.length,
                                            message:
                                                "SAP devolvió un error técnico. Consultando el preview antes de decidir el resultado.",
                                            state: "Warning"
                                        });
                                        this._logWarn(
                                            "ANULACION_SECUENCIAL.RECONCILIACION",
                                            "El POST tuvo un error técnico; se consultará el preview antes de decidir el resultado",
                                            {
                                                traceId:
                                                    sSequentialTraceId,
                                                HuVenum: oGroup.HuVenum,
                                                HuExidv: oGroup.HuExidv,
                                                error: this._serializeError(
                                                    oResult.error
                                                )
                                            }
                                        );

                                        this._reconcileHuAfterTechnicalError(
                                            sMatDoc,
                                            oGroup,
                                            function (oReconciliation) {
                                                if (oReconciliation.cancelled) {
                                                    fnStoreResult({
                                                        success: true,
                                                        technicalWarning: true,
                                                        reconciled: true,
                                                        reconciliationAttempts:
                                                            oReconciliation.attempts,
                                                        originalError:
                                                            oResult.error,
                                                        data: {
                                                            Status: "W",
                                                            Message:
                                                                "SAP procesó la HU, aunque el POST regresó un error técnico. La HU desapareció del preview después de " +
                                                                oReconciliation.elapsedMs / 1000 +
                                                                " segundos."
                                                        }
                                                    });
                                                } else {
                                                    fnStoreResult(Object.assign(
                                                        {},
                                                        oResult,
                                                        {
                                                            success: false,
                                                            technicalError:
                                                                true,
                                                            reconciled:
                                                                oReconciliation.previewUpdated,
                                                            reconciliationAttempts:
                                                                oReconciliation.attempts,
                                                            originalError:
                                                                oResult.error,
                                                            error: {
                                                                message:
                                                                    bMessageTypeX
                                                                        ? this._getMessageTypeXFunctionalMessage()
                                                                        : oReconciliation.huStillPresent
                                                                        ? "La HU continúa apareciendo en el preview después de " +
                                                                            oReconciliation.elapsedMs / 1000 +
                                                                            " segundos y " +
                                                                            oReconciliation.attempts +
                                                                            " intentos de reconciliación."
                                                                        : "No fue posible confirmar el resultado del POST después de " +
                                                                            oReconciliation.attempts +
                                                                            " intentos de reconciliación durante " +
                                                                            oReconciliation.elapsedMs / 1000 +
                                                                            " segundos. " +
                                                                            this._getAnulacionResultErrorMessage(
                                                                                oResult
                                                                            )
                                                            }
                                                        }
                                                    ));
                                                }

                                                fnUpdateProgressFromResults({
                                                    title:
                                                        oReconciliation.cancelled
                                                            ? aResults.filter(function (
                                                                oStoredResult
                                                            ) {
                                                                return oStoredResult.success ===
                                                                    true;
                                                            }).length +
                                                                " de " +
                                                                aGroups.length +
                                                                " HU anuladas"
                                                            : "La HU " +
                                                                iPosition +
                                                                " de " +
                                                                aGroups.length +
                                                                " no fue anulada",
                                                    message:
                                                        oReconciliation.cancelled
                                                            ? "La HU desapareció del preview y quedó confirmada con advertencia técnica."
                                                            : "La HU continúa pendiente después de la reconciliación.",
                                                    state:
                                                        oReconciliation.cancelled
                                                            ? "Warning"
                                                            : "Error"
                                                });

                                                if (bMessageTypeX) {
                                                    iCurrentGroup++;
                                                    fnAddPendingResults(
                                                        iCurrentGroup,
                                                        "No se envió porque el proceso se detuvo para evitar inconsistencias. Vuelva a consultar el documento antes de reintentar."
                                                    );
                                                    fnUpdateProgressFromResults({
                                                        title:
                                                            "Proceso detenido por respuesta técnica de SAP",
                                                        message:
                                                            "No se enviarán las HUs restantes. Vuelva a consultar el documento antes de reintentar.",
                                                        state: "Error"
                                                    });
                                                    this._logError(
                                                        "ANULACION_SECUENCIAL.DETENIDA_MESSAGE_TYPE_X",
                                                        "SAP devolvió HTTP 500 / MESSAGE_TYPE_X; la cola se detuvo después de reconciliar la HU",
                                                        {
                                                            traceId:
                                                                sSequentialTraceId,
                                                            MatDoc: sMatDoc,
                                                            HuVenum:
                                                                oGroup.HuVenum,
                                                            HuExidv:
                                                                oGroup.HuExidv,
                                                            cancelled:
                                                                oReconciliation.cancelled,
                                                            pendingHu:
                                                                aGroups.length -
                                                                iCurrentGroup
                                                        }
                                                    );
                                                    this._finalizeMultipleAnulaciones(
                                                        sMatDoc,
                                                        aResults,
                                                        {
                                                            previewAlreadyRefreshed:
                                                                oReconciliation.previewUpdated === true
                                                        }
                                                    );
                                                    return;
                                                }

                                                fnContinueQueue(
                                                    oReconciliation.cancelled
                                                        ? oReconciliation.refreshResult
                                                        : null
                                                );
                                            }.bind(this)
                                        );
                                        return;
                                    }

                                    fnStoreResult(oResult);
                                    fnUpdateProgressFromResults({
                                        title: aResults.filter(function (
                                            oStoredResult
                                        ) {
                                            return oStoredResult.success ===
                                                true;
                                        }).length + " de " +
                                            aGroups.length +
                                            " HU anuladas",
                                        message:
                                            "La HU fue aceptada por SAP. Actualizando el preview antes de continuar.",
                                        state: "Success"
                                    });
                                    this._logInfo(
                                        "ANULACION_SECUENCIAL.ESPERA",
                                        "Respuesta aceptada; refrescando el preview antes de esperar 30000 ms",
                                        {
                                            traceId:
                                                sSequentialTraceId,
                                            completedHu:
                                                iCurrentGroup + 1,
                                            pendingHu:
                                                aGroups.length -
                                                iCurrentGroup - 1
                                        }
                                    );

                                    this._refreshPreviewAfterCancellation(
                                        sMatDoc,
                                        function (
                                            bPostPreviewUpdated,
                                            oPostRefreshResult
                                        ) {
                                            if (!bPostPreviewUpdated) {
                                                this._logWarn(
                                                    "ANULACION_SECUENCIAL.POST_REFRESH",
                                                    "La HU fue aceptada, pero el preview posterior no pudo actualizarse; se volverá a consultar antes de la siguiente HU",
                                                    {
                                                        traceId:
                                                            sSequentialTraceId,
                                                        HuVenum:
                                                            oGroup.HuVenum,
                                                        HuExidv:
                                                            oGroup.HuExidv
                                                    }
                                                );
                                            }

                                            fnContinueQueue(
                                                bPostPreviewUpdated
                                                    ? oPostRefreshResult
                                                    : null
                                            );
                                        }.bind(this)
                                    );
                                }.bind(this)
                            }
                        );
                }.bind(this);

                if (oPreparedRefreshResult) {
                    fnProcessRefreshedPreview(
                        true,
                        oPreparedRefreshResult
                    );
                    return;
                }

                this._refreshPreviewAfterCancellation(
                    sMatDoc,
                    fnProcessRefreshedPreview
                );
            }.bind(this);

            fnPostNextGroup();
        },

        _getSapReleaseDelayMs: function () {
            return 30000;
        },

        _waitForSapRelease: function (fnContinue) {
            setTimeout(fnContinue, this._getSapReleaseDelayMs());
        },

        _getTechnicalReconciliationScheduleMs: function () {
            return [15000, 30000, 60000, 120000, 180000];
        },

        _waitForTechnicalReconciliation: function (iDelayMs, fnContinue) {
            setTimeout(fnContinue, iDelayMs);
        },

        _reconcileHuAfterTechnicalError: function (
            sMatDoc,
            oGroup,
            fnComplete
        ) {
            var aSchedule =
                this._getTechnicalReconciliationScheduleMs();
            var iAttemptIndex = 0;
            var iPreviousElapsedMs = 0;
            var fnRunAttempt;
            var fnScheduleNext = function () {
                var iTargetElapsedMs = aSchedule[iAttemptIndex];
                var iDelayMs = Math.max(
                    0,
                    iTargetElapsedMs - iPreviousElapsedMs
                );

                iPreviousElapsedMs = iTargetElapsedMs;
                this._waitForTechnicalReconciliation(
                    iDelayMs,
                    fnRunAttempt
                );
            }.bind(this);

            fnRunAttempt = function () {
                var iAttemptNumber = iAttemptIndex + 1;
                var iElapsedMs = aSchedule[iAttemptIndex];

                this._logInfo(
                    "ANULACION_SECUENCIAL.RECONCILIACION_INTENTO",
                    "Consultando preview después del error técnico",
                    {
                        MatDoc: sMatDoc,
                        HuVenum: oGroup.HuVenum,
                        HuExidv: oGroup.HuExidv,
                        attempt: iAttemptNumber,
                        elapsedMs: iElapsedMs
                    }
                );

                this._refreshPreviewAfterCancellation(
                    sMatDoc,
                    function (bPreviewUpdated, oRefreshResult) {
                        var aPreview = bPreviewUpdated &&
                            oRefreshResult &&
                            oRefreshResult.preview || [];
                        var oLiveHu = bPreviewUpdated
                            ? this._findLiveHuRow(oGroup, aPreview)
                            : null;

                        if (bPreviewUpdated && !oLiveHu) {
                            fnComplete({
                                cancelled: true,
                                previewUpdated: true,
                                huStillPresent: false,
                                attempts: iAttemptNumber,
                                elapsedMs: iElapsedMs,
                                refreshResult: oRefreshResult
                            });
                            return;
                        }

                        iAttemptIndex++;

                        if (iAttemptIndex < aSchedule.length) {
                            fnScheduleNext();
                            return;
                        }

                        fnComplete({
                            cancelled: false,
                            previewUpdated: bPreviewUpdated,
                            huStillPresent:
                                bPreviewUpdated && !!oLiveHu,
                            attempts: iAttemptNumber,
                            elapsedMs: iElapsedMs,
                            error: bPreviewUpdated
                                ? null
                                : oRefreshResult
                        });
                    }.bind(this)
                );
            }.bind(this);

            fnScheduleNext();
        },

        _refreshPreviewAfterCancellation: function (
            sMatDoc,
            fnComplete
        ) {
            var oModel = this.getModel();
            var oVM = this.getVM();
            var sTraceId = this._generateTraceId(
                "PREVIEW_AFTER_ANULACION"
            );

            var sMatYear = String(
                oVM.getProperty("/matYear") || ""
            ).trim();

            oModel.read("/AnulacionSet", {
                filters: [
                    new Filter(
                        "MatDoc",
                        FilterOperator.EQ,
                        sMatDoc
                    ),
                    new Filter(
                        "MatYear",
                        FilterOperator.EQ,
                        sMatYear
                    )
                ],
                urlParameters: {
                    "sap-client": "300",
                    "$format": "json"
                },
                success: function (oData) {
                    var oHeader = this._getDeepPreviewHeader(oData);
                    var aItems = this._getDeepPreviewItems(oHeader);
                    var aGroupedRows = [];
                    var bValidPreview = !!oHeader &&
                        String(oHeader.Status || "")
                            .toUpperCase() !== "E";

                    if (
                        bValidPreview &&
                        aItems.length
                    ) {
                        aGroupedRows = this._buildPreviewRows(
                            this._mapDeepPreviewItems(oHeader, aItems)
                        );
                        this._applyContractSelectionRules(aGroupedRows);
                    }

                    oVM.setProperty("/previewHeader", oHeader || {});
                    oVM.setProperty("/previewItems", aItems);
                    oVM.setProperty("/preview", aGroupedRows);
                    this._refreshPreviewDisplay();
                    this._updateSummary(aGroupedRows);
                    oVM.setProperty("/canCancel", false);

                    this._logInfo(
                        "_refreshPreviewAfterCancellation.success",
                        "Vista previa actualizada después de la anulación",
                        {
                            traceId: sTraceId,
                            matDoc: sMatDoc,
                            huCount:
                                oVM.getProperty("/summary/hu") || 0
                        }
                    );

                    if (typeof fnComplete === "function") {
                        fnComplete(bValidPreview, {
                            header: oHeader,
                            items: aItems,
                            preview: aGroupedRows
                        });
                    }
                }.bind(this),
                error: function (oError) {
                    this._logError(
                        "_refreshPreviewAfterCancellation.error",
                        "No fue posible actualizar la vista previa",
                        {
                            traceId: sTraceId,
                            matDoc: sMatDoc,
                            error: this._serializeError(oError)
                        }
                    );

                    if (typeof fnComplete === "function") {
                        fnComplete(false, oError);
                    }
                }.bind(this)
            });
        },

        _finalizeMultipleAnulaciones: function (
            sMatDoc,
            aResults,
            oFinalizeOptions
        ) {
            var oOptions = oFinalizeOptions || {};
            var aSuccessResults = (aResults || []).filter(
                function (oResult) {
                    return oResult.success === true;
                }
            );
            var aErrorResults = (aResults || []).filter(
                function (oResult) {
                    return oResult.success !== true;
                }
            );
            var aSuccessfulSelections = [];
            var aRunIds = [];
            var iSuccessfulHu = aSuccessResults.reduce(
                function (iTotal, oResult) {
                    return iTotal + Number(oResult.huCount || 1);
                },
                0
            );
            var iErrorHu = aErrorResults.reduce(
                function (iTotal, oResult) {
                    return iTotal + Number(oResult.huCount || 1);
                },
                0
            );
            var iTotalHu = iSuccessfulHu + iErrorHu;
            var bHasWarnings = aSuccessResults.some(function (oResult) {
                return oResult.technicalWarning === true ||
                    oResult.alreadyRemoved === true ||
                    String(
                        oResult.data && oResult.data.Status || ""
                    ).toUpperCase() === "W";
            });

            aSuccessResults.forEach(function (oResult) {
                aSuccessfulSelections = aSuccessfulSelections.concat(
                    oResult.group.selections || []
                );

                if (oResult.data && oResult.data.RunId) {
                    aRunIds.push(oResult.data.RunId);
                }
            });

            var sStatus = aErrorResults.length
                ? (aSuccessResults.length ? "W" : "E")
                : (bHasWarnings ? "W" : "S");
            var sMessage = aErrorResults.length
                ? iSuccessfulHu + " de " +
                    iTotalHu +
                    " HU se anularon correctamente."
                : iSuccessfulHu +
                    " HU se anularon correctamente.";
            var sDetailedMessage =
                this._buildMultipleAnulacionResultMessage(
                    sMessage,
                    aSuccessResults,
                    aErrorResults
                );

            this.getVM().setProperty("/resultado", {
                Status: sStatus,
                Message: sMessage
            });
            this.getVM().setProperty(
                "/resultadoState",
                this._getState(sStatus)
            );
            this.getVM().setProperty("/canCancel", false);
            this.getVM().setProperty(
                "/lastRunId",
                aRunIds.join(";")
            );
            this.getVM().setProperty(
                "/cancellationSummary",
                aSuccessResults.length
                    ? this._buildCancellationSummary(
                        sMatDoc,
                        aSuccessfulSelections,
                        aRunIds.join(" | ")
                    )
                    : this._getEmptyCancellationSummary()
            );
            this.getVM().setProperty("/selectedSection", "detail");

            var fnCompleteFinalization = function (bPreviewUpdated) {
                    this._finishCancellationProgress();
                    this.getVM().setProperty("/busy", false);

                    if (!bPreviewUpdated) {
                        MessageToast.show(
                            "La anulación terminó, pero no fue posible refrescar la vista previa."
                        );
                    }

                    if (!aSuccessResults.length) {
                        MessageBox.error(sDetailedMessage, {
                            title: "Resultado de anulación"
                        });
                        return;
                    }

                    if (aErrorResults.length || bHasWarnings) {
                        MessageBox.warning(sDetailedMessage, {
                            title: "Resultado de anulación"
                        });
                    } else {
                        MessageToast.show(sMessage);
                    }

                    this._getDetalleFinalByMatDoc(sMatDoc);
                }.bind(this);

            if (oOptions.previewAlreadyRefreshed) {
                fnCompleteFinalization(true);
                return;
            }

            this._refreshPreviewAfterCancellation(
                sMatDoc,
                fnCompleteFinalization
            );
        },

        _sendODataCreateWithTimeout: function (
            oModel,
            sPath,
            oPayload,
            oRequestOptions
        ) {
            var oOptions = oRequestOptions || {};
            var iTimeoutMs = Math.max(
                1,
                Number(oOptions.timeoutMs) ||
                    this._getAnulacionTimeoutMs()
            );
            var bFinished = false;
            var oRequestHandle;
            var iTimeoutId;
            var oVM = this.getVM && this.getVM();

            var fnComplete = function (fnCallback, aArguments) {
                if (bFinished) {
                    return;
                }

                bFinished = true;
                clearTimeout(iTimeoutId);

                if (typeof fnCallback === "function") {
                    fnCallback.apply(
                        this,
                        aArguments || []
                    );
                }
            }.bind(this);

            iTimeoutId = setTimeout(function () {
                if (bFinished) {
                    return;
                }

                bFinished = true;
                clearTimeout(iTimeoutId);

                try {
                    if (
                        oRequestHandle &&
                        typeof oRequestHandle.abort === "function"
                    ) {
                        oRequestHandle.abort();
                    }
                } catch (oAbortError) {
                    this._logWarn(
                        "_sendODataCreateWithTimeout.abort",
                        "No fue posible abortar la solicitud vencida.",
                        this._serializeError(oAbortError)
                    );
                }

                var oTimeoutError = {
                    message:
                        "SAP no respondió dentro de los 9 minutos configurados.",
                    statusCode: 0,
                    statusText: "CLIENT_TIMEOUT",
                    responseText: "",
                    isTimeout: true
                };

                this._logError(
                    "_sendODataCreateWithTimeout.timeout",
                    "El POST de anulación agotó el tiempo de espera.",
                    {
                        path: sPath,
                        timeoutMs: iTimeoutMs,
                        payload: oPayload
                    }
                );

                if (typeof oOptions.error === "function") {
                    oOptions.error.call(this, oTimeoutError);
                }
            }.bind(this), iTimeoutMs);

            // Cede el hilo al navegador para que UI5 pinte el avance antes
            // de abrir la conexión larga contra SAP.
            setTimeout(function () {
                if (bFinished) {
                    return;
                }

                try {
                    // BREAKPOINT TEMPORAL DE SOPORTE:
                    // con DevTools abierto, la ejecución se detiene aquí antes
                    // de que UI5 envíe el POST. Revisar oPayload y pulsar F8
                    // para continuar. Cambiar /debugBreakBeforePost a false
                    // cuando termine la prueba.
                    if (
                        oVM &&
                        oVM.getProperty("/debugBreakBeforePost") === true
                    ) {
                        if (
                            typeof window !== "undefined" &&
                            window.console
                        ) {
                            window.console.log(
                                "[ANULACION POST] Detenido antes de enviar",
                                {
                                    method: "POST",
                                    endpoint: sPath,
                                    payload: oPayload,
                                    payloadJson: JSON.stringify(
                                        oPayload,
                                        null,
                                        2
                                    )
                                }
                            );
                        }

                        // eslint-disable-next-line no-debugger
                        debugger;
                    }

                    oRequestHandle = oModel.create(
                        sPath,
                        oPayload,
                        {
                            async: true,
                            success: function (oData, oResponse) {
                                fnComplete(
                                    oOptions.success,
                                    [oData, oResponse]
                                );
                            },
                            error: function (oError) {
                                fnComplete(
                                    oOptions.error,
                                    [oError]
                                );
                            }
                        }
                    );
                } catch (oCreateError) {
                    fnComplete(
                        oOptions.error,
                        [oCreateError]
                    );
                }
            }, 50);
        },

        _validateCancellationResponse: function (oData) {
            var sStatus = String(
                oData && oData.Status || ""
            ).trim().toUpperCase();
            var sMessage = String(
                oData && (
                    oData.BapiMessage ||
                    oData.Message
                ) || ""
            ).trim();
            var sReverseMatDoc = String(
                oData && (
                    oData.ReverseMatDoc ||
                    oData.ReversalMatDoc
                ) || ""
            ).trim();
            var sReverseYear = String(
                oData && (
                    oData.ReverseMatYear ||
                    oData.ReversalYear
                ) || ""
            ).trim();
            var sReverseMovement = String(
                oData && (
                    oData.ReverseMovement ||
                    oData.ReversalMovement
                ) || ""
            ).trim();

            if (sStatus !== "S") {
                return {
                    success: false,
                    status: sStatus || "E",
                    message: sMessage ||
                        "SAP no confirmó la anulación."
                };
            }

            if (
                !sReverseMatDoc ||
                !sReverseYear ||
                sReverseMovement !== "102"
            ) {
                return {
                    success: false,
                    status: "W",
                    message:
                        "SAP respondió la solicitud, pero no devolvió un documento de reversa 102 confirmado."
                };
            }

            return {
                success: true,
                status: "S",
                message: sMessage || "Anulación MM confirmada.",
                reverseMatDoc: sReverseMatDoc,
                reverseYear: sReverseYear,
                reverseMovement: sReverseMovement
            };
        },

        _postAnulacion: function (
            sMatDoc,
            aHuSelections,
            oExecutionOptions
        ) {
            var oModel = this.getModel();
            var sTraceId =
                this._generateTraceId("POST_ANULACION");
            var aSelections = Array.isArray(aHuSelections)
                ? aHuSelections
                : [];
            var oOptions = oExecutionOptions || {};
            var bDeepSelection =
                oOptions.deepSelection === true;
            var sPath = bDeepSelection
                ? "/AnulacionPreviewHeaderSet"
                : "/AnulacionSet";
            var bOmitHuIdentifiers =
                oOptions.omitHuIdentifiers === true;
            var bMatDocOnly = oOptions.matDocOnly === true;

            // =========================================================
            // VALIDAR SELECCIONES
            // =========================================================

            if ((!bMatDocOnly || bDeepSelection) && !aSelections.length) {
                var sEmptySelectionMessage =
                    "No se encontraron proveedores seleccionados para la HU.";

                if (typeof oOptions.onComplete === "function") {
                    oOptions.onComplete({
                        success: false,
                        error: { message: sEmptySelectionMessage },
                        selections: aSelections
                    });
                } else {
                    MessageBox.warning(sEmptySelectionMessage);
                }
                return;
            }

            // El payload de AnulacionSet recibe una sola HU por solicitud.
            // Validamos que todas las selecciones correspondan a la misma HU.
            var sHuVenum = bOmitHuIdentifiers
                ? ""
                : aSelections[0].HuVenum || "";
            var sHuExidv = bOmitHuIdentifiers
                ? ""
                : aSelections[0].HuExidv || "";

            if (
                !bDeepSelection &&
                !bOmitHuIdentifiers &&
                (!sHuVenum || !sHuExidv)
            ) {
                var sHuValidationMessage =
                    "La llamada individual requiere HuVenum y HuExidv.";

                if (typeof oOptions.onComplete === "function") {
                    oOptions.onComplete({
                        success: false,
                        error: { message: sHuValidationMessage },
                        selections: aSelections
                    });
                } else {
                    MessageBox.warning(sHuValidationMessage);
                }
                return;
            }

            var bDifferentHu = aSelections.some(function (oItem) {
                return (
                    (oItem.HuVenum || "") !== sHuVenum ||
                    (oItem.HuExidv || "") !== sHuExidv
                );
            });

            if (
                !bDeepSelection &&
                bDifferentHu &&
                !bOmitHuIdentifiers
            ) {
                this._postMultipleAnulaciones(
                    sMatDoc,
                    aSelections
                );
                return;
            }

            // =========================================================
            // CONCATENAR PROVEEDORES Y PEDIDOS CON ;
            // =========================================================

            var sProveedoresSel = aSelections
                .map(function (oItem) {
                    return String(oItem.Lifnr || "").trim();
                })
                .filter(function (sValue) {
                    return !!sValue;
                })
                .join(";");

            var sEbelnsSel = aSelections
                .map(function (oItem) {
                    return String(oItem.Ebeln || "").trim();
                })
                .filter(function (sValue) {
                    return !!sValue;
                })
                .join(";");

            if (!bMatDocOnly && !sProveedoresSel) {
                var sProviderValidationMessage =
                    "No se encontraron números de proveedor para enviar a la anulación.";

                if (typeof oOptions.onComplete === "function") {
                    oOptions.onComplete({
                        success: false,
                        error: { message: sProviderValidationMessage },
                        selections: aSelections
                    });
                } else {
                    MessageBox.warning(sProviderValidationMessage);
                }
                return;
            }

            if (!bMatDocOnly && !sEbelnsSel) {
                var sOrderValidationMessage =
                    "No se encontraron pedidos de compra para enviar a la anulación.";

                if (typeof oOptions.onComplete === "function") {
                    oOptions.onComplete({
                        success: false,
                        error: { message: sOrderValidationMessage },
                        selections: aSelections
                    });
                } else {
                    MessageBox.warning(sOrderValidationMessage);
                }
                return;
            }

            // =========================================================
            // PAYLOAD FINAL PARA SAP
            // Ejemplo:
            // {
            //   MatDoc: "5000560246",
            //   HuVenum: "0001522998",
            //   HuExidv: "00000000000403033005",
            //   ProveedoresSel: "0050001112;0050001177",
            //   EbelnsSel: "4700090510;4700090512"
            // }
            // =========================================================

            // MODO ACTUAL QAS: el contrato permite enviar únicamente MatDoc
            // y requiere conservar vacíos los campos opcionales. Para volver
            // al flujo anterior basta desactivar /matDocOnlyMode.
            var oPayload;

            try {
                oPayload = bDeepSelection
                    ? this._buildDeepAnulacionPayload(
                        sMatDoc,
                        aSelections,
                        this.getVM().getProperty("/previewItems") || [],
                        this.getVM().getProperty("/previewHeader") || {},
                        this.getVM().getProperty("/matYear")
                    )
                    : bMatDocOnly
                        ? this._buildMatDocOnlyPayload(sMatDoc)
                        : this._buildAnulacionPayload(
                            sMatDoc,
                            aSelections,
                            bOmitHuIdentifiers
                        );
            } catch (oPayloadError) {
                this.getVM().setProperty("/busy", false);
                this._logError(
                    "_postAnulacion.payload",
                    "No fue posible construir el payload.",
                    {
                        traceId: sTraceId,
                        error: oPayloadError.message,
                        selections: aSelections
                    }
                );
                MessageBox.error(oPayloadError.message);
                return;
            }

            var sServiceUrl =
                oModel && oModel.sServiceUrl
                    ? oModel.sServiceUrl
                    : "/sap/opu/odata/sap/ZGP_ANULACION_SRV/";

            var sPostUri =
                sServiceUrl.replace(/\/$/, "") +
                sPath;

            this._logInfo(
                "_postAnulacion.request",
                bDeepSelection
                    ? "Enviando cabecera y posiciones seleccionadas a SAP."
                    : bMatDocOnly
                    ? "Enviando el MatDoc completo a SAP."
                    : "Enviando una HU a SAP.",
                {
                    traceId: sTraceId,
                    method: "POST",
                    uri: sPostUri,
                    path: sPath,
                    MatDoc: sMatDoc,
                    HuVenum: sHuVenum,
                    HuExidv: sHuExidv,
                    payload: oPayload
                }
            );

            if (!oOptions.isBatchItem) {
                this.getVM().setProperty(
                    "/busy",
                    true
                );

                this.getVM().setProperty(
                    "/detalle",
                    []
                );
                this.getVM().setProperty(
                    "/cancellationSummary",
                    this._getEmptyCancellationSummary()
                );
            }

            // =========================================================
            // ENVÍO A SAP
            // =========================================================

            var fnSendRequest = function (bCsrfRetried) {
                this._logPostPayload(
                    sTraceId,
                    sPostUri,
                    oPayload,
                    bCsrfRetried
                );

                this._sendODataCreateWithTimeout(
                    oModel,
                    sPath,
                    oPayload,
                    {
                    timeoutMs: this._getAnulacionTimeoutMs(),
                    success: function (oData, oResponse) {
                        this._debugEccTraffic(
                            "POST - RESPUESTA RECIBIDA",
                            {
                                traceId: sTraceId,
                                httpStatus:
                                    this._getHttpStatusCode(oResponse),
                                response: oData,
                                rawResponse: oResponse
                            }
                        );

                        this._logInfo(
                            "_postAnulacion.success",
                            "SAP respondió al POST de anulación.",
                            {
                                traceId: sTraceId,
                                MatDoc: sMatDoc,
                                HuVenum: sHuVenum,
                                HuExidv: sHuExidv,
                                httpStatus:
                                    this._getHttpStatusCode(oResponse),
                                Status: oData && oData.Status,
                                Message: oData && (
                                    oData.BapiMessage ||
                                    oData.Message
                                )
                            }
                        );

                        if (typeof oOptions.onComplete === "function") {
                            var oBatchValidation =
                                this._validateCancellationResponse(oData);
                            var sBatchStatus = String(
                                oData && oData.Status
                                    ? oData.Status
                                    : ""
                            ).toUpperCase();
                            var iHttpStatus =
                                this._getHttpStatusCode(oResponse);
                            var bCreated =
                                !iHttpStatus || iHttpStatus === 201;
                            var bBatchSuccess =
                                bCreated &&
                                oBatchValidation.success === true;

                            oOptions.onComplete({
                                success: bBatchSuccess,
                                functionalError: sBatchStatus === "E",
                                technicalError:
                                    !bBatchSuccess &&
                                    sBatchStatus !== "E",
                                csrfRetried: bCsrfRetried,
                                httpStatus: iHttpStatus || null,
                                data: oData || {},
                                error: bBatchSuccess
                                    ? null
                                    : {
                                        message:
                                            oBatchValidation.message
                                    },
                                payload: oPayload,
                                selections: aSelections
                            });
                            return;
                        }

                        var oValidation =
                            this._validateCancellationResponse(oData);
                        var sStatus = oValidation.status;
                        var sMessage = oValidation.message;

                        var sRunId =
                            oData && oData.RunId
                                ? oData.RunId
                                : "";

                        this.getVM().setProperty(
                            "/resultado",
                            {
                                Status: sStatus,
                                Message: sMessage
                            }
                        );

                        this.getVM().setProperty(
                            "/resultadoState",
                            this._getState(sStatus)
                        );

                        this.getVM().setProperty(
                            "/canCancel",
                            false
                        );

                        this.getVM().setProperty(
                            "/lastRunId",
                            sRunId
                        );

                        this.getVM().setProperty(
                            "/cancellationSummary",
                            oValidation.success === true
                                ? this._buildCancellationSummary(
                                    sMatDoc,
                                    aSelections,
                                    sRunId
                                )
                                : this._getEmptyCancellationSummary()
                        );

                        this.getVM().setProperty(
                            "/selectedSection",
                            "detail"
                        );

                        MessageToast.show(
                            oValidation.success
                                ? "Movimiento 102 confirmado: " +
                                    oValidation.reverseMatDoc + " / " +
                                    oValidation.reverseYear
                                : sMessage
                        );

                        if (sRunId) {
                            this._getDetalleFinalByRunId(
                                sRunId
                            );
                        } else {
                            this._getDetalleFinalByMatDoc(
                                sMatDoc
                            );
                        }
                    }.bind(this),

                    error: function fnRequestError(
                        oError,
                        bRefreshFailed
                    ) {
                        var bAlreadyRetried =
                            bCsrfRetried || bRefreshFailed === true;

                        if (
                            !bAlreadyRetried &&
                            this._isCsrfError(oError) &&
                            typeof oModel.refreshSecurityToken ===
                                "function"
                        ) {
                            this._logWarn(
                                "_postAnulacion.csrf",
                                "SAP respondió 403; se refrescará el token CSRF y se reintentará una sola vez",
                                {
                                    traceId: sTraceId,
                                    payload: oPayload,
                                    error: this._serializeError(oError)
                                }
                            );
                            oModel.refreshSecurityToken(
                                function () {
                                    fnSendRequest(true);
                                },
                                function (oRefreshError) {
                                    fnRequestError.call(
                                        this,
                                        oRefreshError || oError,
                                        true
                                    );
                                }.bind(this),
                                true
                            );
                            return;
                        }

                        var bMessageTypeX =
                            this._isMessageTypeXError(oError);
                        var oSerializedError =
                            this._serializeError(oError);

                        if (bMessageTypeX) {
                            this._logError(
                                "_postAnulacion.MESSAGE_TYPE_X",
                                "SAP MM-IM terminó el movimiento 102 con MESSAGE_TYPE_X",
                                {
                                    traceId: sTraceId,
                                    timestamp: new Date().toISOString(),
                                    MatDoc: sMatDoc,
                                    HuVenum: oPayload.HuVenum,
                                    HuExidv: oPayload.HuExidv,
                                    PO: oPayload.EbelnsSel,
                                    Proveedor:
                                        oPayload.ProveedoresSel,
                                    httpStatus:
                                        this._getHttpStatusCode(oError),
                                    sapError: "MESSAGE_TYPE_X",
                                    responseText:
                                        oSerializedError.responseText
                                }
                            );
                        }

                        this._logError(
                            "_postAnulacion.error",
                            "Error al ejecutar la anulación",
                            {
                                traceId: sTraceId,
                                method: "POST",
                                uri: sPostUri,
                                MatDoc: sMatDoc,
                                HuVenum: sHuVenum,
                                HuExidv: sHuExidv,
                                httpStatus:
                                    this._getHttpStatusCode(oError),
                                payload: oPayload,
                                error: oSerializedError
                            }
                        );

                        if (typeof oOptions.onComplete === "function") {
                            oOptions.onComplete({
                                success: false,
                                functionalError: false,
                                technicalError: true,
                                messageTypeX: bMessageTypeX,
                                csrfRetried: bAlreadyRetried,
                                error: oError,
                                payload: oPayload,
                                selections: aSelections
                            });
                            return;
                        }

                        this.getVM().setProperty(
                            "/canCancel",
                            false
                        );

                        this._showODataError(
                            bMessageTypeX
                                ? this._getMessageTypeXFunctionalMessage()
                                : "Error al anular el documento.",
                            bMessageTypeX ? null : oError
                        );
                    }.bind(this)
                    }
                );
            }.bind(this);

            fnSendRequest(false);
        },

        _getDetalleFinalByRunId: function (sRunId) {
            var oModel = this.getModel();

            oModel.read("/AnulacionDetalleSet", {
                filters: [
                    new Filter(
                        "RunId",
                        FilterOperator.EQ,
                        sRunId
                    )
                ],

                success: function (oData) {
                    var aResults =
                        oData && oData.results
                            ? oData.results
                            : [];

                    this.getVM().setProperty(
                        "/detalle",
                        aResults
                    );

                    this.getVM().setProperty(
                        "/busy",
                        false
                    );

                    this._actualizarResultadoDesdeDetalle(
                        aResults
                    );
                }.bind(this),

                error: function (oError) {
                    this.getVM().setProperty(
                        "/detalle",
                        []
                    );

                    this.getVM().setProperty(
                        "/busy",
                        false
                    );

                    this._showODataError(
                        "Error al consultar el detalle final por RunId.",
                        oError
                    );
                }.bind(this)
            });
        },

        _getDetalleFinalByMatDoc: function (sMatDoc) {
            var oModel = this.getModel();

            oModel.read("/AnulacionDetalleSet", {
                filters: [
                    new Filter(
                        "MatDoc",
                        FilterOperator.EQ,
                        sMatDoc
                    )
                ],

                success: function (oData) {
                    var aResults =
                        oData && oData.results
                            ? oData.results
                            : [];

                    this.getVM().setProperty(
                        "/detalle",
                        aResults
                    );

                    this.getVM().setProperty(
                        "/busy",
                        false
                    );

                    this._actualizarResultadoDesdeDetalle(
                        aResults
                    );
                }.bind(this),

                error: function () {
                    this.getVM().setProperty(
                        "/detalle",
                        []
                    );

                    this.getVM().setProperty(
                        "/busy",
                        false
                    );
                }.bind(this)
            });
        },

        _actualizarResultadoDesdeDetalle: function (aDetalle) {
            if (!aDetalle || !aDetalle.length) {
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

            var oFinal =
                oError ||
                oWarning ||
                oSuccess ||
                aDetalle[0];

            this.getVM().setProperty("/resultado", {
                Status: oFinal.Status || "",
                Message:
                    oFinal.Message ||
                    "Proceso consultado correctamente."
            });

            this.getVM().setProperty(
                "/resultadoState",
                this._getState(oFinal.Status || "")
            );
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

        _getEmptyCancellationProgress: function () {
            return {
                active: false,
                current: 0,
                total: 0,
                completed: 0,
                success: 0,
                failed: 0,
                pending: 0,
                percent: 0,
                displayValue: "0 de 0 HU procesadas",
                title: "Preparando la anulación",
                message:
                    "Validando las HUs seleccionadas antes de iniciar.",
                state: "Information",
                currentHu: ""
            };
        },

        _startCancellationProgress: function (iTotalHu) {
            var iTotal = Math.max(0, Number(iTotalHu) || 0);
            var oProgress = this._getEmptyCancellationProgress();

            oProgress.active = true;
            oProgress.total = iTotal;
            oProgress.pending = iTotal;
            oProgress.displayValue = "0 de " + iTotal +
                " HU procesadas";

            this.getVM().setProperty(
                "/cancellationProgress",
                oProgress
            );
        },

        _updateCancellationProgress: function (oChanges) {
            var oVM = this.getVM();
            var oCurrent = typeof oVM.getProperty === "function"
                ? oVM.getProperty("/cancellationProgress")
                : null;
            var oProgress = Object.assign(
                {},
                this._getEmptyCancellationProgress(),
                oCurrent || {},
                oChanges || {}
            );
            var iTotal = Math.max(
                0,
                Number(oProgress.total) || 0
            );
            var iCompleted = Math.min(
                iTotal,
                Math.max(0, Number(oProgress.completed) || 0)
            );

            oProgress.total = iTotal;
            oProgress.completed = iCompleted;
            oProgress.pending = Math.max(0, iTotal - iCompleted);
            oProgress.percent = iTotal
                ? Math.round(iCompleted / iTotal * 100)
                : 0;
            oProgress.displayValue = iCompleted + " de " +
                iTotal + " HU procesadas";

            oVM.setProperty(
                "/cancellationProgress",
                oProgress
            );
        },

        _finishCancellationProgress: function () {
            this._updateCancellationProgress({
                active: false
            });
        },

        _getInitialState: function () {
    return {
        matDoc: "",
        matYear: String(new Date().getFullYear()),
        // Diagnóstico temporal: muestra GET, payload POST y respuesta POST
        // en la consola del navegador. Cambiar la segunda bandera a true
        // para detenerse automáticamente en cada punto con DevTools abierto.
        debugEccTraffic: true,
        debugBreakOnEccTraffic: false,
        // BREAKPOINT TEMPORAL: true detiene la ejecución justo antes del POST.
        // Después de revisar el payload y presionar F8, cambiar a false.
        debugBreakBeforePost: true,
        // MODO ACTUAL QAS: true = selección individual de mercancías y
        // preparación de cabecera + ToItems para AnulacionPreviewHeaderSet.
        // Para regresar al flujo anterior de HU/pedidos, cambiar a false.
        matDocOnlyMode: true,
        // POST profundo habilitado para el contrato confirmado de
        // AnulacionPreviewHeaderSet. Cambiar a true para volver a bloquearlo.
        backendPrevalidationOnly: false,
        backendPlanValidated: false,
        canCancel: false,
        materialSelectionCount: 0,
        busy: false,
        lastRunId: "",
        selectedSection: "preview",

        resultado: {
            Status: "",
            Message: ""
        },

        resultadoState: "None",
        cancellationSummary: this._getEmptyCancellationSummary(),
        cancellationProgress: this._getEmptyCancellationProgress(),
        preview: [],
        previewDisplay: [],
        previewHeader: {},
        previewItems: [],
        eccPlan: {
            validated: false,
            matDoc: "",
            year: "",
            movementType: "",
            huFound: 0,
            huAffected: 0,
            cancelPositions: 0,
            preservePositions: 0,
            pendingPositions: 0,
            cancelQuantity: 0,
            unit: ""
        },
        expandedPreviewGroups: {},
        detalle: [],

        summary: {
            total: 0,
            hu: 0,
            material: 0,
            otros: 0,
            huPendientes: 0,
            huSelectionPending: 0
        },

        providerDialog: {
            rowPath: "",
            huVenum: "",
            huExidv: "",
            providerCount: 0,
            purchaseOrderCount: 0,
            optionCount: 0,
            infoText: "",
            providers: [],

            // Selección múltiple.
            selectedProviderKeys: [],
            selectedCount: 0,
            canConfirm: false,

            // Compatibilidad con fragmentos/versiones anteriores.
            selectedProviderKey: ""
        },

        statusMessageDialog: {
            title: "Mensaje de SAP",
            message: "",
            sourceText: "Respuesta de SAP"
        },

        confirmationDialog: {
            matDoc: "",
            matDocOnly: true,
            total: 0,
            hu: 0,
            huSeleccionadas: 0,
            material: 0,
            otros: 0,
            selectionCount: 0,
            selections: [],
            materialSelections: []
        }
    };
},


        onShowPreview: function () {
            this.getVM().setProperty(
                "/selectedSection",
                "preview"
            );
        },

        onShowFinalDetail: function () {
            this.getVM().setProperty(
                "/selectedSection",
                "detail"
            );
        },

        _showODataError: function (
            sDefaultMessage,
            oError
        ) {
            var sMessage = sDefaultMessage;

            try {
                if (oError && oError.responseText) {
                    var oResponse =
                        JSON.parse(oError.responseText);

                    if (
                        oResponse &&
                        oResponse.error &&
                        oResponse.error.message &&
                        oResponse.error.message.value
                    ) {
                        sMessage =
                            oResponse.error.message.value;
                    }
                } else if (
                    oError &&
                    oError.message
                ) {
                    sMessage = oError.message;
                }
            } catch (e) {
                if (
                    oError &&
                    oError.message
                ) {
                    sMessage = oError.message;
                }
            }

            this.getVM().setProperty("/resultado", {
                Status: "E",
                Message: sMessage
            });

            this.getVM().setProperty(
                "/resultadoState",
                "Error"
            );

            this.getVM().setProperty(
                "/busy",
                false
            );

            this._showStatusMessageDialog(
                sMessage,
                "Error de comunicación con SAP"
            );
        }
    });
});
