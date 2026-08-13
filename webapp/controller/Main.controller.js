sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment"
], function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    MessageBox,
    MessageToast,
    Fragment
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

        onMatDocLiveChange: function (oEvent) {
            var sOriginal = oEvent.getParameter("value") || "";
            var sSoloNumeros = sOriginal.replace(/\D/g, "");

            this.getVM().setProperty("/matDoc", sSoloNumeros);

            if (!sSoloNumeros) {
                this.getVM().setProperty("/canCancel", false);
            }
        },

        onLimpiar: function () {
            this.getVM().setData(this._getInitialState());
            MessageToast.show("La información fue limpiada.");
        },

        onBuscarDocumento: function () {
            var sMatDoc = this.getVM().getProperty("/matDoc");

            if (!sMatDoc) {
                MessageBox.warning("Ingresa un número de documento material.");
                return;
            }

            if (sMatDoc.length < 6) {
                MessageBox.warning(
                    "El documento material capturado parece incompleto."
                );
                return;
            }

            this._getPreview(sMatDoc);
        },

        _resetResultadoConsulta: function () {
            var oVM = this.getVM();

            oVM.setProperty("/preview", []);
            oVM.setProperty("/detalle", []);
            oVM.setProperty("/canCancel", false);
            oVM.setProperty("/lastRunId", "");

            oVM.setProperty("/resultado", {
                Status: "",
                Message: ""
            });

            oVM.setProperty("/resultadoState", "None");

            oVM.setProperty("/summary", {
                total: 0,
                hu: 0,
                material: 0,
                otros: 0,
                huPendientes: 0
            });
        },

        _getPreview: function (sMatDoc) {
            var oModel = this.getModel();
            var oVM = this.getVM();
            var sTraceId = this._generateTraceId("PREVIEW");
            var sPath = "/AnulacionDetallePreviewSet";

            oVM.setProperty("/busy", true);
            this._resetResultadoConsulta();

            this._logInfo("_getPreview", "Inicia consulta de vista previa", {
                traceId: sTraceId,
                matDoc: sMatDoc,
                path: sPath
            });

            oModel.read(sPath, {
                filters: [
                    new Filter(
                        "MatDoc",
                        FilterOperator.EQ,
                        sMatDoc
                    )
                ],

                urlParameters: {
                    "$select": [
                        "MatDoc",
                        "ObjTipo",
                        "ObjKey1",
                        "ObjKey2",
                        "ObjKey3",
                        "Status",
                        "Message",
                        "RunId",
                        "SeqNo",
                        "HuVenum",
                        "HuExidv",
                        "Lifnr",
                        "Name1",
                        "Ebeln",
                        "ProveedorCount",
                        "MultiProveedor"
                    ].join(",")
                },

                success: function (oData) {
                    var aResults = oData && oData.results
                        ? oData.results
                        : [];

                    this._logInfo("_getPreview.success", "Respuesta recibida", {
                        traceId: sTraceId,
                        total: aResults.length,
                        results: aResults
                    });

                    if (
                        !aResults.length ||
                        !this._hasValidPreviewData(aResults)
                    ) {
                        oVM.setProperty("/resultado", {
                            Status: "E",
                            Message: "No se encontraron registros para el documento."
                        });

                        oVM.setProperty("/resultadoState", "Error");
                        oVM.setProperty("/busy", false);
                        oVM.setProperty("/canCancel", false);

                        MessageBox.error(
                            "No se encontraron registros para el documento material capturado."
                        );
                        return;
                    }

                    var aGroupedRows = this._buildPreviewRows(aResults);

                    oVM.setProperty("/preview", aGroupedRows);
                    this._updateSummary(aGroupedRows);
                    this._evaluatePreviewBeforeCancel(aGroupedRows);
                    oVM.setProperty("/busy", false);

                    MessageToast.show(
                        "Vista previa cargada correctamente."
                    );
                }.bind(this),

                error: function (oError) {
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

        _buildPreviewRows: function (aResults) {
            var aRows = [];
            var mHuRows = {};

            (aResults || []).forEach(function (oRawItem) {
                var oItem = Object.assign({}, oRawItem);

                if (!this._isHU(oItem)) {
                    oItem.providerOptions = [];
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
                        oItem.Lifnr || "",
                        oItem.Ebeln || "",
                        oItem.HuVenum || "",
                        oItem.HuExidv || ""
                    ].join("|");

                    var bExists =
                        mHuRows[sHuKey].providerOptions.some(
                            function (oProvider) {
                                return oProvider.providerKey === sProviderKey;
                            }
                        );

                    if (!bExists) {
                        mHuRows[sHuKey].providerOptions.push({
                            providerKey: sProviderKey,
                            Lifnr: oItem.Lifnr || "",
                            Name1: oItem.Name1 || "",
                            Ebeln: oItem.Ebeln || "",
                            HuVenum: oItem.HuVenum || "",
                            HuExidv: oItem.HuExidv || "",
                            selected: false
                        });
                    }
                }
            }.bind(this));

            aRows.forEach(function (oRow) {
                if (this._isHU(oRow)) {
                    oRow.ProveedorCount = Math.max(
                        Number(oRow.ProveedorCount || 0),
                        oRow.providerOptions.length
                    );

                    if (oRow.providerOptions.length === 1) {
                        this._applySelectedProvidersToRow(
                            oRow,
                            [oRow.providerOptions[0]]
                        );
                    }
                }

                this._decoratePreviewRow(oRow);
            }.bind(this));

            return aRows;
        },

        _decoratePreviewRow: function (oRow) {
            oRow.DisplayIcon = this._getObjectIcon(oRow.Message);
            oRow.DisplayStatusText = this._getPreviewStatusText(oRow);
            oRow.DisplayStatusState = this._getPreviewStatusState(oRow);
            oRow.DisplayReference1 = this._isHU(oRow)
                ? (oRow.HuExidv || "")
                : (oRow.ObjKey1 || "");
            oRow.DisplayReference2 = this._isHU(oRow)
                ? (oRow.HuVenum || "")
                : (oRow.ObjKey2 || "");
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
                Number(oRow.ProveedorCount || 0) > 1 ||
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

            this.getVM().setProperty("/summary", {
                total: iTotal,
                hu: iHU,
                material: iMaterial,
                otros: iOtros,
                huPendientes: iHuPendientes
            });
        },

        _evaluatePreviewBeforeCancel: function (aResults) {
            var oSummary = this.getVM().getProperty("/summary");

            var bHasErrors = (aResults || []).some(function (oItem) {
                return oItem.Status === "E";
            });

            if (bHasErrors) {
                this.getVM().setProperty("/resultado", {
                    Status: "E",
                    Message:
                        "La vista previa contiene errores. Revisa el detalle antes de anular."
                });

                this.getVM().setProperty("/resultadoState", "Error");
                this.getVM().setProperty("/canCancel", false);
                return;
            }

            if (oSummary.huPendientes > 0) {
                this.getVM().setProperty("/resultado", {
                    Status: "W",
                    Message:
                        "Vista previa obtenida correctamente. Seleccione uno o varios proveedores en cada HU pendiente para continuar."
                });

                this.getVM().setProperty("/resultadoState", "Warning");
                this.getVM().setProperty("/canCancel", false);
                return;
            }

            this.getVM().setProperty("/resultado", {
                Status: "S",
                Message:
                    "Vista previa obtenida correctamente. Revisa los objetos relacionados antes de anular."
            });

            this.getVM().setProperty("/resultadoState", "Success");
            this.getVM().setProperty("/canCancel", true);
        },

        onOpenProviderDialog: function (oEvent) {
            var oContext = oEvent
                .getSource()
                .getBindingContext("viewModel");

            var sRowPath = oContext.getPath();
            var oRow = oContext.getObject();

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

            this.getVM().setProperty("/providerDialog", {
                rowPath: sRowPath,
                huVenum: oRow.HuVenum || oRow.ObjKey1 || "",
                huExidv: oRow.HuExidv || oRow.MatDoc || "",
                providerCount: aProviders.length,
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
                    "Seleccione al menos un proveedor antes de confirmar."
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
                    ? "Proveedor seleccionado correctamente."
                    : aSelectedProviders.length +
                        " proveedores seleccionados correctamente."
            );
        },

        onCloseProviderDialog: function () {
            if (this._oProviderDialog) {
                this._oProviderDialog.close();
            }
        },

        onAnularDocumento: function () {
            var sMatDoc = this.getVM().getProperty("/matDoc");
            var bCanCancel = this.getVM().getProperty("/canCancel");
            var aPreview = this.getVM().getProperty("/preview") || [];
            var oSummary = this.getVM().getProperty("/summary") || {};

            if (!sMatDoc) {
                MessageBox.warning(
                    "Primero captura un documento material."
                );
                return;
            }

            if (oSummary.huPendientes > 0) {
                MessageBox.warning(
                    "Seleccione uno o varios proveedores en cada HU pendiente antes de anular."
                );
                return;
            }

            if (!bCanCancel) {
                MessageBox.warning(
                    "Primero consulta la vista previa antes de anular."
                );
                return;
            }

            var aHuSelections = this._getHuSelections(aPreview);

            var sConfirmMessage =
                "¿Deseas anular el documento " +
                sMatDoc +
                "?\n\n" +
                "Objetos encontrados: " +
                (oSummary.total || 0) +
                "\n" +
                "HU: " +
                (oSummary.hu || 0) +
                "\n" +
                "Documento material: " +
                (oSummary.material || 0) +
                "\n" +
                "Otros objetos: " +
                (oSummary.otros || 0) +
                "\n\n" +
                "Selecciones HU / proveedor: " +
                aHuSelections.length;

            MessageBox.confirm(sConfirmMessage, {
                title: "Confirmar anulación",
                actions: [
                    MessageBox.Action.OK,
                    MessageBox.Action.CANCEL
                ],
                emphasizedAction: MessageBox.Action.OK,

                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        this._postAnulacion(
                            sMatDoc,
                            aHuSelections
                        );
                    }
                }.bind(this)
            });
        },

        _getHuSelections: function (aPreview) {
            var aSelections = [];
            var mSeen = {};

            (aPreview || []).forEach(function (oRow) {
                if (!this._isHU(oRow)) {
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
                            oProvider.Ebeln || ""
                    };

                    var sSelectionKey = [
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

        _postAnulacion: function (sMatDoc, aHuSelections) {
            var oModel = this.getModel();
            var sTraceId =
                this._generateTraceId("POST_ANULACION");
            var sPath = "/AnulacionSet";
            var aSelections = Array.isArray(aHuSelections)
                ? aHuSelections
                : [];

            // =========================================================
            // VALIDAR SELECCIONES
            // =========================================================

            if (!aSelections.length) {
                MessageBox.warning(
                    "No se encontraron proveedores seleccionados para la HU."
                );
                return;
            }

            // El payload de AnulacionSet recibe una sola HU por solicitud.
            // Validamos que todas las selecciones correspondan a la misma HU.
            var sHuVenum = aSelections[0].HuVenum || "";
            var sHuExidv = aSelections[0].HuExidv || "";

            var bDifferentHu = aSelections.some(function (oItem) {
                return (
                    (oItem.HuVenum || "") !== sHuVenum ||
                    (oItem.HuExidv || "") !== sHuExidv
                );
            });

            if (bDifferentHu) {
                MessageBox.warning(
                    "Las selecciones pertenecen a más de una HU. " +
                    "El servicio de anulación actual recibe una sola HU por solicitud."
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

            if (!sProveedoresSel) {
                MessageBox.warning(
                    "No se encontraron números de proveedor para enviar a la anulación."
                );
                return;
            }

            if (!sEbelnsSel) {
                MessageBox.warning(
                    "No se encontraron pedidos de compra para enviar a la anulación."
                );
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

            var oPayload = {
                MatDoc: sMatDoc,
                HuVenum: sHuVenum,
                HuExidv: sHuExidv,
                ProveedoresSel: sProveedoresSel,
                EbelnsSel: sEbelnsSel
            };

            // =========================================================
            // LOG COMPLETO DEL POST Y DEL JSON QUE SE ENVIARÁ A SAP
            // =========================================================

            var sServiceUrl =
                oModel && oModel.sServiceUrl
                    ? oModel.sServiceUrl
                    : "/sap/opu/odata/sap/ZGP_ANULACION_SRV/";

            var sPostUri =
                sServiceUrl.replace(/\/$/, "") +
                "/AnulacionSet";

            console.group(
                "========== JSON ENVIADO A SAP =========="
            );

            console.log("MÉTODO:");
            console.log("POST");

            console.log("URI ODATA:");
            console.log(sPostUri);

            console.log("DOCUMENTO MATERIAL:");
            console.log(sMatDoc);

            console.log("HU VENUM:");
            console.log(sHuVenum);

            console.log("HU EXIDV:");
            console.log(sHuExidv);

            console.log("CANTIDAD DE PROVEEDORES:");
            console.log(aSelections.length);

            console.log("PROVEEDORES CONCATENADOS:");
            console.log(sProveedoresSel);

            console.log("PEDIDOS CONCATENADOS:");
            console.log(sEbelnsSel);

            console.log("SELECCIONES ORIGINALES:");
            console.table(aSelections);

            console.log("OBJETO PAYLOAD:");
            console.log(oPayload);

            console.log("JSON EXACTO ENVIADO:");
            console.log(
                JSON.stringify(
                    oPayload,
                    null,
                    2
                )
            );

            console.groupEnd();

            console.log(
                "[POST ANULACION][JSON]",
                JSON.stringify(oPayload, null, 2)
            );

            this._logInfo(
                "_postAnulacion",
                "Inicia solicitud de anulación",
                {
                    traceId: sTraceId,
                    path: sPath,
                    payload: oPayload,
                    huSelections: aSelections
                }
            );

            this.getVM().setProperty(
                "/busy",
                true
            );

            this.getVM().setProperty(
                "/detalle",
                []
            );

            // =========================================================
            // ENVÍO A SAP
            // =========================================================

            oModel.create(
                sPath,
                oPayload,
                {
                    success: function (oData) {
                        console.group(
                            "========== RESPUESTA ANULACION SAP =========="
                        );

                        console.log("MÉTODO:");
                        console.log("POST");

                        console.log("URI ODATA:");
                        console.log(sPostUri);

                        console.log("JSON QUE SE ENVIÓ:");
                        console.log(
                            JSON.stringify(
                                oPayload,
                                null,
                                2
                            )
                        );

                        console.log("RESPUESTA COMPLETA SAP:");
                        console.log(oData);

                        console.log("RESPUESTA SAP EN JSON:");
                        try {
                            console.log(
                                JSON.stringify(
                                    oData,
                                    null,
                                    2
                                )
                            );
                        } catch (oResponseJsonError) {
                            console.log(oData);
                        }

                        console.groupEnd();

                        var sStatus =
                            oData && oData.Status
                                ? oData.Status
                                : "S";

                        var sMessage =
                            oData && oData.Message
                                ? oData.Message
                                : "Proceso de anulación ejecutado.";

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
                            "/selectedSection",
                            "detail"
                        );

                        MessageToast.show(
                            "Solicitud de anulación enviada correctamente."
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

                    error: function (oError) {
                        console.group(
                            "========== ERROR ANULACION SAP =========="
                        );

                        console.error("MÉTODO:");
                        console.error("POST");

                        console.error("URI ODATA:");
                        console.error(sPostUri);

                        console.error("JSON QUE SE INTENTÓ ENVIAR:");
                        console.error(
                            JSON.stringify(
                                oPayload,
                                null,
                                2
                            )
                        );

                        console.error("ERROR COMPLETO:");
                        console.error(oError);

                        console.error(
                            "ERROR SERIALIZADO:",
                            this._serializeError(oError)
                        );

                        console.groupEnd();

                        this._logError(
                            "_postAnulacion.error",
                            "Error al ejecutar la anulación",
                            {
                                traceId: sTraceId,
                                payload: oPayload,
                                error: this._serializeError(oError)
                            }
                        );

                        this.getVM().setProperty(
                            "/canCancel",
                            false
                        );

                        this._showODataError(
                            "Error al anular el documento.",
                            oError
                        );
                    }.bind(this)
                }
            );
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
        _getInitialState: function () {
    return {
        matDoc: "",
        canCancel: false,
        busy: false,
        lastRunId: "",
        selectedSection: "preview",

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
            otros: 0,
            huPendientes: 0
        },

        providerDialog: {
            rowPath: "",
            huVenum: "",
            huExidv: "",
            providerCount: 0,
            providers: [],

            // Selección múltiple.
            selectedProviderKeys: [],
            selectedCount: 0,
            canConfirm: false,

            // Compatibilidad con fragmentos/versiones anteriores.
            selectedProviderKey: ""
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

            MessageBox.error(sMessage);
        }
    });
});